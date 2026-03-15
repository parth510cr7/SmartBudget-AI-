## Current Code Reference (Living “Known-Good” Snapshot)

**Purpose:** This file is the **single source of truth** for the current intended behavior and the key implementation points. If something regresses, compare your code to the references below.

**Last updated:** March 12, 2026.

---

## 0. What changed most recently (high-signal)

### Group page (March 2026)
- **Realtime updates:** Socket.io remains disabled. Group screen uses **polling** every 15 seconds while focused (`useFocusEffect` + `setInterval(load, 15000)`). Dashboard refreshes without manual pull.
- **Member card → View details:** Tapping a member opens action sheet with "View details" and "Remove from group" (owner only, and only when member has no unsettled balances). "View details" opens a modal showing:
  - **Summary:** Groups count (from GET `/:id/members/:userId/details`), total "Owes in this group", total "Is owed in this group".
  - **Breakdown:** "What they owe" — each line "They owe [Name] $X" (from dashboard balances where `fromUserId === member`). "Who owes them" — each line "[Name] owes them $X" (where `toUserId === member`).
- **Remove member:** Backend `DELETE /:id/members/:userId` (owner only; returns 400 if member has unsettled balances). Frontend shows "Remove from group" in member action sheet when current user is owner and member has no balances.

### Medical module (March 2026)
- **Backend:** `backend/src/routes/medical.ts` mounted at `/api/medical`. Routes: GET / (list folders), POST / (create folder, body `{ patientName }`), GET /:folderId (folder with records + expenses), DELETE /:folderId, POST /:folderId/records (body `type`, `title`, `date`, `notes`), POST /:folderId/expenses (body `itemName`, `price`, `date`, `storeName`, `storeAddress`). All require auth; folder scope by `userId`.
- **Frontend:** `frontend/app/(tabs)/medical.tsx` — list patient folders, "Add patient folder", tap folder to load detail; "Add record" / "Add expense" modals; long-press folder to delete. Entry: Profile → "Medical Vault".

### Basket-first price intelligence (Search → Basket → Finalize → Smart Insights)
- **No source pills** and **no always-visible “Best price by store”** before finalization.
- **Price intelligence is only shown after Finalize**, and only when relevant.

### Location consent (privacy-first)
- No OS prompt on launch.
- Pre-permission in-app modal before OS prompt.
- Consent model tracks:
  - `not_asked`
  - `declined_in_app`
  - `os_denied`
  - `granted_precise`
  - `granted_approximate`
  - plus separate toggle `nearbyCommunityEnabled`.

### Core correction: **NO fake store recommendations**
- If basket confidence is insufficient, the app must **not** recommend a store or address.
- Fallback must be:
  - Store: **“Don't have best pick yet 🥶”**
  - Estimated total: **from known data only**

### Dual insight modes (never mixed)
- **Basket empty:** show **top spending categories** (bubble UI).
- **Basket loaded/finalized:** show **basket Smart Insights**.
- Basket cleared: basket insights disappear and empty-state bubbles return.

---

## 1. Backend — Basket insights endpoint (confidence-aware)

### Route
- **File:** `backend/src/routes/basket.ts`
- **Endpoint:** `POST /api/basket/insights`
- **Body:**
```json
{ "itemNames": ["Milk", "Bread"], "lat": 43.0, "lng": -79.0, "locationAccuracy": "approximate" }
```

### Service
- **File:** `backend/src/services/basketInsightsService.ts`

#### Response contract (current)
```json
{
  "estimatedTotalKnownData": 0,
  "bestStore": {
    "enabled": false,
    "confidence": 0,
    "storeName": null,
    "storeAddress": null,
    "storeArea": null,
    "fallbackMessage": "Don't have best pick yet 🥶"
  },
  "bestTotalStore": null,
  "yourHistory": [],
  "groupPrices": [],
  "sharedFriendPrices": [],
  "nearbyCommunityAverage": null,
  "multiStoreRecommendation": { "enabled": false, "reasonShown": "..." },
  "topSpendCategories": [{ "name": "Groceries", "amount": 81.13 }]
}
```

