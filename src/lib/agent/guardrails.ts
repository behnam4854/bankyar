// Input/output guardrails: keep the assistant on-topic and never leak PII.
import { normalizePersian } from "@/lib/text/persian";

const JAILBREAK = [
  "ignore previous", "ignore all", "system prompt", "developer mode",
  "نادیده بگیر", "دستورات قبلی", "پرامپت سیستم",
];

// Topics the bank assistant must refuse (out of scope).
const OFF_TOPIC = ["سیاس", "مذهب", "کد بنویس", "شعر", "جوک"];

export function checkInput(raw: string): { allowed: boolean; reason?: string } {
  const t = normalizePersian(raw).toLowerCase();
  if (!t) return { allowed: false, reason: "empty" };
  if (JAILBREAK.some((k) => t.includes(k))) return { allowed: false, reason: "jailbreak" };
  if (OFF_TOPIC.some((k) => t.includes(k))) return { allowed: false, reason: "off_topic" };
  return { allowed: true };
}

// Redact sensitive identifiers before logging or echoing back.
export function redactPII(text: string): string {
  return text
    .replace(/\b\d{16}\b/g, "************۰۰۰۰") // card PAN
    .replace(/IR\d{24}/gi, "IRxx…redacted")    // IBAN / شبا
    .replace(/\b\d{10}\b/g, "**********");      // national id (کد ملی)
}

export const REFUSAL =
  "پوزش می‌خواهم، من دستیار بانکی هستم و فقط می‌توانم به پرسش‌های مربوط به خدمات بانک پاسخ دهم. اگر سؤال بانکی دارید بفرمایید، یا برای موارد دیگر با مرکز ارتباط مشتریان تماس بگیرید.";
