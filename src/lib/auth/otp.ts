// One-time password (رمز پویا style) for transaction step-up auth.
import { createHash, randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { sendSms } from "@/lib/sms/provider";

const TTL_MS = 2 * 60 * 1000; // 2 minutes

function hash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export async function issueOtp(
  customerId: number,
  mobile: string,
  purpose: string,
  refId: string,
): Promise<void> {
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
  await sendSms(mobile, `رمز یکبارمصرف بانک‌یار: ${code}\nاین رمز را با کسی به اشتراک نگذارید.`);
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
