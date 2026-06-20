// Intent classification — fully deterministic (keyword rules), so it adds ZERO
// latency. Account actions (balance/transactions/transfer/human) are matched by
// Persian keywords; everything else falls through to `faq`, which is open-domain
// and handles general questions via the LLM. This keeps the common path to a
// single LLM call (the answer) instead of two (classify + answer).
import { normalizePersian, hasTransferDestination } from "@/lib/text/persian";

export type Intent =
  | "faq"
  | "balance"
  | "transactions"
  | "transfer"
  | "accountinfo"
  | "human"
  | "smalltalk";

// Order matters: the first matching group wins. `accountinfo` is checked before
// `transfer` so "شماره شبام" / "شماره کارتم" (the user's OWN identifiers) aren't
// swallowed by transfer keywords. Its keywords use possessive forms to avoid
// matching a destination card/IBAN in a transfer request.
const KEYWORDS: Record<Exclude<Intent, "faq" | "smalltalk">, string[]> = {
  accountinfo: [
    "شبا", "شبام", "iban", "شماره حسابم", "شماره حساب من", "حساب من چنده",
    "شماره کارتم", "شماره کارت من", "کارتم چنده", "کارت من چنده",
  ],
  balance: ["موجودی", "مانده", "حساب من", "چقدر دارم", "موجودیم", "چقدر پول", "پولم چقدر", "حسابم چقدر"],
  transactions: ["تراکنش", "گردش", "صورتحساب", "گردش حساب", "آخرین تراکنش", "تراکنش‌هام", "تراکنشام", "واریزی"],
  transfer: ["انتقال", "حواله", "کارت به کارت", "بفرست", "منتقل", "واریز کن", "پول بفرست"],
  human: ["اپراتور", "پشتیبان", "انسان", "کارشناس", "تماس با", "آدم واقعی"],
};

// No \b here: JS word boundaries are ASCII-only and never match after a Persian
// letter, which would let every greeting fall through to a (slow) LLM call.
const GREETING = /^(سلام|درود|خداحافظ|ممنون|مرسی|سپاس)/;

// Async signature kept for the orchestrator's call site (no awaiting work here).
export async function classifyIntent(raw: string): Promise<Intent> {
  const t = normalizePersian(raw);

  for (const [intent, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => t.includes(normalizePersian(w)))) return intent as Intent;
  }

  // A card/IBAN in the message (without an accountinfo keyword above) is almost
  // always a transfer destination — route there even without a verb like «بفرست».
  if (hasTransferDestination(raw)) return "transfer";

  if (GREETING.test(t)) return "smalltalk";
  return "faq";
}
