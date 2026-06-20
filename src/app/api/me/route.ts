import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ authenticated: false });
  const customer = await prisma.customer.findUnique({ where: { id: session.customerId } });
  return NextResponse.json({ authenticated: true, name: customer?.name ?? "" });
}