#### Confidence / “no fake store” rules (backend-enforced)
- **Store recommendation requires:**  
  - `MIN_BASKET_ITEMS_FOR_STORE = 2`  
  - `MIN_COVERAGE_RATIO = 0.5`  
  - `confidence = itemsMatched / itemCount`
- If not met:
  - `bestStore.enabled = false`
  - `bestTotalStore = null`
  - `fallbackMessage = "Don't have best pick yet 🥶"`
  - **No storeName/address** is returned.

#### Estimated total (known data only)
- Always returns `estimatedTotalKnownData` calculated only from available historical price data:
  - When store confidence is strong and `optimizeBasket` returns a best store, the estimate comes from best-store total.
  - Otherwise it sums known best prices for matched basket items only.

#### Empty-state data (top spending categories)
- Always returns `topSpendCategories` (top 5):
  - derived from `Item.category` + `Item.totalPrice` across user receipts.
- For `itemNames: []`, the endpoint returns **only empty-state** plus default insight placeholders.

---

## 2. Frontend — Search / Insights screen (dual-mode + trust rules)

### File
- **File:** `frontend/app/(tabs)/insights.tsx`

### Basket-first cleanup (pre-finalize)
- **Removed:**
  - source pills (My Prices / Group / Private Shared / Community)
  - always-visible “Best price by store” table
  - permanent community/private shared “search tabs”

### Finalize behavior
- On finalize:
  - Calls `getBasketInsights(authToken, payload)`  
    - `payload.itemNames = basket`
    - includes `lat/lng` only after explicit consent
  - Uses `bestStore.enabled` to decide whether store recommendation UI can show a store/address.

### “No fake store” UI behavior
- After finalize (and basket has items):
  - If `basketInsights.bestStore.enabled === true`:
    - show store name + (only if returned) address
  - Else:
    - Store line: **“Don't have best pick yet 🥶”**
    - Estimated total line: **“Est. total (from known data)”** using `estimatedTotalKnownData`
    - No address row shown.

### Smart Insights visibility rule
- **Smart Insights** block renders only when:
  - `showFinalized === true` AND `basket.length > 0`
- If basket becomes empty, the code clears:
  - `showFinalized = false`
  - `basketInsights = null`
  - `optimizeResult = null`

---

## 3. Empty-state insight mode — Category bubbles (iOS-style)

### Data loading
- When `basket.length === 0` and user is authed:
  - the screen calls:
    - `getBasketInsights(authToken, { itemNames: [] })`
  - and uses:
    - `response.topSpendCategories`

### Visibility + UX behavior
- Empty state section **always renders when basket is empty**:
  - Shows spinner while loading (`emptyStateLoading`).
  - Shows bubbles when data exists.
  - Shows a clear placeholder message if no data exists yet.

### Bubble sizing rules (implemented — Phase 1 visuals)
- Bubble size uses spend ratio vs max category spend:
  - min 72pt
  - max 120pt
  - higher spend → larger bubble

### File implementation points
- **File:** `frontend/app/(tabs)/insights.tsx`
  - `topSpendCategories` state
  - `emptyStateLoading` state
  - `fetchEmptyStateCategories()` is called:
    - when basket becomes empty
    - and on tab focus when basket is empty

---

## 4. Location consent (pre-permission modal + 5-state model)

### Core library
- **File:** `frontend/src/lib/locationConsent.ts`
- Tracks:
  - `consentStatus`: `not_asked | declined_in_app | os_denied | granted_precise | granted_approximate`
  - `nearbyCommunityEnabled`: separate toggle
  - `usePreciseLocation`: boolean
- `getLocationForNearby()` returns `{ coords, osGranted }` so UI can set `os_denied`.

### Pre-permission modal
- **File:** `frontend/src/components/LocationConsentModal.tsx`
- Must be shown **before** OS prompt.
- Buttons:
  - Allow precise
  - Allow approximate
  - Not now

### Profile privacy section
- **File:** `frontend/app/(tabs)/profile.tsx`
- Shows:
  - OS status + app consent status
  - toggle for `nearbyCommunityEnabled`
  - disable/reset flow (`revokeLocationAccess()`)
- Re-enabling after `declined_in_app` or `os_denied` resets to `not_asked`.

