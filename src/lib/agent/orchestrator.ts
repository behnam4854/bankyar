// Conversation orchestrator: normalize -> guardrails -> intent -> route ->
// guardrails -> persist. The decision-making core of the assistant.
import { prisma, audit } from "@/lib/db";
import type { Session } from "@/lib/auth/session";
import { checkInput, redactPII, REFUSAL } from "@/lib/agent/guardrails";
import { classifyIntent, type Intent } from "@/lib/agent/intent";
import { answerFaq } from "@/lib/agent/rag";
import { extractTransferParams } from "@/lib/text/persian";
import { getBalance, listTransactions, createPendingTransfer } from "@/lib/banking/tools";
import { issueOtp } from "@/lib/auth/otp";
import { formatIRR } from "@/lib/money";

export type ChatResult = {
  reply: string;
  intent: Intent;
  requiresAuth?: boolean;
  requiresOtp?: boolean;
  pendingTransferId?: number;
  conversationId: number;
};

const LOGIN_PROMPT =
  "برای دسترسی به اطلاعات حساب، لطفاً ابتدا وارد حساب کاربری خود شوید.";

export async function handleMessage(
  message: string,
  session: Session | null,
  conversationId: number | null,
): Promise<ChatResult> {
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

    case "transactions": {
      if (!session) return { reply: LOGIN_PROMPT, intent, requiresAuth: true };
      const txs = await listTransactions(session.customerId);
      if (txs.length === 0) return { reply: "تراکنشی برای نمایش وجود ندارد.", intent };
      const lines = txs
        .map((t) => `• ${formatIRR(t.amount)} — ${t.type === "transfer" ? "انتقال" : "پرداخت"}`)
        .join("\n");
      return { reply: `آخرین تراکنش‌های شما:\n${lines}`, intent };
    }

    case "transfer": {
      if (!session) return { reply: LOGIN_PROMPT, intent, requiresAuth: true };
      const params = extractTransferParams(message);
      const pending = await createPendingTransfer(session.customerId, params);
      if (!pending.ok) {
        const msg: Record<string, string> = {
          missing_params:
            "برای انتقال وجه، لطفاً مبلغ و شماره کارت یا شبای مقصد را بفرمایید. مثال: «۵۰۰ هزار تومان به ۶۰۳۷۹۹۱۱۱۱۱۱۱۱۱۱ منتقل کن».",
          invalid_amount: "مبلغ واردشده معتبر نیست.",
          over_limit: "مبلغ درخواستی از سقف مجاز هر انتقال بیشتر است.",
          insufficient_funds: "موجودی حساب برای این انتقال کافی نیست.",
        };
        return { reply: msg[pending.error] ?? "امکان ثبت انتقال نبود.", intent };
      }
      await issueOtp(session.customerId, session.mobile, "transfer", String(pending.transactionId));
      await audit("otp_issued", { txId: pending.transactionId }, session.customerId);
      return {
        reply: `درخواست انتقال ${formatIRR(pending.amount!)} به مقصد ${pending.destination} ثبت شد.\nبرای تأیید، رمز یکبارمصرفی که پیامک شد را وارد کنید.`,
        intent,
        requiresOtp: true,
        pendingTransferId: pending.transactionId,
      };
    }

    case "faq":
    default:
      return { reply: await answerFaq(message), intent: "faq" };
  }
}
