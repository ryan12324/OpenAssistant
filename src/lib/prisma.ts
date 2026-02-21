import { PrismaClient } from "@prisma/client";
import { getLogger } from "@/lib/logger";

const log = getLogger("prisma");

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const isNew = !globalForPrisma.prisma;
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (isNew) {
  log.info("PrismaClient created", { env: process.env.NODE_ENV });
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  log.debug("PrismaClient cached on globalThis (dev mode)");
}