---

## 5. Private share UX relocation (no Search tab)

### Entry point
- **File:** `frontend/app/(tabs)/profile.tsx`
- Adds “**Share my price history**” which navigates to:
  - `/modal/price-history-sharing`

### Modal
- **File:** `frontend/app/modal/price-history-sharing.tsx`
- Informational first pass; reuses existing backend sharing model (`POST /api/prices/share/private`).

### Router registration
- **File:** `frontend/app/_layout.tsx`
- Registers: `modal/price-history-sharing`

---

## 6. API client additions

### Basket insights client
- **File:** `frontend/src/api/client.ts`
- Adds:
  - `getBasketInsights(idToken, payload)`
  - `BasketInsightsResponse` includes:
    - `estimatedTotalKnownData`
    - `bestStore`
    - `topSpendCategories`

---

## 7. Group & ledger fixes (earlier work, still valid)

This repo also contains the earlier fixes (group dashboard `isAdmin`, owner-in-members, simplifyDebts deadlock safeguards, etc.). If you suspect a regression there, follow the checklist below.

### Transactions route must include store + items
- **File:** `backend/src/routes/transactions.ts`
- **Reason:** basket matching builds from receipt item/unit prices.

---

## 8. Quick verification checklist (runbook)

### Backend
- `GET /health` returns ok.
- `POST /api/basket/insights`:
  - With `{"itemNames":[]}` returns `topSpendCategories`.
  - With `{"itemNames":["Milk","Bread"]}` returns:
    - `bestStore.enabled` false when insufficient coverage
    - never returns storeAddress when disabled

### Frontend
- Insights tab:
  - Before finalize: no pills, no price table.
  - Basket empty: shows “Your spending by category” + bubbles (or placeholder text).
  - Basket added + finalize:
    - if insufficient confidence: shows “Don't have best pick yet 🥶” and known-data total only.
  - Basket cleared: basket insights disappears; empty-state returns.

---

## Appendix — Historical group page code block (not authoritative)

The long code block below is **historical reference only**. The current source of truth is the repo files listed above.

