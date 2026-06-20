// Retrieval-augmented FAQ answering.
// MVP uses lexical (token-overlap) retrieval over KbChunk so it runs without a
// vector DB. For production, add a pgvector embedding column and replace
// `retrieve()` with semantic search — the answer step stays the same.
import { prisma } from "@/lib/db";
import { chat, isLLMEnabled } from "@/lib/llm/provider";
import { normalizePersian } from "@/lib/text/persian";

const STOP = new Set(["و", "در", "به", "از", "که", "را", "با", "برای", "این", "است", "چه", "چی", "چطور", "آیا"]);

function tokens(s: string): string[] {
  return normalizePersian(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

export type Retrieved = { content: string; title: string; score: number };

export async function retrieve(query: string, k = 3): Promise<Retrieved[]> {
  const qTokens = new Set(tokens(query));
  if (qTokens.size === 0) return [];
  const chunks = await prisma.kbChunk.findMany({ include: { doc: true } });
  return chunks
    .map((c) => {
      const ct = tokens(c.content + " " + c.doc.title);
      const overlap = ct.filter((w) => qTokens.has(w)).length;
      return { content: c.content, title: c.doc.title, score: overlap };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

const NOT_FOUND =
  "متأسفم، پاسخ دقیق این پرسش را در پایگاه دانش پیدا نکردم. می‌توانم شما را به کارشناس پشتیبانی وصل کنم یا با مرکز ارتباط مشتریان ۱۵۵۴ تماس بگیرید.";

export async function answerFaq(
  query: string,
  opts: { profile?: string } = {},
): Promise<string> {
  const docs = await retrieve(query);

  // No LLM configured: stay grounded in the approved KB (extractive fallback).
  if (!isLLMEnabled()) {
    if (docs.length === 0) return NOT_FOUND;
    return `${docs[0].content}\n\n(منبع: ${docs[0].title})`;
  }

  // Open-domain mode: prefer the KB when it has relevant chunks (keeps
  // bank-specific facts accurate), but let the model also answer from its own
  // general banking knowledge when the KB doesn't cover the question.
  const context = docs.length
    ? docs.map((d, i) => `[${i + 1}] ${d.title}: ${d.content}`).join("\n")
    : "(منبع مرتبطی در پایگاه دانش یافت نشد)";

  const system = [
    "تو «بانک‌یار»، دستیار هوشمند و فارسی‌زبانی هستی که داخلِ اپلیکیشن بانک کار می‌کند و کاربر هم‌اکنون وارد حساب خود شده است.",
    "تو می‌توانی همین‌جا و همین حالا کارهای واقعی انجام دهی: نمایش موجودی، نمایش شماره شبا و کارت، فهرست تراکنش‌ها، و انجام انتقال وجه (از جمله بین حساب‌های خودِ کاربر) با تأیید رمز پویا.",
    "بسیار مهم: هرگز کاربر را برای کارهایی که خودت می‌توانی انجام دهی به «شعبه»، «اینترنت‌بانک»، «همراه‌بانک» یا «خودپرداز» ارجاع نده. تو همان دستیارِ داخلِ نرم‌افزار بانک هستی. به‌جای ارجاع، پیشنهاد بده همان‌جا انجامش دهی (مثلاً: «اگر بخواهید همین حالا انتقال را برایتان ثبت می‌کنم؛ کافی است مبلغ و مقصد را بگویید»).",
    "هدف تو کمک واقعی و طبیعی به مشتری است؛ به سؤالات از پیش‌تعریف‌شده محدود نیستی و می‌توانی فراتر از آن‌ها پاسخ بدهی.",
    "اگر «منابع» زیر به پرسش مربوط بودند، پاسخ را بر همان‌ها استوار کن؛ در غیر این صورت با دانش عمومی بانکی خودت پاسخ بده.",
    "برای اعداد دقیق و متغیر (مثل نرخ سود، کارمزد یا سقف‌ها) اگر مطمئن نیستی عدد قطعی نساز.",
    "فقط برای کارهایی که واقعاً خارج از توان توست (مثل صدور فیزیکی کارت، رفع سوءاثر چک، یا اختلافات حقوقی) کاربر را به شعبه یا مرکز ۱۵۵۴ راهنمایی کن.",
    "همیشه محترمانه، روشن و به فارسی پاسخ بده. پاسخ را کوتاه و کاربردی نگه دار و از توضیح اضافی و تکراری بپرهیز.",
    opts.profile
      ? `آنچه از گفتگوهای قبلی درباره این مشتری می‌دانیم (برای شخصی‌سازی لحن و پاسخ از آن استفاده کن): ${opts.profile}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const out = await chat([
    { role: "system", content: system },
    { role: "user", content: `پرسش: ${query}\n\nمنابع:\n${context}` },
  ]);
  // Guard against null (gateway error) or empty content (reasoning model that
  // ran out of room): fall back to the best KB snippet rather than show blank.
  if (out && out.trim()) return out;
  return docs[0] ? `${docs[0].content}\n\n(منبع: ${docs[0].title})` : NOT_FOUND;
}
