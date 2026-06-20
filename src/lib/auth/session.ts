// Minimal signed-cookie session (HMAC, no external deps).
// For an MVP this keeps the auth surface small and fully auditable; swap for
// Auth.js v5 when adding SSO / multiple providers.
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "bankyar_session";
const MAX_AGE = 60 * 60 * 8; // 8h

function secret(): string {
  return process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export type Session = { customerId: number; mobile: string; iat: number };

export function createToken(session: Omit<Session, "iat">): string {
  const body = Buffer.from(
    JSON.stringify({ ...session, iat: Date.now() }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string): Session | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
    if (Date.now() - s.iat > MAX_AGE * 1000) return null;
    return s;
  } catch {
    return null;
  }
}

// Read the current session from the request cookies (Next 15: cookies() is async).
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? verifyToken(token) : null;
}

export async function setSessionCookie(session: Omit<Session, "iat">) {
  (await cookies()).set(COOKIE, createToken(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}
