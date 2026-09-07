import { PrismaClient } from "@prisma/client";

const DEFAULT_DATABASE_URL =
  "postgresql://neondb_owner:npg_V5BenYtrj7LE@ep-shy-star-a5pnqlsg-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

// Single shared Prisma client instance for the whole process.
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith("file:") ? process.env.DATABASE_URL : DEFAULT_DATABASE_URL,
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
