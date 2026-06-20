// Intent classification — hybrid for the best of both worlds:
//   1. Keyword fast-path (zero latency) for the common, unambiguous phrasings.
//   2. Capability-aware LLM fallback for anything the keywords miss, so complex
//      account requests ("move money between my accounts") are routed to a real
//      action instead of dropping to a generic FAQ deflection.
import { chat, isLLMEnabled } from "@/lib/llm/provider";
import {
  normalizePersian,
  hasTransferDestination,
  extractTransferParams,
  parseSelfAccount,
} from "@/lib/text/persian";

export type Intent =
  | "faq"
  | "balance"
  | "transactions"
  | "transfer"
  | "accountinfo"
  | "human"
  | "smalltalk";

const ALL: Intent[] = ["faq", "balance", "transactions", "transfer", "accountinfo", "human", "smalltalk"];

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
  transfer: [
    "انتقال", "حواله", "کارت به کارت", "بفرست", "منتقل", "واریز کن", "پول بفرست",
    "جابجا", "جابه جا", "جا به جا", "بین حساب", "بین حسابهام", "بین حساب هام",
    "پول بده به", "بریز به", "واریز به",
  ],
  human: ["اپراتور", "پشتیبان", "انسان", "کارشناس", "تماس با", "آدم واقعی"],
};

const GREETING = /^(سلام|درود|خداحافظ|ممنون|مرسی|سپاس)$/;

const TRANSFER_VERBS = [
  "انتقال", "منتقل", "حواله", "بفرست", "بزن به", "بزن", "جابجا", "جابه جا",
  "واریز کن", "بریز", "پول بده به", "پرداخت کن به",
];

// A message is a transfer if it carries a real destination (card/IBAN), or an
// explicit transfer verb, or an amount aimed at one of the user's own accounts.
// Checked BEFORE keyword matching so it beats accountinfo on phrasings like
// "از شماره حسابم ۵۰۰ تومن بزن به شبای ..." (which mentions «شماره حسابم»).
function looksLikeTransfer(raw: string): boolean {
  if (hasTransferDestination(raw)) return true;
  const t = normalizePersian(raw);
  if (TRANSFER_VERBS.some((v) => t.includes(normalizePersian(v)))) return true;
  if (extractTransferParams(raw).amount && parseSelfAccount(raw)) return true;
  return false;
}

export async function classifyIntent(raw: string): Promise<Intent> {
  const t = normalizePersian(raw);

  // 0. Transfer signals take priority over keyword matching.
  if (looksLikeTransfer(raw)) return "transfer";

  // 1. Fast keyword path.
  for (const [intent, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => t.includes(normalizePersian(w)))) return intent as Intent;
  }

  // Pure greeting (whole message) → smalltalk, no LLM needed.
  if (GREETING.test(t)) return "smalltalk";

  // 2. LLM fallback for everything else — gives real reasoning to complex,
  // account-related requests the keywords couldn't catch.
  if (isLLMEnabled()) {
    const out = await chat(
      [
        {
          role: "system",
          content:
            "تو موتور مسیریابیِ یک دستیار بانکی هستی که داخل اپلیکیشن بانک کار می‌کند و کاربر از قبل وارد حساب خود شده است. " +
            "این دستیار واقعاً می‌تواند کارهای حساب را انجام دهد، پس درخواست‌های عملیاتی را هرگز به faq نسپار. " +
            "پیام کاربر را دقیقاً در یکی از این برچسب‌ها قرار بده:\n" +
            "- balance: موجودی یا مانده حساب کاربر\n" +
            "- transactions: تراکنش‌ها یا گردش حساب کاربر\n" +
            "- accountinfo: شماره شبا، کارت یا حساب خودِ کاربر\n" +
            "- transfer: هر درخواست جابجایی یا انتقال پول (شامل انتقال بین حساب‌های خودِ کاربر، یا به کارت/شبا/حساب دیگران)\n" +
            "- human: درخواست گفتگو با کارشناس انسانی\n" +
            "- smalltalk: سلام، تشکر، گپ کوتاه\n" +
            "- faq: فقط پرسش‌های اطلاعاتی و آموزشی درباره مفاهیم یا خدمات بانکی (نه انجام کار)\n" +
            'فقط JSON برگردان: {"intent":"..."}',
        },
        { role: "user", content: raw },
      ],
      { json: true, temperature: 0 },
    );
    try {
      const parsed = JSON.parse(out ?? "{}");
      if (ALL.includes(parsed.intent)) return parsed.intent as Intent;
    } catch {
      /* fall through */
    }
  }

  return "faq";
}
