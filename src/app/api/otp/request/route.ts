import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { issueOtp } from "@/lib/auth/otp";

export const dynamic = "force-dynamic";

// Re-send an OTP for a pending transfer.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { pendingTransferId } = await req.json().catch(() => ({}));
  if (typeof pendingTransferId !== "number") {
    return NextResponse.json({ error: "pendingTransferId required" }, { status: 400 });
  }
  await issueOtp(session.customerId, session.mobile, "transfer", String(pendingTransferId));
  return NextResponse.json({ ok: true });
}
