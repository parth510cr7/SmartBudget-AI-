import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

let _instance: PrismaClient | null = null;

/** Warn when Supabase pooler URL likely has wrong username (common cause of XX000 Tenant or user not found). */
function warnIfSupabasePoolerUsernameLooksWrong(connectionString: string): void {
  if (!connectionString.includes("pooler.supabase.com")) return;
  try {
    const u = new URL(connectionString.replace(/^postgresql:/i, "http:"));
    const user = decodeURIComponent(u.username || "");
    if (user === "postgres" || user === "") {
      console.warn(
        "[db] Supabase pooler: username should be postgres.<PROJECT_REF> from Dashboard → Connect → Connection string, not plain \"postgres\". Or use direct host db.<ref>.supabase.co:5432 with user postgres."
      );
    }
  } catch {
    /* ignore */
  }
}

/**
 * Chooses Postgres URL for PrismaPg.
 * Default: DATABASE_URL first (Supabase pooler or hosted URL). If only DIRECT_URL is set, use it.
 * Set USE_DIRECT_URL=true to prefer DIRECT_URL when both are set (e.g. direct db.*.supabase.co:5432).
 */
function getPostgresConnectionString(): string {
  const direct = process.env.DIRECT_URL?.trim();
  const pooled = process.env.DATABASE_URL?.trim();
  const preferDirect =
    process.env.USE_DIRECT_URL === "1" || process.env.USE_DIRECT_URL === "true";

  if (preferDirect && direct) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[db] Using DIRECT_URL (USE_DIRECT_URL=true).");
    }
    return direct;
  }
  if (pooled) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[db] Using DATABASE_URL for Postgres.");
    }
    return pooled;
  }
  if (direct) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[db] Using DIRECT_URL (no DATABASE_URL set).");
    }
    return direct;
  }
  return "";
}

function getPrismaClient(): PrismaClient {
  if (_instance === null) {
    const connectionString = getPostgresConnectionString();
    console.log("Checking DB Connection URL:", connectionString ? "URL Found" : "URL MISSING");
    if (connectionString) warnIfSupabasePoolerUsernameLooksWrong(connectionString);
    const adapter = new PrismaPg({ connectionString });
    _instance = new PrismaClient({
      adapter,
      log: ["error", "warn"],
    });
  }
  return _instance;
}

export const prisma = getPrismaClient();
