// Banking tool layer — the ONLY place that touches accounts/money.
// Every action is validated (zod), limit-checked, idempotent, and audited.
// The LLM never calls these directly; the orchestrator does, after auth/OTP.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma, audit } from "@/lib/db";
import { add, sub, gte, isPositive } from "@/lib/money";

// Per-transaction limit (IRR). Real deployments read this from policy/core bank.
const MAX_TRANSFER_IRR = "1000000000"; // 100,000,000 Toman

export async function getBalance(customerId: number) {
  const accounts = await prisma.account.findMany({ where: { customerId } });
  return accounts.map((a) => ({ iban: a.iban, type: a.type, balance: a.balance, currency: a.currency }));
}

// Account identifiers (SHEBA/IBAN, card number, type) for the logged-in user.
// Used to answer "شماره شبام چنده؟" with the real value instead of a deflection.
export async function getAccountDetails(customerId: number) {
  const accounts = await prisma.account.findMany({ where: { customerId } });
  await audit("account_details_viewed", { count: accounts.length }, customerId);
  return accounts.map((a) => ({ iban: a.iban, cardNumber: a.cardNumber, type: a.type }));
}

export async function listTransactions(customerId: number, limit = 5) {
  return prisma.transaction.findMany({
    where: { customerId, status: "completed" },
    orderBy: { id: "desc" },
    take: limit,
  });
}

const transferSchema = z.object({
  amount: z.string().regex(/^\d+$/),
  destination: z.string().min(8),
});

// Step 1: create a PENDING transfer after validation. Money does NOT move yet.
// `opts.sourceAccountId` picks the debit account (defaults to the customer's
// first account). `opts.toAccountId` makes it an INTERNAL transfer that will
// also credit that account on execution (own-account transfers).
export async function createPendingTransfer(
  customerId: number,
  input: { amount?: string; destination?: string },
  opts: { sourceAccountId?: number; toAccountId?: number | null } = {},
) {
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "missing_params" };
  const { amount, destination } = parsed.data;

  if (!isPositive(amount)) return { ok: false as const, error: "invalid_amount" };
  if (gte(amount, MAX_TRANSFER_IRR) && amount !== MAX_TRANSFER_IRR)
    return { ok: false as const, error: "over_limit" };

  const account = opts.sourceAccountId
    ? await prisma.account.findFirst({ where: { id: opts.sourceAccountId, customerId } })
    : await prisma.account.findFirst({ where: { customerId } });
  if (!account) return { ok: false as const, error: "missing_params" };
  if (!gte(account.balance, amount)) return { ok: false as const, error: "insufficient_funds" };

  const tx = await prisma.transaction.create({
    data: {
      customerId,
      accountId: account.id,
      toAccountId: opts.toAccountId ?? null,
      type: "transfer",
      amount,
      destination,
      status: "pending",
      idempotencyKey: randomUUID(),
    },
  });
  await audit("transfer_pending", { txId: tx.id, amount, destination }, customerId);
  return { ok: true as const, transactionId: tx.id, amount, destination, fromIban: account.iban };
}

// Step 2: execute a pending transfer (called only after OTP verification).
// Debits the source account, and for internal transfers also credits the
// destination account — all atomically in one DB transaction.
export async function executeTransfer(customerId: number, transactionId: number) {
  const tx = await prisma.transaction.findFirst({
    where: { id: transactionId, customerId, status: "pending" },
  });
  if (!tx) return { ok: false as const, error: "not_found" };

  const account = (await prisma.account.findUnique({ where: { id: tx.accountId } }))!;
  if (!gte(account.balance, tx.amount)) {
    await prisma.transaction.update({ where: { id: tx.id }, data: { status: "failed" } });
    return { ok: false as const, error: "insufficient_funds" };
  }

  const newBalance = await prisma.$transaction(async (db) => {
    const src = await db.account.update({
      where: { id: account.id },
      data: { balance: sub(account.balance, tx.amount) },
    });
    if (tx.toAccountId) {
      const dest = await db.account.findUnique({ where: { id: tx.toAccountId } });
      if (dest) {
        await db.account.update({
          where: { id: dest.id },
          data: { balance: add(dest.balance, tx.amount) },
        });
      }
    }
    await db.transaction.update({ where: { id: tx.id }, data: { status: "completed" } });
    return src.balance;
  });

  await audit("transfer_completed", { txId: tx.id, amount: tx.amount }, customerId);
  return { ok: true as const, newBalance, amount: tx.amount, destination: tx.destination };
}

export { add }; // re-export for callers that format balances
