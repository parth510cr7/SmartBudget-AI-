/** Backend base URL: app.json extra.apiUrl > EXPO_PUBLIC_API_URL in .env > BASE_URL (physical device). Backend runs on port 8080. */
const BASE_URL = "http://10.0.0.47:8080";

function getBaseURL(): string {
  try {
    const Constants = require("expo-constants").default;
    const extra = (Constants.expoConfig?.extra as { apiUrl?: string }) ?? {};
    if (extra.apiUrl?.trim()) return extra.apiUrl.trim().replace(/\/$/, "");
  } catch (_) {}
  if (typeof process !== "undefined" && process.env?.EXPO_PUBLIC_API_URL?.trim())
    return process.env.EXPO_PUBLIC_API_URL.trim().replace(/\/$/, "");
  return BASE_URL;
}
const baseURL = getBaseURL();
const REQUEST_TIMEOUT_MS = 30000;
const DEV_TOKEN = "dev-token";

function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    /failed|network|load failed|cleartext|unable to resolve|fetch/i.test(msg) ||
    (e instanceof TypeError && msg.includes("fetch"))
  );
}

function wrapNetworkError(e: unknown): Error {
  if (isNetworkError(e))
    return new Error(
      `Cannot reach backend at ${getBaseURL()}. Check: (1) Backend is running on port 8080. (2) In frontend .env set EXPO_PUBLIC_API_URL — use http://localhost:8080 for simulator, or your computer's IP (e.g. http://10.0.0.47:8080) for a physical device. (3) Restart Expo after changing .env: npx expo start -c`
    );
  return e instanceof Error ? e : new Error(String(e));
}

