/** Pure helpers for Search tab chat + basket parsing. */

import type { BasketInsightsResponse } from "../../api/client";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  meta?: { kind?: "basket_cta" | "info" | "error" };
};

export type ChatEngine = "data" | "general";

export function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

export function cleanAnswer(s: string): string {
  const text = (s ?? "").toString();
  const noFences = text.replace(/```[\s\S]*?```/g, "").trim();
  const collapsed = noFences.replace(/\n{3,}/g, "\n\n").trim();
  return collapsed.length > 1800 ? `${collapsed.slice(0, 1800).trim()}…` : collapsed;
}

/** Short, user-safe copy for chat/stats failures (avoid raw fetch URLs in UI). */
export function friendlyChatError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/Cannot reach backend|failed to fetch|network|Network request failed|cleartext|unable to resolve|load failed/i.test(msg)) {
    return "Can't connect to the server. Check your connection and API settings, then try again.";
  }
  if (/401|Unauthorized|sign in/i.test(msg)) return "Please sign in again.";
  if (/403|Forbidden/i.test(msg)) return "You don't have permission to do that.";
  return "Something went wrong. Please try again.";
}

export function splitBasketItemsFromFreeText(s: string): string[] {
  const raw = (s || "").trim();
  if (!raw) return [];
  const normalized = raw
    .replace(/\r/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+[\).\]]\s+/gm, "");

  const parts = normalized
    .split(/[,\n]/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.replace(/^\s*(\d+\s*x\s+|x\s*\d+\s+|\d+\s+)(?=\S)/i, ""))
    .map((x) => x.replace(/\s{2,}/g, " ").trim())
    .filter((x) => x.length >= 2);

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
  }
  return deduped.slice(0, 30);
}

export function looksLikeBasketList(message: string): boolean {
  const trimmed = (message || "").trim();
  if (!trimmed) return false;
  const hasNewlines = trimmed.includes("\n");
  const hasCommas = trimmed.includes(",");
  const hasBullets = /(^\s*[-*•]\s+\S+)/m.test(trimmed);
  const hasNumbered = /(^\s*\d+[\).\]]\s+\S+)/m.test(trimmed);
  const items = splitBasketItemsFromFreeText(trimmed);
  if (hasNewlines && items.length >= 2) return true;
  return items.length >= 3 && (hasCommas || hasBullets || hasNumbered);
}

export function newMessageId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Human-readable basket finalize summary from server payload (no raw JSON for users).
 */
export function buildBasketFinalizeMessage(res: BasketInsightsResponse): string {
  const lines: string[] = [];
  const est = res.estimatedTotalKnownData;
  const best = res.bestTotalStore;
  const bs = res.bestStore;
  const unmatched = res.unmatchedBasketLines ?? [];
  const matched = res.matchedBasketLines ?? [];

  if (typeof est === "number" && Number.isFinite(est) && est > 0) {
    lines.push(`Estimated total (from your receipt data): ${fmtMoney(est)}`);
  }
  if (best?.storeName && typeof best.estimatedTotal === "number" && Number.isFinite(best.estimatedTotal)) {
    lines.push(`Best single-store trip: ${best.storeName} · about ${fmtMoney(best.estimatedTotal)}`);
  } else if (bs?.enabled && bs.storeName) {
    lines.push(`Suggested store: ${bs.storeName}`);
  }
  if (bs?.itemsMatchedCount != null && bs?.itemsTotalCount != null) {
    lines.push(`Matched ${bs.itemsMatchedCount} of ${bs.itemsTotalCount} basket items to your history.`);
  }
  if (matched.length > 0 && lines.length <= 2) {
    lines.push(`Matched lines: ${matched.slice(0, 6).join(", ")}${matched.length > 6 ? "…" : ""}`);
  }
  if (unmatched.length > 0) {
    lines.push(
      `No price match yet for: ${unmatched.slice(0, 5).join(", ")}${unmatched.length > 5 ? "…" : ""}. Try names closer to your receipts.`
    );
  }
  if (bs?.evidenceSummary && bs.enabled) {
    lines.push(bs.evidenceSummary);
  }
  if (bs?.partialNote) {
    lines.push(bs.partialNote);
  }
  if (bs?.whyNoRecommendation && !best?.storeName) {
    lines.push(bs.whyNoRecommendation);
  }
  if (res.multiStoreRecommendation?.enabled) {
    const m = res.multiStoreRecommendation;
    const ct = m.combinedTotal;
    if (typeof ct === "number" && Number.isFinite(ct)) {
      const saveAmt = m.savingsVsBestSingleStore;
      const save =
        typeof saveAmt === "number" && Number.isFinite(saveAmt)
          ? ` (save ~${fmtMoney(saveAmt)} vs one store)`
          : "";
      lines.push(`Multi-store option: about ${fmtMoney(ct)}${save}.`);
    }
  }

  if (lines.length === 0) {
    return "We don’t have enough priced lines in your history to estimate this basket yet. Scan receipts with clear item prices, then try again.";
  }
  return lines.join("\n\n");
}

export function mergeBasketItems(
  prev: string[],
  items: string[],
  cap = 30
): { next: string[]; addedCount: number } {
  const merged = [...(prev ?? [])];
  let addedCount = 0;
  for (const it of items) {
    if (!it) continue;
    if (merged.length >= cap) break;
    if (merged.some((x) => x.toLowerCase() === it.toLowerCase())) continue;
    merged.push(it);
    addedCount += 1;
  }
  return { next: merged, addedCount };
}
