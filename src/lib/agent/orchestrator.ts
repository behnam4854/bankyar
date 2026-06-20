// Conversation orchestrator: normalize -> guardrails -> intent -> route ->
// guardrails -> persist. The decision-making core of the assistant.
import { prisma, audit } from "@/lib/db";
import type { Session } from "@/lib/auth/session";
import { checkInput, redactPII, REFUSAL } from "@/lib/agent/guardrails";
import { classifyIntent, type Intent } from "@/lib/agent/intent";
import { answerFaq } from "@/lib/agent/rag";
import { getProfile, updateProfile } from "@/lib/agent/profile";
import { extractTransferParams, parseSelfAccount, parseSourceAccount, normalizePersian } from "@/lib/text/persian";
import { getBalance, listTransactions, createPendingTransfer, getAccountDetails } from "@/lib/banking/tools";
import { issueOtp } from "@/lib/auth/otp";
import { formatIRR, gte } from "@/lib/money";

export type ChatResult = {
  reply: string;
  intent: Intent;
  requiresAuth?: boolean;
  requiresOtp?: boolean;
  pendingTransferId?: number;
  devOtp?: string; // dev-only: plaintext OTP so the UI can auto-fill it
  conversationId: number;
};

const LOGIN_PROMPT =
  "برای دسترسی به اطلاعات حساب، لطفاً ابتدا وارد حساب کاربری خود شوید.";

// In-progress multi-turn transfer (slot-filling) stored on the conversation.
type TransferDraft = {
  action: "transfer";
  amount?: string; // IRR
  destination?: string; // card/IBAN string, or "account:savings" | "account:current"
  destinationType?: "card" | "iban" | "self";
  destLabel?: string; // human-readable confirmation label
  source?: "savings" | "current"; // account to pay FROM, if the user named one
};

const CANCEL = /(لغو|کنسل|بیخیال|بی خیال|منصرف|نمیخوام|نمی خوام|نه ممنون|ولش کن|بی‌خیال)/;

async function saveDraft(conversationId: number, draft: TransferDraft | null) {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { draft: draft ? JSON.stringify(draft) : null },
  });
}

export async function handleMessage(
  message: string,
  session: Session | null,
  conversationId: number | null,
): Promise<ChatResult> {
  // Guard against stale sessions: the signed cookie may point at a customer that
  // no longer exists (e.g. after a DB re-seed). Treat such a session as logged
  // out so we don't violate FK constraints on conversation/transaction inserts.
  if (session && !(await prisma.customer.findUnique({ where: { id: session.customerId } }))) {
    session = null;
  }

  // Ensure a conversation exists.
  const conv = conversationId
    ? await prisma.conversation.findUnique({ where: { id: conversationId } })
    : null;
  const conversation =
    conv ??
    (await prisma.conversation.create({ data: { customerId: session?.customerId ?? null } }));

  await prisma.message.create({
    data: { conversationId: conversation.id, role: "user", content: redactPII(message) },
  });

  const result = await route(message, session, conversation.id);

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: redactPII(result.reply),
      intent: result.intent,
    },
  });

  // Learn the customer over time: distill a long-term profile from this
  // exchange. Logged-in only (needs a stable identity), skip trivial smalltalk,
  // and fire-and-forget so it never adds latency or breaks the reply.
  if (session && result.intent !== "smalltalk") {
    void updateProfile(session.customerId, message, result.reply);
  }

  return { ...result, conversationId: conversation.id };
}