/** Builds headers with Authorization: Bearer <token>. Use idToken from store (e.g. useStore.getState().user?.idToken) for receipt uploads and all authenticated requests. */
function authHeaders(idToken: string | null): Record<string, string> {
  const token = idToken && idToken.trim() ? idToken : DEV_TOKEN;
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export function getApiBase() {
  return getBaseURL();
}

/** Check backend connectivity. Use to verify API URL before auth or receipt uploads. */
export async function healthCheck(): Promise<{ status: string; timestamp: string }> {
  try {
    const res = await fetch(`${getBaseURL()}/health`, { method: "GET" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Backend returned ${res.status}`);
    return data as { status: string; timestamp: string };
  } catch (e) {
    throw wrapNetworkError(e);
  }
}

/** Sync auth with backend: verify token, upsert user, return user for store. */
export type AuthSyncUser = {
  id: string;
  firebaseId: string;
  email: string;
  name?: string;
  displayName?: string;
  avatarUrl?: string;
};

export async function authSync(idToken: string): Promise<{ user: AuthSyncUser }> {
  try {
    const res = await fetch(`${getBaseURL()}/api/auth/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Sign-in failed. Please try again.");
    return data as { user: AuthSyncUser };
  } catch (e) {
    throw wrapNetworkError(e);
  }
}

export type SummaryCategory = { name: string; amount: number; progress: number };

export async function getTransactions(idToken: string | null) {
  try {
    const res = await fetch(`${getBaseURL()}/api/transactions`, {
      method: "GET",
      headers: authHeaders(idToken),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "Failed to fetch transactions");
    }
    return res.json();
  } catch (e) {
    throw wrapNetworkError(e);
  }
}

export type StoreRow = { name: string; visits: number; totalSpent: number };

export async function getStores(idToken: string | null): Promise<StoreRow[]> {
  const res = await fetch(`${baseURL}/api/transactions/stores`, {
    method: "GET",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to fetch stores");
  }
  return res.json();
}

export async function getSummary(idToken: string | null): Promise<{
  totalSpent: number;
  totalStores: number;
  categories: SummaryCategory[];
  displayName?: string | null;
  avatarUrl?: string | null;
}> {
  try {
    const res = await fetch(`${getBaseURL()}/api/transactions/summary`, {
      method: "GET",
      headers: authHeaders(idToken),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "Failed to fetch summary");
    }
    return res.json();
  } catch (e) {
    throw wrapNetworkError(e);
  }
}

export async function updateProfile(
  idToken: string | null,
  data: { displayName?: string | null; avatarUrl?: string | null }
): Promise<{ displayName: string | null; avatarUrl: string | null }> {
  const res = await fetch(`${baseURL}/api/user/profile`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Profile update failed");
  }
  return res.json();
}

export async function deleteTransaction(
  id: string,
  mode: "all" | "imageOnly",
  idToken: string | null
): Promise<void> {
  const res = await fetch(`${baseURL}/api/transactions/${id}?mode=${mode}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Delete failed");
  }
}

/** App-data query: spend by store/category, top category, recent purchase, cheapest store for item, group summary. Returns real data from receipts/groups. */
export async function appQuery(
  idToken: string | null,
  query: string
): Promise<{ answer: string; data?: Record<string, unknown> }> {
  const res = await fetch(`${baseURL}/api/app-query`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ query: (query || "").trim() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Query failed");
  }
  return res.json();
}

export async function askSmartBudget(idToken: string | null, message: string): Promise<{ reply: string }> {
  const res = await fetch(`${baseURL}/api/ai/chat`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ message: message.trim() || "Summarize my spending." }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Ask failed");
  }
  return res.json();
}

export async function purgeAllData(idToken: string | null): Promise<{ message: string }> {
  const res = await fetch(`${baseURL}/api/transactions/purge/all`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Purge failed");
  }
  return res.json();
}

export async function getReceipts(idToken: string | null, search?: string) {
  const url = new URL(`${baseURL}/api/receipts`);
  if (typeof search === "string" && search.trim()) url.searchParams.set("search", search.trim());
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to fetch receipts");
  }
  return res.json();
}

/** Debug: last receipt parsed by the backend (store, total, items). Requires auth. */
export async function getReceiptDebug(idToken: string | null): Promise<{
  storeName?: string;
  chosenTotal?: number;
  itemCount?: number;
  items?: { name: string; rawName: string; totalPrice: number; category: string }[];
  extractionSource?: string;
  timestamp?: string;
  [key: string]: unknown;
} | null> {
  const res = await fetch(`${getBaseURL()}/api/receipts/debug`, {
    method: "GET",
    headers: authHeaders(idToken),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to fetch receipt debug");
  return res.json();
}

/** Native Intelligence: when local OCR has verified store + total, send this to use Cloud only for line items. */
export type LocalExtract = { storeName: string; total: number; date?: string };

/** Native Intelligence: fully processed on-device; no image sent. Minimal Cloud payload. */
export type FromLocalPayload = { storeName: string; total: number; date?: string; category?: string };

const RECEIPT_PROCESS_TIMEOUT_MS = 60000;

/** Receipt Intelligence Engine: send OCR raw text; optional base64 image enables cloud fallback when local confidence is low. */
export async function postReceiptFromProcessText(
  idToken: string | null,
  rawText: string,
  base64Image?: string | null
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RECEIPT_PROCESS_TIMEOUT_MS);
  const body: { rawText: string; image?: string } = { rawText: rawText.trim() };
  if (base64Image && base64Image.length > 0) body.image = base64Image;
  try {
    const res = await fetch(`${getBaseURL()}/api/receipts/process-text`, {
      method: "POST",
      headers: authHeaders(idToken),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "Process text failed");
    }
    return res.json();
  } catch (e) {
    throw wrapNetworkError(e);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function postReceiptFromLocal(
  idToken: string | null,
  payload: FromLocalPayload
): Promise<unknown> {
  try {
    const res = await fetch(`${getBaseURL()}/api/receipts/from-local`, {
      method: "POST",
      headers: authHeaders(idToken),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "Upload failed");
    }
    return res.json();
  } catch (e) {
    throw wrapNetworkError(e);
  }
}

export async function postReceiptFromBase64(
  base64: string,
  idToken: string | null,
  imageUrl?: string | null,
  localExtract?: LocalExtract | null
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const body: { image: string; imageUrl?: string; localExtract?: LocalExtract } = { image: base64 };
    if (imageUrl != null && typeof imageUrl === "string") body.imageUrl = imageUrl;
    if (localExtract && typeof localExtract.storeName === "string" && typeof localExtract.total === "number")
      body.localExtract = localExtract;
    const res = await fetch(`${getBaseURL()}/api/receipts/from-base64`, {
      method: "POST",
      headers: authHeaders(idToken),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "Upload failed");
    }
    return res.json();
  } catch (e) {
    throw wrapNetworkError(e);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function postDemoSeed(idToken: string | null) {
  const res = await fetch(`${baseURL}/api/demo/seed`, {
    method: "POST",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Demo seed failed");
  }
  return res.json();
}

export type ReportResult = {
  period: string;
  totalSpent: number;
  totalSaved: number;
  topCategories: { name: string; amount: number }[];
  smartSuggestion: string;
};

export async function generateReport(
  idToken: string | null,
  period: "Weekly" | "Monthly"
): Promise<ReportResult> {
  const res = await fetch(`${baseURL}/api/reports/generate`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ period }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Report failed");
  }
  return res.json();
}

export type GroupRow = { id: string; name: string; createdAt: string; isOwner: boolean };

export async function getGroups(idToken: string | null): Promise<GroupRow[]> {
  const res = await fetch(`${getBaseURL()}/api/groups`, {
    method: "GET",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to fetch groups");
  }
  return res.json();
}

export async function createGroup(
  idToken: string | null,
  name: string,
  type: string = "Other"
): Promise<GroupRow> {
  const res = await fetch(`${getBaseURL()}/api/groups`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ name, type: ["Office", "Trip", "Party", "Other"].includes(type) ? type : "Other" }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string; error?: string }).message ||
        (errorData as { message?: string; error?: string }).error ||
        `Server responded with ${res.status}`
    );
  }
  return res.json();
}

/** Creates a populated test group (Weekend Trip) with 2 fake members and 3 expenses. Returns groupId for navigation. */
export async function seedTestGroup(idToken: string | null): Promise<{ groupId: string }> {
  const res = await fetch(`${getBaseURL()}/api/groups/seed-test-group`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string; error?: string }).error ||
        (errorData as { message?: string; error?: string }).message ||
        `Server responded with ${res.status}`
    );
  }
  const data = (await res.json()) as { groupId?: string };
  if (!data.groupId) throw new Error("Server did not return groupId");
  return { groupId: data.groupId };
}

export type GroupDetail = {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  owner: { id: string; name: string | null; email: string };
  members: { id: string; name: string | null; email: string; role?: string }[];
  expenses: ExpenseRow[];
};

/** Receipt-backed metadata returned with group expenses from Scan Library */
export type ExpenseReceiptSource = {
  id: string;
  imageUrl: string | null;
  date: string;
  total: number;
  store?: { name: string } | null;
  items?: { name: string; totalPrice: number }[];
  user?: { id: string; name: string | null } | null;
};

export type ExpenseRow = {
  id: string;
  description: string;
  amount: number;
  paidByUserId: string;
  paidBy: { id: string; name: string | null };
  createdBy?: { id: string; name: string | null } | null;
  groupId: string;
  receiptId?: string | null;
  receiptUrl: string | null;
  receipt?: ExpenseReceiptSource | null;
  category: string | null;
  createdAt: string;
  splits: { userId: string; amountOwed: number; user: { id: string; name: string | null } }[];
};

export type PriceRecordRow = {
  id: string;
  storeName?: string;
  rawStoreName?: string;
  canonicalStoreName?: string | null;
  rawItemName: string;
  canonicalItemName?: string | null;
  itemCategory?: string | null;
  price: number;
  quantity?: number | null;
  unit?: string | null;
  normalizedUnitPrice?: number | null;
  purchaseDate: string;
  cityOrArea?: string | null;
  confidenceScore?: number | null;
  createdByUserId?: string | null;
  createdByUser?: { id: string; name: string } | null;
};

export type GroupDashboardResponse = {
  group: { id: string; name: string; description: string | null; ownerId?: string };
  currentUserId?: string;
  isAdmin?: boolean;
  members: { id: string; userId?: string; name: string | null; email: string; role: string }[];
  recent_expenses: ExpenseRow[];
  balances: { fromUserId: string; toUserId: string; amount: number }[];
  total_group_expenses: number;
  activity_log: { id: string; userId: string; user: { id: string; name: string | null }; action: string; createdAt: string }[];
  price_records?: PriceRecordRow[];
};

export async function getGroupDashboard(idToken: string | null, groupId: string): Promise<GroupDashboardResponse> {
  const res = await fetch(`${getBaseURL()}/api/groups/${groupId}/dashboard`, {
    method: "GET",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string; error?: string }).message ||
        (errorData as { message?: string; error?: string }).error ||
        `Server responded with ${res.status}`
    );
  }
  return res.json();
}

export type CommunityPriceAggregateRow = {
  id: string;
  canonicalItemName: string;
  canonicalStoreName: string | null;
  regionBucket: string;
  averagePrice: number;
  lowestPrice: number;
  highestPrice: number;
  dataPointCount: number;
  lastCalculatedAt: string;
};

/** All groups: GET /api/prices/group. One group: GET /api/prices/group/:groupId */
export async function getGroupPrices(idToken: string | null, groupId?: string): Promise<PriceRecordRow[]> {
  const url = groupId ? `${getBaseURL()}/api/prices/group/${encodeURIComponent(groupId)}` : `${getBaseURL()}/api/prices/group`;
  const res = await fetch(url, { method: "GET", headers: authHeaders(idToken) });
  if (!res.ok) throw new Error("Failed to fetch group prices");
  return res.json();
}

export async function getSharedPrices(idToken: string | null): Promise<PriceRecordRow[]> {
  const res = await fetch(`${getBaseURL()}/api/prices/shared`, { method: "GET", headers: authHeaders(idToken) });
  if (!res.ok) throw new Error("Failed to fetch shared prices");
  return res.json();
}

export async function getCommunityAggregates(idToken: string | null): Promise<CommunityPriceAggregateRow[]> {
  const res = await fetch(`${getBaseURL()}/api/prices/community`, { method: "GET", headers: authHeaders(idToken) });
  if (!res.ok) throw new Error("Failed to fetch community aggregates");
  return res.json();
}

export type CreatePrivatePriceSharePayload = {
  targetUserId: string;
  shareScope?: "ALL" | "STORE" | "ITEM" | "CATEGORY" | "DATE_RANGE" | "SELECTED_RECORDS";
  storeNames?: string[];
  itemNames?: string[];
  categories?: string[];
  startDate?: string;
  endDate?: string;
  recordIds?: string[];
};

export async function createPrivatePriceShare(idToken: string | null, payload: CreatePrivatePriceSharePayload): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`${getBaseURL()}/api/prices/share/private`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Failed to create share");
  }
  return res.json();
}

/** Basket insights: best store, your history, group, shared friend, nearby community, multi-store */
export type BasketInsightsPayload = {
  itemNames: string[];
  lat?: number;
  lng?: number;
  locationAccuracy?: "precise" | "approximate" | null;
};

export type BasketInsightsResponse = {
  estimatedTotalKnownData: number;
  bestStore: {
    enabled: boolean;
    confidence: number;
    storeName?: string | null;
    storeAddress?: string | null;
    storeArea?: string | null;
    fallbackMessage?: string | null;
  };
  bestTotalStore: {
    storeName: string;
    estimatedTotal: number;
    storeAddress?: string | null;
    storeArea?: string | null;
  } | null;
  yourHistory: { itemName: string; storeName: string; unitPrice: number; unit?: string }[];
  groupPrices: Array<{
    id: string;
    canonicalItemName?: string;
    rawItemName: string;
    canonicalStoreName?: string | null;
    rawStoreName?: string | null;
    storeName?: string | null;
    price: number;
    normalizedUnitPrice?: number | null;
    createdByUser?: { id: string; name: string };
  }>;
  sharedFriendPrices: Array<{
    id: string;
    canonicalItemName?: string;
    rawItemName: string;
    canonicalStoreName?: string | null;
    rawStoreName?: string | null;
    storeName?: string | null;
    price: number;
    normalizedUnitPrice?: number | null;
    createdByUser?: { id: string; name: string };
  }>;
  nearbyCommunityAverage: Array<{
    canonicalItemName: string;
    canonicalStoreName?: string | null;
    regionBucket: string;
    averagePrice: number;
    lowestPrice: number;
    highestPrice: number;
    dataPointCount: number;
  }> | null;
  multiStoreRecommendation: {
    enabled: boolean;
    stores?: Array<{
      storeName: string;
      storeAddress?: string | null;
      storeArea?: string | null;
      items: Array<{ itemName: string; quantity: number; unitPrice: number; totalPrice: number }>;
      estimatedSubtotal: number;
    }>;
    combinedTotal?: number;
    savingsVsBestSingleStore?: number;
    reasonShown?: string;
  };
  topSpendCategories: { name: string; amount: number }[];
};

export async function getBasketInsights(
  idToken: string | null,
  payload: BasketInsightsPayload
): Promise<BasketInsightsResponse> {
  const res = await fetch(`${getBaseURL()}/api/basket/insights`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Failed to fetch basket insights");
  }
  return res.json();
}

export async function optInCommunity(idToken: string | null): Promise<{ success: boolean; isCommunityOptIn: boolean }> {
  const res = await fetch(`${getBaseURL()}/api/prices/community/opt-in`, { method: "POST", headers: authHeaders(idToken) });
  if (!res.ok) throw new Error("Failed to opt in to community");
  return res.json();
}

export async function optOutCommunity(idToken: string | null): Promise<{ success: boolean; isCommunityOptIn: boolean }> {
  const res = await fetch(`${getBaseURL()}/api/prices/community/opt-out`, { method: "POST", headers: authHeaders(idToken) });
  if (!res.ok) throw new Error("Failed to opt out of community");
  return res.json();
}

export async function updateGroup(idToken: string | null, groupId: string, data: { name?: string; description?: string | null }): Promise<{ id: string; name: string; description: string | null }> {
  const res = await fetch(`${getBaseURL()}/api/groups/${groupId}`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string; error?: string }).message ||
        (errorData as { message?: string; error?: string }).error ||
        `Server responded with ${res.status}`
    );
  }
  return res.json();
}

export async function deleteGroup(idToken: string | null, groupId: string): Promise<void> {
  const res = await fetch(`${getBaseURL()}/api/groups/${groupId}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string; error?: string }).message ||
        (errorData as { message?: string; error?: string }).error ||
        `Server responded with ${res.status}`
    );
  }
}

export async function leaveGroup(idToken: string | null, groupId: string): Promise<void> {
  const res = await fetch(`${getBaseURL()}/api/groups/${groupId}/leave`, {
    method: "POST",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string; error?: string }).error ||
        (errorData as { message?: string; error?: string }).message ||
        `Server responded with ${res.status}`
    );
  }
}

