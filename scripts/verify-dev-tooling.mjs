/**
 * One-shot dev tooling check: Firebase CLI login, env files, Postgres (Prisma).
 * Run from repo root: node scripts/verify-dev-tooling.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function sh(command, args, cwd = root) {
  const r = spawnSync(command, args, {
    encoding: "utf8",
    shell: true,
    cwd,
    maxBuffer: 2 * 1024 * 1024,
  });
  return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

let exitCode = 0;

console.log("=== SmartBudgetAI — dev tooling check ===\n");

console.log("[1] Firebase CLI (needed for Firebase MCP: list projects, Auth, etc.)");
const fb = sh("npx", ["-y", "firebase-tools@latest", "login:list"]);
if (/No authorized accounts|not logged|No authorized/i.test(fb.out)) {
  console.log("  STATUS: NOT LOGGED IN — MCP tools that need a Google account will fail until you fix this.");
  console.log("  FIX:    npx firebase-tools@latest login");
  console.log("  Or:     In Cursor, run Firebase MCP tool `firebase_login`, open the URL, paste the auth code when prompted.\n");
  exitCode = 1;
} else if (fb.code !== 0) {
  console.log("  STATUS: UNKNOWN (command issue)\n", fb.out.slice(-400));
  exitCode = 1;
} else {
  console.log("  STATUS: OK");
  console.log(fb.out.trim().split("\n").slice(0, 8).join("\n"), "\n");
}

console.log("[2] Env files (copy from *.env.example; never commit secrets)");
for (const rel of ["backend/.env", "frontend/.env"]) {
  const ok = existsSync(path.join(root, rel));
  console.log(`  ${ok ? "✓" : "✗"} ${rel}`);
  if (!ok) exitCode = 1;
}

console.log("\n[3] Postgres (backend DATABASE_URL / DIRECT_URL in backend/.env)");
const dbScript = path.join(root, "backend", "scripts", "test-db-connection.mjs");
if (!existsSync(dbScript)) {
  console.log("  SKIP: backend/scripts/test-db-connection.mjs missing\n");
} else {
  // Use `node` on PATH — avoids Windows path-with-spaces issues with process.execPath as argv[0]
  const db = sh("node", [dbScript], path.join(root, "backend"));
  if (db.code === 0) {
    console.log("  STATUS: OK\n");
  } else {
    console.log("  STATUS: FAILED — fix Supabase URI / credentials (see backend/.env.example).\n");
    console.log(db.out.slice(-600));
    exitCode = 1;
  }
}

console.log("=== End (exit " + exitCode + ") ===");
process.exit(exitCode);
