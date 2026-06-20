import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { handleMessage } from "@/lib/agent/orchestrator";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { message, conversationId } = await req.json().catch(() => ({}));
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }
  const session = await getSession();
  const result = await handleMessage(
    message.trim(),
    session,
    typeof conversationId === "number" ? conversationId : null,
  );
  return NextResponse.json(result);
}