export async function addGroupMember(
  idToken: string | null,
  groupId: string,
  payload: { email?: string; name?: string; phone?: string }
): Promise<{ message: string; members: { id: string; userId: string; name: string | null; email: string; role: string }[] }> {
  const body: { email?: string; name?: string; phone?: string } = {};
  if (typeof payload.email === "string" && payload.email.trim()) body.email = payload.email.trim().toLowerCase();
  if (typeof payload.name === "string" && payload.name.trim()) body.name = payload.name.trim();
  if (typeof payload.phone === "string" && payload.phone.trim()) body.phone = payload.phone.trim();
  if (!body.email && !body.name) throw new Error("Provide email or name");
  const res = await fetch(`${getBaseURL()}/api/groups/${groupId}/members`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string; error?: string }).error ||
        (errorData as { message?: string; error?: string }).message ||
        `Server responded with ${res.status}`
    );
  }
  return res.json();
}

export async function removeGroupMember(
  idToken: string | null,
  groupId: string,
  userId: string
): Promise<{ message: string }> {
  const trimmed = typeof userId === "string" ? userId.trim() : "";
  if (!trimmed) throw new Error("User id is required to remove a member");
  const url = `${getBaseURL()}/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(trimmed)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const msg =
      (errorData as { error?: string }).error ||
      (errorData as { message?: string }).message ||
      "Failed to remove member";
    throw new Error(msg);
  }
  const data = await res.json().catch(() => ({ message: "Member removed" }));
  return data as { message: string };
}

export async function getGroupMemberDetails(
  idToken: string | null,
  groupId: string,
  userId: string
): Promise<{ groupsCount: number }> {
  const res = await fetch(
    `${getBaseURL()}/api/groups/${groupId}/members/${encodeURIComponent(userId)}/details`,
    { method: "GET", headers: authHeaders(idToken) }
  );
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error ||
        (errorData as { message?: string }).message ||
        "Failed to load member details"
    );
  }
  return res.json();
}

export async function createGroupInviteLink(
  idToken: string | null,
  groupId: string
): Promise<{ inviteUrl: string; token: string; expiresAt: string }> {
  const res = await fetch(`${getBaseURL()}/api/groups/${groupId}/invite-link`, {
    method: "POST",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error || `Server responded with ${res.status}`
    );
  }
  return res.json();
}

export async function joinGroupByToken(
  idToken: string | null,
  token: string
): Promise<{ message: string; groupId: string }> {
  const res = await fetch(`${getBaseURL()}/api/groups/join/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error || `Server responded with ${res.status}`
    );
  }
  return res.json();
}

