// Prisma 7 config: CLI uses DIRECT_URL for migrate/push (no pooler).
// Your app uses DATABASE_URL (pooled) when instantiating PrismaClient.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
