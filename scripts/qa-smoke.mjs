/**
 * QA smoke tests for SmartBudgetAI (backend APIs).
 *
 * Usage:
 *  - API_BASE="http://localhost:8080" FIREBASE_ID_TOKEN="..." node scripts/qa-smoke.mjs
 *
 * Notes:
 *  - If FIREBASE_ID_TOKEN is not provided, only /health will be tested.
 */
const API_BASE = (process.env.API_BASE || "http://localhost:8080").replace(/\/$/, "");
const TOKEN = process.env.FIREBASE_ID_TOKEN || "";

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

async function httpJson(method, path, body) {
  const url = `${API_BASE}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, text, json };
}

async function main() {
  console.log(`API_BASE=${API_BASE}`);

  // 1) Health check (no auth)
  {
    const { res, json, text } = await httpJson("GET", "/health");
    if (!res.ok) return fail(`/health HTTP ${res.status}: ${text.slice(0, 240)}`);
    const status = json && typeof json.status === "string" ? json.status.toLowerCase() : "";
    if (!json || status !== "ok") return fail(`/health unexpected payload: ${text.slice(0, 240)}`);
    ok("/health");
  }

  if (!TOKEN) {
    console.log("NOTE: FIREBASE_ID_TOKEN not set; skipping authenticated endpoints.");
    return;
  }

  // 2) appQuery: spend by category should return array (can be empty if no receipts)
  {
    const { res, json, text } = await httpJson("POST", "/api/appQuery", { query: "spend by category" });
    if (!res.ok) return fail(`/api/appQuery HTTP ${res.status}: ${text.slice(0, 240)}`);
    if (!json || typeof json.answer !== "string") return fail(`/api/appQuery missing answer: ${text.slice(0, 240)}`);
    if (json.data && json.data.byCategory && !Array.isArray(json.data.byCategory)) return fail("appQuery.data.byCategory is not an array");
    ok("appQuery spend by category");
  }

  // 3) appQuery: spend by store
  {
    const { res, json, text } = await httpJson("POST", "/api/appQuery", { query: "spend by store" });
    if (!res.ok) return fail(`/api/appQuery(store) HTTP ${res.status}: ${text.slice(0, 240)}`);
    if (!json || typeof json.answer !== "string") return fail(`/api/appQuery(store) missing answer: ${text.slice(0, 240)}`);
    if (json.data && json.data.byStore && !Array.isArray(json.data.byStore)) return fail("appQuery.data.byStore is not an array");
    ok("appQuery spend by store");
  }

  // 4) basket suggestions (query-only)
  {
    const { res, json, text } = await httpJson("POST", "/api/basket/suggestions", { query: "milk", limit: 5 });
    if (!res.ok) return fail(`/api/basket/suggestions HTTP ${res.status}: ${text.slice(0, 240)}`);
    if (!Array.isArray(json)) return fail(`/api/basket/suggestions expected array: ${text.slice(0, 240)}`);
    ok("basket suggestions");
  }

  // 5) basket insights / finalize (empty-ish basket but should return structured response)
  {
    const { res, json, text } = await httpJson("POST", "/api/basket/insights", { itemNames: ["milk", "bread"] });
    if (!res.ok) return fail(`/api/basket/insights HTTP ${res.status}: ${text.slice(0, 240)}`);
    if (!json || typeof json !== "object") return fail(`/api/basket/insights expected object: ${text.slice(0, 240)}`);
    ok("basket insights");
  }

  if (!process.exitCode) {
    console.log("ALL SMOKE TESTS PASSED");
  }
}

main().catch((e) => {
  fail(e instanceof Error ? e.stack || e.message : String(e));
});