export async function getGroup(idToken: string | null, groupId: string): Promise<GroupDetail> {
  const res = await fetch(`${getBaseURL()}/api/groups/${groupId}`, {
    method: "GET",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string; error?: string }).message ||
        (errorData as { message?: string; error?: string }).error ||
        `Server responded with ${res.status}`
    );
  }
  return res.json();
}

export type AddExpensePayload = {
  groupId: string;
  description: string;
  amount: number;
  paidByUserId?: string;
  receiptUrl?: string | null;
  category?: string | null;
  splitType?: "equal" | "exact" | "percentage" | "shares";
  splitInput?:
    | { type: "equal"; participantIds: string[] }
    | { type: "exact"; splits: { userId: string; amount: number }[] }
    | { type: "percentage"; splits: { userId: string; percent: number }[] }
    | { type: "shares"; splits: { userId: string; shares: number }[] };
};

export async function addExpense(idToken: string | null, payload: AddExpensePayload): Promise<ExpenseRow> {
  const res = await fetch(`${getBaseURL()}/api/expenses/add`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string; error?: string }).message ||
        (errorData as { message?: string; error?: string }).error ||
        `Server responded with ${res.status}`
    );
  }
  return res.json();
}

export type UpdateExpensePayload = {
  description?: string;
  amount?: number;
  paidByUserId?: string;
  category?: string | null;
  splitInput?: { type: "equal"; participantIds: string[] };
};

