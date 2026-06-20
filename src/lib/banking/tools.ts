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
export async function createPendingTransfer(
  customerId: number,
  input: { amount?: string; destination?: string },
) {
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "missing_params" };
  const { amount, destination } = parsed.data;

  if (!isPositive(amount)) return { ok: false as const, error: "invalid_amount" };
  if (gte(amount, MAX_TRANSFER_IRR) && amount !== MAX_TRANSFER_IRR)
    return { ok: false as const, error: "over_limit" };

  const account = (await prisma.account.findFirst({ where: { customerId } }))!;
  if (!gte(account.balance, amount)) return { ok: false as const, error: "insufficient_funds" };

  const tx = await prisma.transaction.create({
    data: {
      customerId,
      accountId: account.id,
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

  const [updated] = await prisma.$transaction([
    prisma.account.update({
      where: { id: account.id },
      data: { balance: sub(account.balance, tx.amount) },
    }),
    prisma.transaction.update({ where: { id: tx.id }, data: { status: "completed" } }),
  ]);
  await audit("transfer_completed", { txId: tx.id, amount: tx.amount }, customerId);
  return { ok: true as const, newBalance: updated.balance, amount: tx.amount, destination: tx.destination };
}

export { add }; // re-export for callers that format balances