async function route(
  message: string,
  session: Session | null,
  conversationId: number,
): Promise<Omit<ChatResult, "conversationId">> {
  const gate = checkInput(message);
  if (!gate.allowed) return { reply: REFUSAL, intent: "faq" };

  const intent = await classifyIntent(message);

  // --- Multi-turn transfer (slot-filling) ---
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { draft: true },
  });
  const draft: TransferDraft | null = conv?.draft ? JSON.parse(conv.draft) : null;

  if (draft?.action === "transfer") {
    const hasSlot = Boolean(
      extractTransferParams(message).amount ||
        extractTransferParams(message).destination ||
        parseSelfAccount(message),
    );
    const cancel = CANCEL.test(normalizePersian(message));
    const strongOther = ["balance", "transactions", "accountinfo", "human"].includes(intent);
    // Continue the transfer unless the user clearly switched to another task.
    if (hasSlot || cancel || intent === "transfer" || !strongOther) {
      return handleTransferDialog(message, session, conversationId, draft);
    }
    await saveDraft(conversationId, null); // topic switch → abandon the draft
  } else if (intent === "transfer") {
    return handleTransferDialog(message, session, conversationId, null);
  }

  switch (intent) {
    case "smalltalk":
      return { reply: "سلام! من دستیار هوشمند بانک‌یار هستم. چطور می‌توانم کمکتان کنم؟", intent };

    case "human":
      return {
        reply:
          "درخواست شما برای گفت‌وگو با کارشناس ثبت شد. به‌زودی یک کارشناس پاسخگوی شما خواهد بود. همچنین می‌توانید با مرکز ارتباط مشتریان ۱۵۵۴ تماس بگیرید.",
        intent,
      };

    case "balance": {
      if (!session) return { reply: LOGIN_PROMPT, intent, requiresAuth: true };
      const accounts = await getBalance(session.customerId);
      const lines = accounts
        .map((a) => `• حساب ${a.type === "savings" ? "پس‌انداز" : "جاری"}: ${formatIRR(a.balance)}`)
        .join("\n");
      return { reply: `موجودی حساب‌های شما:\n${lines}`, intent };
    }

    case "accountinfo": {
      if (!session) return { reply: LOGIN_PROMPT, intent, requiresAuth: true };
      const accounts = await getAccountDetails(session.customerId);
      if (accounts.length === 0) return { reply: "حسابی برای نمایش یافت نشد.", intent };
      const lines = accounts
        .map((a) => {
          const label = a.type === "savings" ? "پس‌انداز" : "جاری";
          return `• حساب ${label}\n   شماره شبا: ${a.iban}\n   شماره کارت: ${a.cardNumber}`;
        })
        .join("\n");
      return {
        reply:
          `اطلاعات حساب‌های شما به شرح زیر است:\n${lines}\n\n` +
          "شماره شبا (که با IR شروع می‌شود) را می‌توانید برای انتقال‌های پایا و ساتنا بین بانک‌ها استفاده کنید.",
        intent,
      };
    }

    case "transactions": {
      if (!session) return { reply: LOGIN_PROMPT, intent, requiresAuth: true };
      const txs = await listTransactions(session.customerId);
      if (txs.length === 0) return { reply: "تراکنشی برای نمایش وجود ندارد.", intent };
      const lines = txs
        .map((t) => `• ${formatIRR(t.amount)} — ${t.type === "transfer" ? "انتقال" : "پرداخت"}`)
        .join("\n");
      return { reply: `آخرین تراکنش‌های شما:\n${lines}`, intent };
    }

    case "faq":
    default: {
      const profile = session ? await getProfile(session.customerId) : "";
      return { reply: await answerFaq(message, { profile }), intent: "faq" };
    }
  }
}

