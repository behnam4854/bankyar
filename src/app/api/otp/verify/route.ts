import { NextResponse } from "next/server";
import { audit } from "@/lib/db";
import { getSession } from "@/lib/auth/session";
import { verifyOtp } from "@/lib/auth/otp";
import { executeTransfer } from "@/lib/banking/tools";
import { toEnglishDigits } from "@/lib/text/persian";
import { formatIRR } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const pendingTransferId = Number(body.pendingTransferId);
  const code = toEnglishDigits(String(body.code ?? "")).trim();
  if (!pendingTransferId || !code) {
    return NextResponse.json({ error: "pendingTransferId and code required" }, { status: 400 });
  }

  const ok = await verifyOtp(session.customerId, String(pendingTransferId), code);
  if (!ok) {
    await audit("otp_failed", { txId: pendingTransferId }, session.customerId);
    return NextResponse.json({ ok: false, reply: "رمز واردشده نادرست یا منقضی شده است." });
  }

  const result = await executeTransfer(session.customerId, pendingTransferId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, reply: "انتقال ناموفق بود. لطفاً دوباره تلاش کنید." });
  }
  return NextResponse.json({
    ok: true,
    reply: `✅ انتقال ${formatIRR(result.amount)} با موفقیت انجام شد. موجودی جدید: ${formatIRR(result.newBalance)}`,
  });
}
