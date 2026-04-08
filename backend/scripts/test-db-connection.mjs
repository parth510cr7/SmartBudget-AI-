import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const preferDirect =
  process.env.USE_DIRECT_URL === "1" || process.env.USE_DIRECT_URL === "true";
const direct = process.env.DIRECT_URL?.trim();
const pooled = process.env.DATABASE_URL?.trim();
const cs = preferDirect && direct ? direct : pooled || direct || "";

if (!cs) {
  console.error("No DATABASE_URL or DIRECT_URL in .env");
  process.exit(1);
}

console.log("Using:", preferDirect && direct ? "DIRECT_URL" : pooled ? "DATABASE_URL" : "DIRECT_URL (fallback)");

const adapter = new PrismaPg({ connectionString: cs });
const prisma = new PrismaClient({ adapter, log: ["error"] });

try {
  const r = await prisma.$queryRaw`SELECT 1 AS ok`;
  console.log("DB OK:", r);
} catch (e) {
  console.error("DB FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
