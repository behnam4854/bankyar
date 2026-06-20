// Prisma client singleton — avoids exhausting connections during Next.js HMR.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

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
