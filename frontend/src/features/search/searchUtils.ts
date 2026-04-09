/** Pure helpers for Search tab chat + basket parsing. */

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
