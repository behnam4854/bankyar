import { NextResponse } from "next/server";
import { prisma, audit } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { toEnglishDigits } from "@/lib/text/persian";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { mobile, password } = await req.json().catch(() => ({}));
  const normMobile = toEnglishDigits(String(mobile ?? "")).trim();
  if (!normMobile || !password) {
    return NextResponse.json({ error: "mobile and password required" }, { status: 400 });
  }
  const customer = await prisma.customer.findUnique({ where: { mobile: normMobile } });
  if (!customer || !verifyPassword(String(password), customer.passwordHash)) {
    await audit("login_failed", { mobile: normMobile });
    return NextResponse.json({ error: "اطلاعات ورود نادرست است." }, { status: 401 });
  }
  await setSessionCookie({ customerId: customer.id, mobile: customer.mobile });
  await audit("login_success", null, customer.id);
  return NextResponse.json({ ok: true, name: customer.name });
}
