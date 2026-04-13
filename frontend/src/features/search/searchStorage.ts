import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ChatMessage } from "./searchUtils";

const STORAGE_KEY = "smartbudget_search_chat_v1";
const LEAVE_PREF_KEY = "smartbudget_search_leave_pref_v1";

const MAX_MESSAGES = 100;

/** Whether chat is kept when navigating away from Assistant, or cleared on blur. */
export type SearchChatLeaveBehavior = "persist" | "clear_on_leave";

/** Insights = analytics only. Chat = messages + composer. */
export type SearchScreenMode = "insights" | "chat";

export type PersistedSearchState = {
  messages: ChatMessage[];
  searchMode?: SearchScreenMode;
};

function sanitizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const o = m as Record<string, unknown>;
    if (o.role !== "user" && o.role !== "assistant") continue;
    if (typeof o.text !== "string" || typeof o.id !== "string") continue;
    const createdAt = typeof o.createdAt === "number" ? o.createdAt : Date.now();
    let meta: ChatMessage["meta"] = undefined;
    if (o.meta && typeof o.meta === "object" && o.meta !== null && "kind" in o.meta) {
      const k = (o.meta as { kind?: string }).kind;
      if (k === "basket_cta" || k === "info" || k === "error") meta = { kind: k };
    }
    out.push({
      id: o.id,
      role: o.role,
      text: o.text,
      createdAt,
      meta,
    });
  }
  return out.slice(-MAX_MESSAGES);
}

export async function loadSearchChatState(): Promise<PersistedSearchState | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedSearchState> & { chatEngine?: unknown };
    const messages = sanitizeMessages(parsed.messages);
    const searchMode: SearchScreenMode = parsed.searchMode === "chat" ? "chat" : "insights";
    return { messages, searchMode };
  } catch {
    return null;
  }
}

export async function saveSearchChatState(state: PersistedSearchState): Promise<void> {
  try {
    const trimmed: PersistedSearchState = {
      ...state,
      messages: state.messages.slice(-MAX_MESSAGES),
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

export async function clearSearchChatStorage(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export async function loadSearchLeavePreference(): Promise<SearchChatLeaveBehavior> {
  try {
    const raw = await AsyncStorage.getItem(LEAVE_PREF_KEY);
    if (raw === "clear_on_leave") return "clear_on_leave";
    return "persist";
  } catch {
    return "persist";
  }
}

export async function saveSearchLeavePreference(behavior: SearchChatLeaveBehavior): Promise<void> {
  try {
    await AsyncStorage.setItem(LEAVE_PREF_KEY, behavior);
  } catch {
    /* ignore */
  }
}