export async function updateExpense(idToken: string | null, expenseId: string, payload: UpdateExpensePayload): Promise<ExpenseRow> {
  const res = await fetch(`${getBaseURL()}/api/expenses/${encodeURIComponent(expenseId)}`, {
    method: "PUT",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string; error?: string }).message ||
        (errorData as { message?: string; error?: string }).error ||
        `Server responded with ${res.status}`
    );
  }
  return res.json();
}

export async function deleteExpense(idToken: string | null, expenseId: string): Promise<void> {
  const res = await fetch(`${getBaseURL()}/api/expenses/${encodeURIComponent(expenseId)}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string; error?: string }).message ||
        (errorData as { message?: string; error?: string }).error ||
        `Server responded with ${res.status}`
    );
  }
}

export type BalanceRow = { groupId: string; otherUserId: string; balanceAmount: number; youOwe: boolean };

export async function getBalancesForUser(idToken: string | null, userId: string): Promise<BalanceRow[]> {
  const res = await fetch(`${getBaseURL()}/api/balances/user/${userId}`, {
    method: "GET",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string; error?: string }).message ||
        (errorData as { message?: string; error?: string }).error ||
        `Server responded with ${res.status}`
    );
  }
  return res.json();
}

export type GroupBalancesResponse = {
  balances: { user1Id: string; user2Id: string; balanceAmount: number }[];
  simplified: { fromUserId: string; toUserId: string; amount: number }[];
};

export async function getBalancesForGroup(idToken: string | null, groupId: string): Promise<GroupBalancesResponse> {
  const res = await fetch(`${getBaseURL()}/api/balances/group/${groupId}`, {
    method: "GET",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string; error?: string }).message ||
        (errorData as { message?: string; error?: string }).error ||
        `Server responded with ${res.status}`
    );
  }
  return res.json();
}

export async function settlePayment(
  idToken: string | null,
  groupId: string,
  payerId: string,
  receiverId: string,
  amount: number
): Promise<void> {
  const res = await fetch(`${getBaseURL()}/api/payments/settle`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ groupId, payerId, receiverId, amount }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string; error?: string }).message ||
        (errorData as { message?: string; error?: string }).error ||
        `Server responded with ${res.status}`
    );
  }
}

/** Mark a receipt as verified (expedite pending review). */
export async function approveReceipt(receiptId: string, idToken: string | null): Promise<unknown> {
  const res = await fetch(`${getBaseURL()}/api/receipts/${receiptId}/approve`, {
    method: "PATCH",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { error?: string }).error || "Failed to approve receipt"
    );
  }
  return res.json();
}

export async function setReceiptGroup(
  receiptId: string,
  groupId: string | null,
  idToken: string | null
): Promise<void> {
  const res = await fetch(`${getBaseURL()}/api/receipts/${receiptId}/group`, {
    method: "PATCH",
    headers: authHeaders(idToken),
    body: JSON.stringify({ groupId }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string; error?: string }).message ||
        (errorData as { message?: string; error?: string }).error ||
        `Server responded with ${res.status}`
    );
  }
}

export type ShareReceiptToGroupResult = {
  success: boolean;
  expenseId: string;
  alreadyShared?: boolean;
};

/** Atomically share a receipt to a group (create expense + link receipt). Idempotent. Optional participantIds for split among selected members only. */
export async function shareReceiptToGroup(
  receiptId: string,
  groupId: string,
  idToken: string | null,
  participantIds?: string[]
): Promise<ShareReceiptToGroupResult> {
  const body: { groupId: string; participantIds?: string[] } = { groupId };
  if (Array.isArray(participantIds) && participantIds.length > 0) body.participantIds = participantIds;
  const res = await fetch(`${getBaseURL()}/api/receipts/${receiptId}/share-to-group`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      (errorData as { message?: string; error?: string }).message ||
        (errorData as { message?: string; error?: string }).error ||
        `Server responded with ${res.status}`
    );
  }
  return res.json();
}

export type SmartListItemRow = { id: string; name: string; quantity: number };
export type SmartListRow = { id: string; name: string; createdAt: string; updatedAt: string; items: SmartListItemRow[] };

export async function getSmartLists(idToken: string | null): Promise<SmartListRow[]> {
  const res = await fetch(`${baseURL}/api/smartlist`, {
    method: "GET",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to fetch smart lists");
  }
  return res.json();
}

export async function createSmartList(
  idToken: string | null,
  payload: { name?: string; items: { name: string; quantity?: number }[] }
): Promise<SmartListRow> {
  const res = await fetch(`${baseURL}/api/smartlist`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Failed to create smart list");
  }
  return res.json();
}

export type OptimizeResult = {
  bestStoreId: string;
  bestStoreName: string;
  bestStoreAddress: string | null;
  estimatedTotal: number;
  theoreticalMinimum: number;
  estimatedSavings: number;
  itemBreakdown: { itemName: string; quantity: number; unitPrice: number; totalPrice: number; storeName: string }[];
};

export async function optimizeSmartList(idToken: string | null, listId: string): Promise<OptimizeResult> {
  const res = await fetch(`${baseURL}/api/smartlist/${listId}/optimize`, {
    method: "POST",
    headers: authHeaders(idToken),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Optimize failed");
  }
  return res.json();
}

// ——— Medical ———
export type MedicalFolderRow = {
  id: string;
  patientName: string;
  createdAt: string;
  recordsCount: number;
  expensesCount: number;
};

export type MedicalFolderDetail = {
  id: string;
  patientName: string;
  createdAt: string;
  records: { id: string; type: string; title: string; date: string; notes: string | null; createdAt: string }[];
  expenses: { id: string; itemName: string; price: number; date: string; storeName: string | null; storeAddress: string | null; createdAt: string }[];
};

export async function getMedicalFolders(idToken: string | null): Promise<MedicalFolderRow[]> {
  const res = await fetch(`${getBaseURL()}/api/medical`, { method: "GET", headers: authHeaders(idToken) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to load medical folders");
  }
  return res.json();
}

export async function createMedicalFolder(idToken: string | null, patientName: string): Promise<{ id: string; patientName: string; createdAt: string }> {
  const res = await fetch(`${getBaseURL()}/api/medical`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify({ patientName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to create folder");
  }
  return res.json();
}

export async function getMedicalFolder(idToken: string | null, folderId: string): Promise<MedicalFolderDetail> {
  const res = await fetch(`${getBaseURL()}/api/medical/${encodeURIComponent(folderId)}`, { method: "GET", headers: authHeaders(idToken) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to load folder");
  }
  return res.json();
}

export async function deleteMedicalFolder(idToken: string | null, folderId: string): Promise<void> {
  const res = await fetch(`${getBaseURL()}/api/medical/${encodeURIComponent(folderId)}`, { method: "DELETE", headers: authHeaders(idToken) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to delete folder");
  }
}

export async function addMedicalRecord(
  idToken: string | null,
  folderId: string,
  data: { type?: string; title: string; date?: string; notes?: string | null }
): Promise<{ id: string; type: string; title: string; date: string; notes: string | null; createdAt: string }> {
  const res = await fetch(`${getBaseURL()}/api/medical/${encodeURIComponent(folderId)}/records`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to add record");
  }
  return res.json();
}

export async function addMedicalExpense(
  idToken: string | null,
  folderId: string,
  data: { itemName: string; price: number; date?: string; storeName?: string | null; storeAddress?: string | null }
): Promise<{ id: string; itemName: string; price: number; date: string; storeName: string | null; storeAddress: string | null; createdAt: string }> {
  const res = await fetch(`${getBaseURL()}/api/medical/${encodeURIComponent(folderId)}/expenses`, {
    method: "POST",
    headers: authHeaders(idToken),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Failed to add expense");
  }
  return res.json();
}
