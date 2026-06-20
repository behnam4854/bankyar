// One-time password (رمز پویا style) for transaction step-up auth.
import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { sendSms } from "@/lib/sms/provider";

const TTL_MS = 2 * 60 * 1000; // 2 minutes

function hash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

// Returns { devCode } — the plaintext code ONLY in dev (no SMS provider set), so
// the UI can auto-fill it for testing. In production the code is sent by SMS and
// devCode is null (the code never leaves the server).
export async function issueOtp(
  customerId: number,
  mobile: string,
  purpose: string,
  refId: string,
): Promise<{ devCode: string | null }> {
  const code = String(randomInt(100000, 1000000)); // 6 digits
  await prisma.otp.create({
    data: {
      customerId,
      purpose,
      refId,
      codeHash: hash(code),
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });

  const smsConfigured = Boolean(process.env.SMS_PROVIDER && process.env.SMS_API_KEY);
  if (smsConfigured) {
    await sendSms(mobile, `رمز یکبارمصرف بانک‌یار: ${code}\nاین رمز را با کسی به اشتراک نگذارید.`);
    return { devCode: null };
  }
  // Dev: don't print to console; hand the code back so the client can auto-fill.
  return { devCode: code };
}

export async function verifyOtp(
  customerId: number,
  refId: string,
  code: string,
): Promise<boolean> {
  const otp = await prisma.otp.findFirst({
    where: { customerId, refId, consumed: false },
    orderBy: { id: "desc" },
  });
  if (!otp) return false;
  if (otp.expiresAt.getTime() < Date.now()) return false;
  if (otp.codeHash !== hash(code)) return false;
  await prisma.otp.update({ where: { id: otp.id }, data: { consumed: true } });
  return true;
}