```tsx
import { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Plus, Users, Receipt, DollarSign, ListOrdered } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getGroupDashboard,
  updateGroup,
  deleteGroup,
  addExpense,
  settlePayment,
  type GroupDashboardResponse,
} from "../../src/api/client";
import { useStore } from "../../src/store/useStore";
import { getTheme, IOS_BLUE } from "../../src/theme";

type Tab = "expenses" | "balances" | "activity";

// TEMPORARILY DISABLED: socket.io was causing infinite buffer / crash
// import { io, Socket } from "socket.io-client";

export default function GroupPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const authToken = useStore((s) => (s.user as { idToken?: string } | null)?.idToken ?? null);
  const currentUserId = useStore((s) => s.user?.id ?? null);
  const isDarkMode = useStore((s) => s.isDarkMode ?? false);
  const expensePrefill = useStore((s) => s.expensePrefill);
  const setExpensePrefill = useStore((s) => s.setExpensePrefill);
  const { bg, glass, textPrimary, textSecondary } = getTheme(isDarkMode);

  const [dashboard, setDashboard] = useState<GroupDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("expenses");
  const [addExpenseVisible, setAddExpenseVisible] = useState(false);
  const [expenseDesc, setExpenseDesc] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);
  const [settlingRow, setSettlingRow] = useState<number | null>(null);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!id || !authToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await getGroupDashboard(authToken, id);
      setDashboard(data);
      setEditName(data?.group?.name ?? "");
      setEditDescription(data?.group?.description ?? "");
      setErrorMsg(null);
    } catch (error: unknown) {
      let msg = "Unknown backend error";
      if (error && typeof error === "object") {
        const e = error as { response?: { data?: { message?: string }; status?: number }; message?: string; error?: string };
        if (e.response?.data?.message && typeof e.response.data.message === "string") msg = e.response.data.message;
        else if (e.message && typeof e.message === "string") msg = e.message;
        else if (e.error && typeof e.error === "string") msg = e.error;
      }
      console.error("Group Fetch Error:", error);
      setDashboard(null);
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [id, authToken]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (addExpenseVisible && expensePrefill) {
      setExpenseDesc(expensePrefill.description);
      setExpenseAmount(String(expensePrefill.amount));
      setExpensePrefill(null);
    }
  }, [addExpenseVisible, expensePrefill, setExpensePrefill]);

  if (!id) {
    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <Text style={[styles.errorText, { color: textPrimary }]}>Missing group ID</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: IOS_BLUE }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: bg }]}>
        <Text style={{ fontSize: 18, fontWeight: "bold", color: "red" }}>Backend Error</Text>
        <Text style={{ color: "red", textAlign: "center", marginTop: 10, paddingHorizontal: 20 }}>{errorMsg}</Text>
        <TouchableOpacity onPress={() => { setErrorMsg(null); load(); }} style={{ marginTop: 16 }}>
          <Text style={{ color: IOS_BLUE, fontSize: 16 }}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 8 }}>
          <Text style={{ color: IOS_BLUE }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading && !dashboard) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={IOS_BLUE} />
      </View>
    );
  }

  if (!dashboard) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: bg }]}>
        <Text style={[styles.errorText, { color: textPrimary }]}>Group not found</Text>
        <TouchableOpacity onPress={() => { setErrorMsg(null); load(); }} style={{ marginTop: 8 }}>
          <Text style={{ color: IOS_BLUE }}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 8 }}>
          <Text style={{ color: IOS_BLUE }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const members = Array.isArray(dashboard?.members) ? dashboard.members : [];
  const recentExpenses = Array.isArray(dashboard?.recent_expenses) ? dashboard.recent_expenses : [];
  const balancesList = Array.isArray(dashboard?.balances) ? dashboard.balances : [];
  const activityLog = Array.isArray(dashboard?.activity_log) ? dashboard.activity_log : [];

  const memberNames: Record<string, string> = {};
  members.forEach((m) => {
    memberNames[m.id] = m.name?.trim() || m.email || "Member";
  });
  const isAdmin = !!dashboard?.isAdmin;
  const participantIds = members.map((m) => m.id ?? m.userId).filter(Boolean);

  const totalGroupSpending = Number(dashboard?.total_group_expenses ?? 0);
  const youOwe = (balancesList || []).filter((b) => b.fromUserId === currentUserId).reduce((s, b) => s + Number(b.amount ?? 0), 0);
  const youAreOwed = (balancesList || []).filter((b) => b.toUserId === currentUserId).reduce((s, b) => s + Number(b.amount ?? 0), 0);
  const balanceLabel = youOwe > 0 && youAreOwed === 0 ? `You owe $${youOwe.toFixed(2)}` : youAreOwed > 0 && youOwe === 0 ? `You are owed $${youAreOwed.toFixed(2)}` : youOwe > 0 || youAreOwed > 0 ? `Owe $${youOwe.toFixed(2)} · Owed $${youAreOwed.toFixed(2)}` : "Settled up";
  const progressPct = totalGroupSpending > 0 ? Math.min(100, (totalGroupSpending / 5000) * 100) : 0;

  async function handleAddExpense() { /* ... */ }
  async function handleSaveEdit() { /* ... */ }
  function handleDeleteGroup() { /* ... */ }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <ArrowLeft size={24} color={textPrimary} />
        </TouchableOpacity>
        <View style={[styles.headerTitleRow, { flex: 1 }]}>
          <Text style={[styles.headerTitle, { color: textPrimary }]} numberOfLines={1}>
            {dashboard?.group?.name || "Group"}
          </Text>
          {isAdmin && (
            <TouchableOpacity onPress={() => setSettingsVisible(true)} style={styles.editButton} hitSlop={12}>
              <Text style={styles.editDeleteText}>Edit / Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={[styles.membersRow, { backgroundColor: glass }]}>
        <Users size={18} color={textSecondary} />
        <Text style={[styles.membersText, { color: textSecondary }]} numberOfLines={2}>
          {members.map((m) => m.name?.trim() || m.email || "Member").join(", ")}
        </Text>
      </View>

      <View style={[styles.heroCard, { backgroundColor: glass }]}>
        <Text style={[styles.heroLabel, { color: textSecondary }]}>Total group spending</Text>
        <Text style={[styles.heroTotal, { color: textPrimary }]}>${totalGroupSpending.toFixed(2)}</Text>
        <Text style={[styles.heroBalance, { color: youOwe > youAreOwed ? "#FF3B30" : IOS_BLUE }]}>{balanceLabel}</Text>
        <View style={[styles.progressTrack, { backgroundColor: bg }]}>
          <View style={[styles.progressBar, { width: `${progressPct}%`, backgroundColor: IOS_BLUE }]} />
        </View>
      </View>

      <View style={styles.primaryActions}>
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: IOS_BLUE }]} onPress={() => setAddExpenseVisible(true)} activeOpacity={0.8}>
          <Plus size={20} color="#FFF" />
          <Text style={styles.primaryBtnText}>Add expense</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: glass }]} onPress={() => Alert.alert("Coming Soon", "Invite link feature pending")} activeOpacity={0.8}>
          <Users size={20} color={textPrimary} />
          <Text style={[styles.primaryBtnTextSecondary, { color: textPrimary }]}>Add person to split</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {/* Expenses / Balances / Activity tabs with FlatList each */}
      </View>

      <TouchableOpacity style={styles.addBtn} onPress={() => setAddExpenseVisible(true)}>...</TouchableOpacity>
      <Modal visible={addExpenseVisible}>...</Modal>
      <Modal visible={settingsVisible}>...</Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: "center", alignItems: "center" },
  errorText: { fontSize: 16 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  backBtn: { marginRight: 12 },
  headerTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 8 },
  headerTitle: { fontSize: 20, fontWeight: "700", flex: 1 },
  editButton: { padding: 4 },
  editDeleteText: { color: "red", fontSize: 15, fontWeight: "600" },
  membersRow: { ... },
  heroCard: { marginHorizontal: 16, marginBottom: 16, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  heroLabel: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  heroTotal: { fontSize: 28, fontWeight: "800", marginBottom: 8 },
  heroBalance: { fontSize: 15, fontWeight: "600", marginBottom: 12 },
  progressTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressBar: { height: "100%", borderRadius: 4 },
  primaryActions: { flexDirection: "row", gap: 12, paddingHorizontal: 16, marginBottom: 16 },
  primaryBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  primaryBtnText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  primaryBtnTextSecondary: { fontSize: 16, fontWeight: "600" },
  tabs: { ... },
  /* ... rest of styles ... */
});
```

