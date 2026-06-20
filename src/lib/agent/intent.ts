// Intent classification. Uses the LLM gateway when configured; otherwise falls
// back to Persian keyword rules so the MVP works with no external services.
import { chat, isLLMEnabled } from "@/lib/llm/provider";
import { normalizePersian } from "@/lib/text/persian";

export type Intent =
  | "faq"
  | "balance"
  | "transactions"
  | "transfer"
  | "human"
  | "smalltalk";

const KEYWORDS: Record<Exclude<Intent, "faq" | "smalltalk">, string[]> = {
  balance: ["موجودی", "مانده", "حساب من", "چقدر دارم", "موجودیم"],
  transactions: ["تراکنش", "گردش", "صورتحساب", "گردش حساب", "آخرین تراکنش"],
  transfer: ["انتقال", "واریز", "حواله", "کارت به کارت", "بفرست", "منتقل"],
  human: ["اپراتور", "پشتیبان", "انسان", "کارشناس", "تماس با"],
};

export async function classifyIntent(raw: string): Promise<Intent> {
  const t = normalizePersian(raw);

  // Fast deterministic path (also the no-LLM fallback).
  for (const [intent, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => t.includes(normalizePersian(w)))) return intent as Intent;
  }

  if (!isLLMEnabled()) {
    // Greetings/thanks -> smalltalk; otherwise treat as a knowledge question.
    if (/^(سلام|درود|خداحافظ|ممنون|مرسی|سپاس)/.test(t)) return "smalltalk";
    return "faq";
  }

  const out = await chat(
    [
      {
        role: "system",
        content:
          'دسته‌بندی پیام کاربر بانکی به یکی از این برچسب‌ها: faq, balance, transactions, transfer, human, smalltalk. فقط JSON برگردان: {"intent":"..."}',
      },
      { role: "user", content: raw },
    ],
    { json: true },
  );
  try {
    const parsed = JSON.parse(out ?? "{}");
    const allowed: Intent[] = ["faq", "balance", "transactions", "transfer", "human", "smalltalk"];
    return allowed.includes(parsed.intent) ? parsed.intent : "faq";
  } catch {
    return "faq";
  }
}
