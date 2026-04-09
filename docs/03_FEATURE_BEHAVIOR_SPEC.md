# Purpose
This file is the practical product-spec: how the app is supposed to behave tab by tab and flow by flow. It distinguishes Implemented, Partially implemented, and Intended / not yet implemented so that no one treats unfinished work as complete.



---

## Document Version

| Field | Value |
|-------|--------|
| **Last updated** | 2026-04-08 |
| **App version / build / commit** | Build/commit not recorded in current docs |
| **Updated by** | Automated truth-alignment (MCP + repo) |
| **Status of confidence** | Partially verified (MCP-verified appendix added) |

---

## Read This First

- **Not all features are fully implemented.** Do not assume a feature works because it appears in the UI. Check the status labels in each section and the "Important product constraints" section.
- **For current weak spots and remaining issues,** use **`docs/04_AUDIT_FIXES_AND_ROADMAP.md`** as the authoritative source. That file lists symptoms, root causes, and priorities; this file describes expected behavior and implementation status.
- Use strict certainty tags where used: **Needs verification**, **Partially verified**, **Unclear from current implementation**. Do not invent certainty.

---

## MCP-verified snapshot (live environment + DB)

**Date captured:** 2026-04-08  
**Sources:** Supabase MCP (`project-0-SmartBudgetAI-supabase`) + Firebase MCP (`project-0-SmartBudgetAI-firebase`)  

### Firebase (Auth / hosting)

- **Active Firebase project ID**: `gen-lang-client-0109962256` (alias: `default`)
- **Authenticated CLI/MCP user**: `parth510cr7@gmail.com`
- **Billing enabled**: No
- **Hosting root**: `firebase-public/` (from `firebase.json`)
- **Detected App IDs**: `<NONE>` (MCP did not detect registered app IDs)

### Database (Supabase Postgres)

**Notes:**
- Row counts below are *current contents* and will change over time. They are useful to sanity-check “is this feature being used in this environment?”.
- RLS is currently **disabled** on these tables (per MCP `list_tables` output); access control is enforced by the backend API layer.

**Core spending tables (non-empty):**
- `User` (105), `Store` (177), `Receipt` (146), `Item` (264)
- `PriceRecord` (702)

**Collaboration + saved lists tables (present but currently empty in this DB snapshot):**
- Groups: `Group`, `GroupMember`, `Expense`, `ExpenseSplit`, `Balance`, `Payment`, `ActivityLog`, `GroupInviteLink` (0 rows)
- Household: `Household`, `HouseholdMember`, `HouseholdInvite` (0 rows)
- Smart lists: `SmartList`, `SmartListItem` (0 rows)
- Basket personalization: `BasketTermPreference` (0 rows)

### DB enums (meaningful “truth” for behavior)

- **`ReceiptVisibility`**: `PERSONAL` | `HOUSEHOLD`
- **`ShareMode`** (for `PriceRecord.shareMode`): `NONE` | `PRIVATE` | `GROUP` | `COMMUNITY`

### DB relationship highlights (what links to what)

- **Receipts**
  - `Receipt.userId -> User.id`
  - `Receipt.storeId -> Store.id`
  - optional: `Receipt.groupId -> Group.id`
  - optional: `Receipt.householdId -> Household.id`
  - optional: `Receipt.uploadedByUserId -> User.id` (used for household attribution)
- **Items**
  - `Item.receiptId -> Receipt.id`
- **Groups ledger**
  - `Group.ownerId -> User.id`
  - `GroupMember.groupId -> Group.id`, `GroupMember.userId -> User.id`
  - `Expense.groupId -> Group.id`, `Expense.paidByUserId -> User.id`, optional `Expense.receiptId -> Receipt.id`
  - `ExpenseSplit.expenseId -> Expense.id`, `ExpenseSplit.userId -> User.id`
- **Household**
  - `Household.ownerUserId -> User.id`
  - `HouseholdMember.householdId -> Household.id`, `HouseholdMember.userId -> User.id`

**Interpretation tip:** If the UI shows a feature but its backing tables are empty in the active environment, that feature may be implemented but simply unused (or you’re pointing at a “demo” DB).

