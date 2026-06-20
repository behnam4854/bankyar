// Long-term customer profile: the assistant's "memory" of a customer across
// sessions. After each substantive turn we ask the LLM to merge the existing
// profile with the latest exchange into a short, durable Persian summary.
//
// Privacy: the prompt forbids storing sensitive data (card/account numbers,
// IBAN, OTPs, balances). The profile is purely about preferences and intent.
import { prisma } from "@/lib/db";
import { chat, isLLMEnabled } from "@/lib/llm/provider";

export async function getProfile(customerId: number): Promise<string> {
  const p = await prisma.customerProfile.findUnique({ where: { customerId } });
  return p?.summary ?? "";
}

// Best-effort: updates the profile from the latest exchange. Never throws —
// callers fire-and-forget so the chat flow is never blocked or broken by it.
export async function updateProfile(
  customerId: number,
  userMessage: string,
  assistantReply: string,
): Promise<void> {
  if (!isLLMEnabled()) return;
  try {
    const existing = await getProfile(customerId);
    const out = await chat(
      [
        {
          role: "system",
          content:
            "تو پروفایل بلندمدت یک مشتری بانک را نگه‌داری می‌کنی تا دستیار در دفعات بعد بهتر و شخصی‌تر کمک کند. " +
            "بر اساس «پروفایل فعلی» و «آخرین گفتگو»، یک پروفایل کوتاه و به‌روزشده به فارسی بساز که شامل این موارد باشد: " +
            "لحن و زبان موردعلاقه مشتری (رسمی/محاوره‌ای)، موضوعات و خدماتی که بیشتر دنبال می‌کند، و واقعیت‌های ماندگار درباره نیازهایش. " +
            "اطلاعات حساس مثل شماره کارت، شماره حساب، شبا، رمز و مبلغ موجودی را هرگز ذخیره نکن. " +
            "اطلاعات قبلی همچنان معتبر را حفظ کن و موارد جدید را اضافه کن. حداکثر ۶ مورد کوتاه. فقط متن نهایی پروفایل را برگردان، بدون توضیح اضافه.",
        },
        {
          role: "user",
          content: `پروفایل فعلی:\n${existing || "(خالی)"}\n\nآخرین گفتگو:\nمشتری: ${userMessage}\nدستیار: ${assistantReply}`,
        },
      ],
      { temperature: 0.1 },
    );
    const summary = (out ?? "").trim();
    if (!summary) return;
    await prisma.customerProfile.upsert({
      where: { customerId },
      create: { customerId, summary },
      update: { summary },
    });
  } catch {
    // Best-effort memory: swallow errors so a failed profile update never
    // affects the customer's actual answer.
  }
}
