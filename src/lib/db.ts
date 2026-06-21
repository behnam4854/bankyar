// Prisma client singleton — avoids exhausting connections during Next.js HMR.
// Uses Turso (via the libSQL driver adapter) when TURSO_DATABASE_URL is set
// (production/Vercel); falls back to the local SQLite file otherwise (dev).
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql/web";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const logLevels = (process.env.NODE_ENV === "development"
    ? ["error", "warn"]
    : ["error"]) as ("error" | "warn")[];

  if (process.env.TURSO_DATABASE_URL) {
    const adapter = new PrismaLibSQL({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return new PrismaClient({ adapter, log: logLevels });
  }

  return new PrismaClient({ log: logLevels });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function audit(
  action: string,
  detail?: unknown,
  customerId?: number | null,
  ip?: string | null,
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        detail: detail ? JSON.stringify(detail) : null,
        customerId: customerId ?? null,
        ip: ip ?? null,
      },
    });
  } catch {
    // never let audit failure break the request
  }
}
