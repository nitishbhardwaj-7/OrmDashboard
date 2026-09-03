import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";

// Single shared Prisma client instance for the whole process, explicitly configured with env.DATABASE_URL.
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: env.DATABASE_URL,
    },
  },
});

/**
/ Executes a database query with automatic single retry for transient Neon PostgreSQL cold start/network connection drops (P1001).
 */
export async function withDbRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      const isTransientConnError = err?.code === "P1001" || err?.message?.includes("Can't reach database server");
      if (isTransientConnError && attempt <= maxRetries) {
        console.warn(`⚠️ [Prisma DB] Transient connection error (P1001). Retrying attempt ${attempt}/${maxRetries}...`);
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      throw err;
    }
  }
}
