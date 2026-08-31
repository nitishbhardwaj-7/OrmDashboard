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