// Multi-turn transfer: collect amount + destination across turns, then finalize
// with OTP. Destination can be a card, an IBAN, or one of the user's own
// accounts ("savings"/"current") which becomes an internal credit transfer.
async function handleTransferDialog(
  message: string,
  session: Session | null,
  conversationId: number,
  draft: TransferDraft | null,
): Promise<Omit<ChatResult, "conversationId">> {
  const intent: Intent = "transfer";
  if (!session) return { reply: LOGIN_PROMPT, intent, requiresAuth: true };

  if (CANCEL.test(normalizePersian(message))) {
    await saveDraft(conversationId, null);
    return { reply: "باشه، درخواست انتقال لغو شد. کار دیگری هست که کمکتان کنم؟", intent };
  }

  // Fill slots from this turn.
  const params = extractTransferParams(message);
  const self = parseSelfAccount(message);
  const src = parseSourceAccount(message);
  const d: TransferDraft = draft ?? { action: "transfer" };
  if (params.amount) d.amount = params.amount;
  if (src) d.source = src;
  if (params.destination) {
    d.destination = params.destination;
    d.destinationType = params.destinationType;
    d.destLabel = `${params.destinationType === "iban" ? "شبا" : "کارت"} ${params.destination}`;
  } else if (self) {
    d.destination = `account:${self}`;
    d.destinationType = "self";
    d.destLabel = self === "savings" ? "حساب پس‌انداز شما" : "حساب جاری شما";
  }

  // Ask for whatever is still missing.
  if (!d.amount && !d.destination) {
    await saveDraft(conversationId, d);
    return {
      reply:
        "حتماً کمکتان می‌کنم. چه مبلغی و به چه مقصدی می‌خواهید منتقل کنید؟ مقصد می‌تواند شماره کارت، شماره شبا یا «حساب پس‌انداز/جاری» خودتان باشد.",
      intent,
    };
  }
  if (!d.destination) {
    await saveDraft(conversationId, d);
    return {
      reply: `مبلغ ${formatIRR(d.amount!)} را به چه مقصدی منتقل کنم؟ شماره کارت، شماره شبا یا «حساب پس‌انداز/جاری» خودتان.`,
      intent,
    };
  }
  if (!d.amount) {
    await saveDraft(conversationId, d);
    return { reply: `چه مبلغی به ${d.destLabel} منتقل شود؟ مثلاً «۵۰۰ هزار تومان».`, intent };
  }

  // All slots present → resolve source/destination accounts and finalize.
  const accounts = await prisma.account.findMany({ where: { customerId: session.customerId } });
  const amount = d.amount!; // guaranteed present by the checks above
  const label = (t: string) => (t === "savings" ? "حساب پس‌انداز شما" : "حساب جاری شما");

  let destinationString = d.destination;
  let confirmLabel = d.destLabel!;
  let toAccountId: number | null = null;

  if (d.destinationType === "self") {
    const destType = d.destination === "account:savings" ? "savings" : "current";
    const destAcc = accounts.find((a) => a.type === destType);
    if (!destAcc) {
      await saveDraft(conversationId, null);
      return { reply: `شما حساب ${destType === "savings" ? "پس‌انداز" : "جاری"} فعالی ندارید.`, intent };
    }
    toAccountId = destAcc.id;
    destinationString = destAcc.iban;
    confirmLabel = label(destAcc.type);
  } else {
    // Card/IBAN: if it actually belongs to the user, make it an internal transfer.
    const own = accounts.find(
      (a) => a.iban === destinationString || a.cardNumber === destinationString,
    );
    if (own) {
      toAccountId = own.id;
      confirmLabel = label(own.type);
    }
  }

  // Resolve the SOURCE account: honor an explicitly named one ("از پس‌اندازم"),
  // otherwise auto-pick an account that actually has the funds (so an empty
  // current account doesn't block a transfer when savings has the money). The
  // source must never be the same as an internal destination.
  let srcAcc = d.source ? accounts.find((a) => a.type === d.source) : undefined;
  if (srcAcc && srcAcc.id === toAccountId) srcAcc = undefined; // can't be both
  if (!srcAcc) {
    const pool = accounts.filter((a) => a.id !== toAccountId);
    srcAcc =
      pool.find((a) => a.type === "current" && gte(a.balance, amount)) ??
      pool.find((a) => gte(a.balance, amount)) ??
      pool.find((a) => a.type === "current") ??
      pool[0];
  }
  if (!srcAcc) {
    await saveDraft(conversationId, null);
    return { reply: "حسابی برای برداشت وجه یافت نشد.", intent };
  }
  const srcLabel = label(srcAcc.type);

  const pending = await createPendingTransfer(
    session.customerId,
    { amount, destination: destinationString },
    { sourceAccountId: srcAcc.id, toAccountId },
  );
  if (!pending.ok) {
    // Let the user re-enter a bad/too-large amount; otherwise drop the draft.
    if (["invalid_amount", "over_limit", "insufficient_funds"].includes(pending.error)) {
      d.amount = undefined;
      await saveDraft(conversationId, d);
    } else {
      await saveDraft(conversationId, null);
    }
    const msg: Record<string, string> = {
      missing_params: "اطلاعات انتقال کامل نیست. لطفاً دوباره تلاش کنید.",
      invalid_amount: "مبلغ واردشده معتبر نیست. لطفاً مبلغ را دوباره بفرمایید.",
      over_limit: "مبلغ درخواستی از سقف مجاز هر انتقال بیشتر است. مبلغ کمتری بفرمایید.",
      insufficient_funds: "موجودی حساب برای این انتقال کافی نیست. مبلغ کمتری بفرمایید.",
    };
    return { reply: msg[pending.error] ?? "امکان ثبت انتقال نبود.", intent };
  }

  await saveDraft(conversationId, null);
  const { devCode } = await issueOtp(
    session.customerId,
    session.mobile,
    "transfer",
    String(pending.transactionId),
  );
  await audit("otp_issued", { txId: pending.transactionId }, session.customerId);
  return {
    reply: `درخواست انتقال ${formatIRR(pending.amount!)} از ${srcLabel} به ${confirmLabel} ثبت شد.\nبرای تأیید، رمز یکبارمصرف را وارد کنید.`,
    intent,
    requiresOtp: true,
    pendingTransferId: pending.transactionId,
    ...(devCode ? { devOtp: devCode } : {}),
  };
}