**Critical points:**
- `errorMsg` state; in catch set `setErrorMsg(msg)` (from `error.response?.data?.message` / `error.message` / `error.error`).
- When `errorMsg` is set, show "Backend Error" + message + Retry + Go back.
- When `!dashboard` (no error), show "Group not found" + Retry + Go back.
- `isAdmin = !!dashboard?.isAdmin` (from backend).
- Hero: total spending, balance label, progress bar.
- Primary buttons: Add expense, Add person to split (Coming Soon).
- Tabs use FlatList (data, keyExtractor, renderItem, ListEmptyComponent).
- Socket.io is commented out. **Realtime:** use `useFocusEffect` + `setInterval(load, 15000)` to poll dashboard while group screen is focused.
- **Member details modal:** Pass `userId` in `memberDetailsMember`; show summary cards (Groups, Owes total, Owed total) and breakdown sections "What they owe" / "Who owes them" from `balancesList` filtered by that member. See `frontend/app/group/[id].tsx` for exact implementation.

---

## 2. GROUP DASHBOARD BACKEND

**File:** `backend/src/routes/groups.ts`

- **No** `router.post("/create", ...)`. Group creation is **POST /** only.
- **GET /:id/dashboard** returns:
  - `group: { id, name, description, ownerId }`
  - **`isAdmin: currentUserIsAdmin`** where `currentUserIsAdmin = group.ownerId === user.id || group.members.some(m => m.userId === user.id && m.role === "ADMIN")`
  - **members**: owner as first member (ownerAsMember) + other members (no duplicate owner):  
    `const ownerAsMember = { ...group.owner, id: group.owner.id, userId: group.owner.id, role: "ADMIN" };`  
    `const otherMembers = group.members.filter(m => m.userId !== group.ownerId).map(...);`  
    `const members = [ownerAsMember, ...otherMembers];`
  - `recent_expenses`, `balances` (from simplifyDebts), `total_group_expenses`, `activity_log`
- **DELETE /:id/members/:userId**: when user has no balances, only `prisma.groupMember.deleteMany` (no balance deleteMany).

Relevant dashboard block:

```typescript
const ownerAsMember = {
  ...group.owner,
  id: group.owner.id,
  userId: group.owner.id,
  role: "ADMIN" as const,
};
const otherMembers = Array.isArray(group.members)
  ? group.members.filter((m) => m.userId !== group.ownerId).map((m) => ({ ...m.user, id: m.user.id, userId: m.userId, role: m.role }))
  : [];
const members = [ownerAsMember, ...otherMembers];
const currentUserIsAdmin =
  group.ownerId === user.id ||
  (Array.isArray(group.members) && group.members.some((m) => m.userId === user.id && m.role === "ADMIN"));
res.json({
  group: { id: group.id, name: group.name, description: group.description ?? null, ownerId: group.ownerId },
  isAdmin: currentUserIsAdmin,
  members,
  recent_expenses: recent_expenses || [],
  balances: simplifiedBalances || [],
  total_group_expenses: totalExpenses._sum?.amount ?? 0,
  activity_log: activityLog || [],
});
```

---

## 3. BASKET / INSIGHTS FRONTEND

**File:** `frontend/app/(tabs)/insights.tsx`

- **refetch**: `getTransactions(authToken).then(... setTransactionsStore(list)).catch(() => {})` — **do not** clear store on failure (keeps Basket data).
- **handleFinalize**: try/catch with `Alert.alert("Error", message)`; `message = error instanceof Error ? error.message : String(error)`.
- Basket/price logic uses `transactions` from store (from GET /api/transactions); backend must return receipts with **store** and **items**.

---

## 4. EXPENSE SERVICE (simplifyDebts)

**File:** `backend/src/services/expenseService.ts`

- Round all balances: `round2(b.balanceAmount)`; filter `Math.abs(b.balanceAmount) >= 0.01`.
- Build net from rounded balances only.
- In the while loop: **MAX_ITERATIONS = 1000**; if `++iterations > MAX_ITERATIONS` then `console.warn("[simplifyDebts] Deadlock safeguard: exceeded 1000 iterations, breaking.")` and `break`.
- After each transfer set `d.amount`/`c.amount` to 0 when `< 0.01`.

---

## 5. TRANSACTIONS ROUTE (Basket data)

**File:** `backend/src/routes/transactions.ts`

GET `/` (used by `getTransactions()`):

```typescript
// MANDATORY: store + items required for Insights Basket price comparison (buildItemPricesFromReceipts)
const receipts = await prisma.receipt.findMany({
  where: { userId: user.id },
  include: { store: true, items: true },
  orderBy: { date: "desc" },
});
res.json(receipts);
```

---

## 6. RECEIPTS ROUTE

**File:** `backend/src/routes/receipts.ts`

GET `/`:

```typescript
// store + items required for Library and any consumer that needs price/item data
const receipts = await prisma.receipt.findMany({
  where: { userId: user.id },
  include: { store: true, items: true },
  orderBy: { date: "desc" },
});
```

---

## 7. LIBRARY — SHARE BILL TO GROUP

**File:** `frontend/app/modal/library.tsx`

- Imports: `getGroupDashboard`, `addExpense`, plus existing.
- Store: `currentUserId = useStore((s) => s.user?.id ?? null)`.
- On "Split with Group" for a group:
  - `const dashboard = await getGroupDashboard(authToken, g.id);`
  - `participantIds = members.map(m => m.id ?? m.userId).filter(Boolean);`
  - If `participantIds.length > 0 && total > 0`: `await addExpense(authToken, { groupId: g.id, description: "... (from Library)", amount, paidByUserId: currentUserId, splitType: "equal", splitInput: { type: "equal", participantIds } });`
  - Then `await setReceiptGroup(splitModalReceipt.id, g.id, authToken);`
  - On error: `Alert.alert("Share Failed", e instanceof Error ? e.message : String(e));`
- Clear group: same catch with "Share Failed".

---

## 8. API CLIENT

**File:** `frontend/src/api/client.ts`

- **createGroup**: `fetch(\`${getBaseURL()}/api/groups\`, { method: "POST", ... })` — **no** `/create`.
- **GroupDashboardResponse** type includes **`isAdmin?: boolean`**.

---

## Quick checklist when something breaks

| Symptom | Check |
|--------|--------|
| Group page shows "Group not found" for new group | Backend GET /:id/dashboard returns 200 with isAdmin + members (owner included). Frontend shows real error when API fails (errorMsg). |
| Edit/Delete not visible | Backend sends `isAdmin: true` for owner; frontend uses `!!dashboard?.isAdmin`. |
| Infinite loading / backend hang | simplifyDebts has MAX_ITERATIONS 1000 and round/filter. |
| Basket Finalize does nothing / no prices | GET /api/transactions includes store + items; Insights refetch catch does not clear store. |
| Library Share to group fails | Use `shareReceiptToGroup(receiptId, groupId, authToken)` — single atomic endpoint; Alert "Share Failed" on catch. |
| Create group fails | Frontend calls POST /api/groups (not /api/groups/create). |

---

## Full repo audit — shared group expense flow (latest)

### 1. Exact root cause

| Area | Root cause |
|------|------------|
| **API client** | `setReceiptGroup`, `getGroup`, `getBalancesForUser`, `getBalancesForGroup`, `settlePayment` used `err.error` only; backend may send `message` or omit `error`. Failed fetches could surface generic fallback instead of real server message. |
| **setReceiptGroup** | Used `baseURL` (module-level) instead of `getBaseURL()`; inconsistent with other group APIs; could use stale URL if config changes. |
| **Backend expense** | Catch block returned 400 for all errors; unexpected DB/server failures should return 500 to distinguish from validation (4xx). |
| **Library Share** | No loading state during share; double-tap could trigger duplicate expense creation; no visual feedback. |
| **Participant IDs** | (Previously fixed) Frontend used `m.id ?? m.userId`; backend split logic expects **userId**. Standardized to `m.userId` everywhere. |

### 2. Exact files changed

| File | Changes |
|------|---------|
| `frontend/src/api/client.ts` | `getGroup`, `getBalancesForUser`, `getBalancesForGroup`, `settlePayment`, `setReceiptGroup`: error extraction `errorData.message \|\| errorData.error \|\| \`Server responded with ${res.status}\``; `setReceiptGroup` uses `getBaseURL()` instead of `baseURL`. |
| `backend/src/routes/expenses.ts` | POST /add catch: `res.status(500)` instead of 400 for unexpected errors. |
| `frontend/app/modal/library.tsx` | `shareLoading` state; disable group rows during share; ActivityIndicator while loading; `setShareLoading` in try/finally. |
| `frontend/app/group/[id].tsx` | `useFocusEffect` to refetch dashboard when screen gains focus (fixes stale data after Library share). |
| `backend/src/routes/payments.ts` | Enforce `payerId === user.id`; 403 "You can only record payments you made" if mismatch. |

### 3. Concise explanation of each fix

- **API error extraction** — All group/expense/receipt APIs now throw with `errorData.message || errorData.error || \`Server responded with ${res.status}\``. No silent downgrade to "Group not found"; backend errors surface in UI.
- **setReceiptGroup getBaseURL** — Uses `getBaseURL()` for consistency with other group APIs; ensures correct base URL at call time.
- **Expense catch 500** — Unexpected errors (DB, Prisma, etc.) return 500; validation/auth errors remain 4xx. Client can distinguish server vs validation failures.
- **Library share loading** — `shareLoading` prevents double-tap; ActivityIndicator shows progress; disabled state during share.
- **Group page refresh on focus** — `useFocusEffect` refetches dashboard when returning from Library or navigating back; no stale data.
- **Settle payment auth** — Backend enforces payerId === authenticated user; prevents recording payments on behalf of others.

### 4. Verification: create path vs read path

| Path | Verified |
|------|----------|
| **Create** | Expense created with `groupId` (required in schema); splits use `userId`; balances updated; activity log written; receipt.groupId set via setReceiptGroup. |
| **Read** | Dashboard `prisma.expense.findMany({ where: { groupId } })` — only group expenses; no personal expense mixing. |
| **Group expenses vs personal** | Expense model requires `groupId`; all expenses are group expenses. Receipts can have `groupId` null (personal) or set (linked to group). |

### 5. Regression checklist

- [ ] **Create group** — POST /api/groups (no /create) → group appears.
- [ ] **Open group** — GET dashboard → no infinite load; on API fail: "Backend Error" + message + Retry / Go back.
- [ ] **Error display** — 401/404/500 → real message shown, not "Group not found".
- [ ] **Add manual expense** — description + amount → Add → 201 → modal closes, form clears, **await load()** → dashboard refreshes.
- [ ] **Share receipt to group** — Library → Split with Group → pick group → `shareReceiptToGroup(receiptId, groupId)` (atomic); no "Share Failed"; receipt linked; loading indicator; idempotent (retry creates no duplicate).
- [ ] **Balances update** — After add expense, Balances tab shows new simplified balances.
- [ ] **Total spending** — Hero "Total group spending" increases after add expense.
- [ ] **Recent expenses** — Expenses tab shows new expense.
- [ ] **Owner Edit/Delete** — `dashboard.isAdmin` true for owner; "Edit / Delete" visible.
- [ ] **Failed fetch throws** — All group/expense/receipt APIs throw on !res.ok; none return null.
- [ ] **Backend errors surfaced** — Error extraction uses message/error/status; UI shows real backend message.

---

## Atomic receipt share flow (latest)

**Replaced two-step addExpense + setReceiptGroup with single endpoint.**

### Business rule: one receipt can create one expense per group

- Same receipt can be shared to different groups (each gets its own expense).
- Same receipt shared to the same group twice = idempotent (no duplicate).

### Files changed

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Expense: added `receiptId String?`, `receipt Receipt?`, `@@unique([receiptId, groupId])`; Receipt: added `expenses Expense[]`. |
| `backend/src/services/receiptShareService.ts` | New: `shareReceiptToGroup(receiptId, groupId, userId)` — atomic transaction. |
| `backend/src/routes/receipts.ts` | New `POST /:id/share-to-group`; imports shareReceiptToGroup. |
| `frontend/src/api/client.ts` | New `shareReceiptToGroup(receiptId, groupId, idToken)`. |
| `frontend/app/modal/library.tsx` | Replaced addExpense+setReceiptGroup with single `shareReceiptToGroup`; when `alreadyShared` shows Alert "Already shared". |

### Route/controller/service design

- **Route:** `POST /api/receipts/:id/share-to-group` — body `{ groupId }`.
- **Service:** `shareReceiptToGroup(receiptId, groupId, userId)` in `receiptShareService.ts`.
- **Transaction:** Yes — `prisma.$transaction(async (tx) => { ... })` wraps: validate receipt + group + membership → idempotency check → create expense → create splits → update balances → update receipt.groupId → create activity log.
- **Duplicate prevention:** `@@unique([receiptId, groupId])` in schema; before creating, `findFirst({ where: { receiptId, groupId } })`. If exists, return `{ expenseId, alreadyShared: true }` (idempotent). Frontend shows Alert "Already shared" when `alreadyShared`.
- **Success:** `{ success: true, expenseId, alreadyShared? }`; modal closes, triggerDashboardRefresh.
- **Failure:** Alert "Share Failed" with backend message.

### Regression checklist (atomic share)

- [ ] **Successful share** — Library → Split with Group → pick group → success; modal closes; expense appears in group; receipt linked.
- [ ] **Failed share** — Invalid receipt/group/not member → "Share Failed" with message; no partial state.
- [ ] **Retry after failure** — Retry creates one expense; no duplicate.
- [ ] **No duplicate on retry** — Share same receipt to same group twice → second call returns `alreadyShared: true`; no duplicate expense.
- [ ] **Dashboard updates** — Group page (useFocusEffect) refreshes when returning; new expense visible.