---

# SmartBudget Feature Behavior Spec

## 1. Behavior status legend

- **Implemented** — Feature exists, is wired, and works as described in normal conditions. May still have edge cases or dependency on permissions (e.g. contacts).
- **Partially implemented** — Feature exists and is used but has gaps: e.g. backend ready and UI missing, or UI present but behavior incomplete or dependent on external factors (permissions, data, backend contract).
- **Intended / not yet implemented** — Desired product behavior that is not built or is explicitly deferred. Do not present as live.

---

## Not Implemented on Purpose

The following are **intentionally not implemented** (product rules); do not treat them as bugs or missing features:

- **No transfer of group ownership** — The group creator remains the fixed owner/admin. There is no UI or API to transfer ownership to another member. Owner cannot leave without deleting the group.
- **No auto-adding new members to past expenses** — When a new member joins a group, they are not automatically added to existing expenses. The user must edit each expense to include the new member in the participant list.
- **No fake best-store logic** — When confidence is weak or data is insufficient, the app must show a fallback message (e.g. "Don't have best pick yet") instead of recommending a specific store. Do not invent precision.
- **No raw backend errors to users** — Backend errors should be mapped to user-friendly messages where possible.
- **No exact address exposure in community data** — Community pricing remains aggregate-only; no individual user or exact address exposure.

---

## 2. Home tab behavior

| Section | Expected behavior | Status |
|---------|-------------------|--------|
| Summary cards | Total spent (hero), category bars from backend summary, total stores. Tappable hero can open a modal. | Implemented |
| Categories | Category names and amounts (and progress) from GET summary. | Implemented |
| Recent transactions | Recent receipts strip (e.g. slice of 5 from getReceipts). Tapping navigates to receipts/list. | Implemented |
| Add transaction | No standalone “add transaction” button; adding is via Scan (new receipt) or backend transactions. | Implemented (by design) |
| Empty states | When no receipts/summary, UI should show sensible empty state. | Implemented (**Needs verification** for exact copy) |
| Navigation | To Receipts, Stores, Profile. | Implemented |

---

## 3. Search tab behavior

| Section | Expected behavior | Status |
|---------|-------------------|--------|
| Top app-query bar | Single bar; placeholder “Ask SmartBudget about your spending.” On submit: call app-query first (real data), then AI chat. Show “From your data” and/or “SmartBudget” reply. | Implemented |
| Supported question types | Spend by store, spend by category, top category, recent purchase, cheapest store for item, group spending / my groups. Other phrasing may fall back to general summary or AI. | Implemented (keyword/regex intent; phrasing gaps possible) |
| Basket flow | User adds items (chips), can remove or clear all. State in Zustand. | Implemented |
| Finalize basket | Build itemNames (and optional lat/lng if consented) → POST /api/basket/insights. Show recommended store and estimated total, or fallback when no/weak best store. | Implemented |
| Empty-state category view | When basket empty, fetch topSpendCategories (e.g. getBasketInsights with empty itemNames) and/or local aggregation; show category/store tiles. | Partially implemented (**Needs verification**: timing/race can sometimes show empty until refocus; fallbacks exist) |
| Basket insights mode | Best store, your history, group, community (when data/consent). | Implemented (backend); UI shows result or fallback. |
| No-fake-store logic | When confidence is low or no best store, show fallback message instead of a fake recommendation. | Implemented (basketInsightsService / bestStore.enabled and fallback message) |
| Community / location | Location consent modal when needed; coords sent only when user has consented. Community results aggregate-only. | Implemented (consent and send); community aggregation behavior **Needs verification**. |

---

## 4. Scan tab behavior

| Section | Expected behavior | Status |
|---------|-------------------|--------|
| New scan | Opens scanner modal (camera). Capture → optional OCR → upload/process → receipt saved. | Implemented |
| Upload / library | Upload from photos (gallery); Library modal lists receipts from API. | Implemented |
| Receipt persistence | Backend creates Store, Receipt, Item; receipt appears in list and in transactions/summary. | Implemented |
| Library actions | List, delete receipt. “Split with Group” → select group → split mode and participants → share. | Implemented |
| Split with group | shareReceiptToGroup(receiptId, groupId, participantIds). One expense per (receipt, group). Receipt-backed expense has receiptId/receiptUrl; visible in group. | Implemented |
| Success / failure | Success and error feedback after share/delete. | Implemented |

