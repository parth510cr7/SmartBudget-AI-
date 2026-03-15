import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

let _instance: PrismaClient | null = null;

function getPrismaClient(): PrismaClient {
  if (_instance === null) {
    console.log("Checking DB Connection URL:", process.env.DATABASE_URL ? "URL Found" : "URL MISSING");
    const connectionString = process.env.DATABASE_URL ?? "";
    const adapter = new PrismaPg({ connectionString });
    _instance = new PrismaClient({
      adapter,
      log: ["error", "warn"],
    });
  }
  return _instance;
}

export const prisma = getPrismaClient();
