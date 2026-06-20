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

export async function answerFaq(query: string): Promise<string> {
  const docs = await retrieve(query);
  if (docs.length === 0) return NOT_FOUND;

  if (!isLLMEnabled()) {
    // Extractive fallback: return the best-matching approved snippet verbatim.
    return `${docs[0].content}\n\n(منبع: ${docs[0].title})`;
  }

  const context = docs.map((d, i) => `[${i + 1}] ${d.title}: ${d.content}`).join("\n");
  const out = await chat([
    {
      role: "system",
      content:
        "تو دستیار بانکی فارسی‌زبان هستی. فقط بر اساس «منابع» زیر و به زبان فارسی محترمانه پاسخ بده. اگر پاسخ در منابع نبود، صادقانه بگو که نمی‌دانی. هیچ اطلاعاتی از خودت نساز.",
    },
    { role: "user", content: `پرسش: ${query}\n\nمنابع:\n${context}` },
  ]);
  return out ?? `${docs[0].content}\n\n(منبع: ${docs[0].title})`;
}