---

## 5. Group / Shared behavior

### 5.1 Group creation

- User can create a group (name, type). Backend creates Group with current user as owner.  
- **Status:** Implemented.

### 5.2 Group detail screen

- Tabs: Expenses, Balances, Prices. Summary card, member list, add expense FAB, expense list (with receipt icon/subtitle for receipt-backed), balances list with Settle, price records list.  
- **Status:** Implemented.

### 5.3 Member list

- Shows owner and members; owner indicated. Tapping a member can open action sheet (View details, Remove, Done).  
- **Status:** Implemented.

### 5.4 Add member methods

| Method | Expected behavior | Status |
|--------|-------------------|--------|
| Manual | Add by name/email via invite sheet. Backend POST /groups/:id/members. | Implemented |
| Contacts | Add from device contacts (expo-contacts). | Partially implemented (depends on permission; may fail or show empty) |
| Invite link | Create link, Share or Copy link. Recipient can join via /join/[token]. | Implemented |
| Copy link | Copy invite link (e.g. smartbudget://join/{token}) to clipboard. | Implemented |
| AirDrop | No dedicated in-app AirDrop button; user can use system Share and choose AirDrop. | Intended behavior (system Share); no separate AirDrop entry. |

### 5.5 Member states

- **Owner** — Creator; fixed; cannot transfer ownership. Shown in member action header.  
- **Joined** — Member who joined via link or was added.  
- **Invited** / **pending** — Not explicitly modeled in UI as separate states; invite is link-based, join is immediate on token use.  
- **Status:** Owner vs joined implemented; invited/pending as first-class states not fully called out.

### 5.6 Remove member rules

- **When allowed:** Member can be removed when they have no unsettled balance (or backend allows).  
- **When blocked:** Frontend disables Remove and shows helper (e.g. “Settle balances before removing this member”) when member has unsettled balance. Backend may return error on remove when balances exist.  
- **Status:** Implemented (with possible generic error mapping to “Can’t remove member” under load; **Needs verification**: possible generic error mapping to "Can't remove member" under load).

### 5.7 Expense creation

- Description, amount, paid-by (compact row → payer picker sheet), split mode (All members / Selected members), participant list with Select all when Selected. At least one participant required. Live summary; Add/Cancel.  
- **Status:** Implemented. participantIds and paidByUserId sent correctly; backend dedupes and validates.

### 5.8 Expense editing

- User can edit description, amount, paid-by, and participants (including newly added members). Backend replaces splits and recalculates balances. Balance warning shown.  
- **Status:** Implemented.

### 5.9 Expense deletion

- Confirmation alert; delete expense API; then refresh list and balances.  
- **Status:** Implemented.

### 5.10 Expense detail

- Tapping an expense opens detail (e.g. bottom sheet): description, amount, paid by, date, split summary, source label (Manual / From scanned receipt), receipt block (when receipt-backed), split breakdown, Edit, Delete, Done.  
- **Status:** Implemented.

### 5.11 Receipt-backed group expense behavior

- List shows receipt icon and subtitle (“From scanned receipt” and store name when available). Detail shows source label, receipt card (store, date, uploader, line items), and “View receipt” when receiptUrl or receipt.imageUrl exists (opens URL).  
- **Status:** Implemented.

### 5.12 Owner / admin rule

- Creator is owner; no ownership transfer. Owner cannot leave without deleting the group (error message: “Owner cannot leave. Delete the group if you no longer need it.”).  
- **Status:** Implemented. Transfer ownership route and client function removed.

### 5.13 Balance logic

- Pairwise balances (who owes whom). Payer is creditor; participants owe the payer. Settle creates a payment and updates balances. Dashboard returns simplified balances; Settle button calls settlePayment then load().  
- **Status:** Implemented.

---

## 6. Profile / Privacy behavior

| Section | Expected behavior | Status |
|---------|-------------------|--------|
| Auth buttons | Sign in (Apple/Google via login modal), Log out. | Implemented |
| Reset app data | Purge/revert user data; backend purge and refresh. | Implemented |
| Location consent | Location access status shown; “Use location for nearby community pricing” toggle; “Disable location for pricing” where applicable. | Implemented |
| Nearby community toggle | User can enable/disable use of location for community/nearby. | Implemented |
| Privacy wording | No misleading claims; location and community opt-in clear. | Implemented |
| Share my price history | Entry point was removed from Profile so users are not offered a non-working create-share flow. Modal still exists but is not linked from main flow. | Implemented (deferred feature hidden). |
| Developer section | Check connection, Load demo data, Seed test group when “Developer” expanded. | Implemented (visible by design; may be production-visible). |

---

## 7. Price sharing / community behavior

| Section | Expected behavior | Status |
|---------|-------------------|--------|
| Private sharing | Backend POST /api/prices/share/private exists. No UI in main flow to create a share (target user, scope). | Backend implemented; UI not in main flow (deferred). |
| Group share | Price records with shareMode GROUP; group Prices tab shows group price records. | Implemented |
| Community aggregation | Backend communityService and CommunityPriceAggregate; aggregate-only; no individual exposure. | Implemented (backend); radius/aggregation behavior may need verification. |
| Local / nearby | Coords sent with basket finalize when consented; used for nearby/community when implemented. | Implemented (send); backend usage may need verification. |
| Create-share UI | Not in main flow. Modal price-history-sharing exists but is not linked from Profile. | Intended / not yet in main flow. |

---

## 8. App-query / smart search behavior

| Section | Expected behavior | Status |
|---------|-------------------|--------|
| What user can ask | Natural-language-style questions; intent detected by keywords/regex. | Implemented |
| Supported today | Spend by store, by category, top category, recent purchase, cheapest store for item, group spending / my groups. General summary when no specific intent. | Implemented |
| Fallback | Unmatched phrasing returns general summary and/or AI reply. | Implemented |
| Natural-language limits | Simple keyword/regex; e.g. “how much did I spend at Walmart?” may not map to “spend by store” and may fall back to general/AI. Expanding intent coverage is future work. | Documented limitation. |

---

## Supported App Query Examples

These phrasings are intended to trigger the corresponding app-data answer (when the user has data). **Partially verified** — exact keyword matching is implemented in `appQueryService`; phrasing may vary.

| Intent | Example queries |
|--------|-----------------|
| Spend by store | "spend by store", "by store" |
| Spend by category | "spend by category", "by category" |
| Top category | "top category", "highest category" |
| Recent purchase | "recent purchase", "recent receipt", "last receipt" |
| Cheapest store for item | "cheapest store for milk", "best price for eggs", "where to buy [item]" |
| Group summary | "group spending", "my groups", "group expense" |
| General | Empty or unmatched → short summary + hint to try the above. |

---

## Known App Query Limits

- **Intent detection:** Keyword- and regex-based only. Natural phrasing such as "how much did I spend at Walmart?" or "what's my biggest category?" may not map to spend-by-store or top-category and will fall back to general summary or AI reply.
- **Item extraction for "cheapest store":** Item name is parsed from the query (e.g. text after "for" or "price of"); fuzzy matching on receipt item names is limited.
- **No receipt search by text:** There is no search/filter of the receipt library by query string (e.g. by store name or item name). App-query answers are aggregated (by store, category, etc.), not a list of matching receipts.
- **Unclear from current implementation:** Full list of regex patterns and edge cases; recommend inspecting `backend/src/services/appQueryService.ts` for exact triggers.

---

## 9. Important product constraints

- **No fake precision** — Do not show a “best store” when confidence is weak; show fallback message.
- **No raw backend errors to users** — Map to user-friendly messages where possible.
- **No auto-adding new members to past expenses** — User must edit each expense to include a newly added member.
- **No exact address exposure in community data** — Community remains aggregate-only.
- **No transfer ownership flow** — Creator remains fixed owner; route and client function removed.
- **Scanned receipt traceability** — When a receipt is used in a group expense, the expense must retain source receipt linkage and “View receipt” when a URL exists.
