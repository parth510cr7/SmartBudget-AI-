# Purpose
This file explains how SmartBudget is built: tech stack, app structure, high-level architecture, main backend and frontend domains, core data models, important data flows, state/refresh behavior, main API routes, and known architecture weaknesses.

---

## Document Version

| Field | Value |
|-------|--------|
| **Last updated** | 2025-03-05 |
| **App version / build / commit** | Build/commit not recorded in current docs |
| **Updated by** | Phase 1 Documentation Refinement (Truth-Alignment Pass) |
| **Status of confidence** | Partially verified |

---

## Read This First

- **Not all flows or routes are fully implemented or used by the UI.** Where behavior is partial or unclear, it is marked with **Needs verification**, **Partially verified**, or **Unclear from current implementation**.
- **For current weak spots and remaining issues,** use **`docs/04_AUDIT_FIXES_AND_ROADMAP.md`** as the authoritative source. Do not assume a flow works end-to-end because it is documented here.

---

## Source of Truth Hierarchy

| Doc | Role |
|-----|------|
| **01_PRODUCT_OVERVIEW.md** | Product intent, vision, tabs, pillars, glossary. Not implementation truth. |
| **02_ARCHITECTURE_AND_DATA_FLOW.md** | System structure: stack, folders, models, flows, routes. How the app is built. |
| **03_FEATURE_BEHAVIOR_SPEC.md** | Expected behavior tab-by-tab and flow-by-flow; Implemented / Partially implemented / Intended. |
| **04_AUDIT_FIXES_AND_ROADMAP.md** | Known issues, completed fixes, priorities, testing checklist, handoff. **Read this first for current weak spots.** |

---

# SmartBudget Architecture and Data Flow

## 1. Tech stack

| Layer | Technology | Purpose |
|-------|------------|--------|
| **Frontend** | Expo (SDK 54), React 19, expo-router | Mobile app, file-based navigation, tabs/stack/modals |
| **Frontend state** | Zustand | Global state (user, theme, transactions, basket, etc.) |
| **Frontend auth** | Firebase (Apple/Google sign-in) | ID token; backend verifies and upserts user |
| **Frontend other** | lucide-react-native, expo-camera, expo-image-picker, expo-contacts, expo-location, expo-file-system | Icons, receipt capture, gallery, contacts, location, file handling |
| **Backend** | Express 5, Node.js | HTTP API server |
| **Backend DB** | Prisma, PostgreSQL | ORM and database |
| **Backend auth** | Firebase Admin | Token verification, user lookup/upsert |
| **Backend AI** | @google/generative-ai (Gemini) | Receipt OCR/categorization, AI chat context |
| **Backend other** | Multer (uploads), Socket.io (minimal), Fuse.js (fuzzy search) | Multipart receipt uploads, real-time (group rooms), item matching |

---

## 2. App structure

### Frontend (high level)

- **`app/`** — Expo Router screens: `_layout.tsx`, `auth.tsx`, `(tabs)/` (index, insights, scan, shared, receipts, stores, profile, etc.), `modal/` (scanner, login, library, price-history-sharing), `group/[id].tsx`, `join/[token].tsx`.
- **`src/api/client.ts`** — All API calls (auth, receipts, transactions, groups, expenses, balances, payments, basket, app-query, AI chat, prices, user, etc.).
- **`src/store/useStore.ts`** — Zustand store (user, theme, basket, transactions, refreshKey, expensePrefill, etc.).
- **`src/theme.ts`** — Colors, `getTheme(isDarkMode)`.
- **`src/lib/`** — e.g. `localDb.ts`, `locationConsent.ts`.
- **`src/components/`** — Reusable UI (e.g. LocationConsentModal, CategoryEmptyStateTiles, SpendingGlassTileBoard).

### Backend (high level)

- **`src/index.ts`** — Express app, CORS, JSON body, route mounting, Socket.io, error handler. Port 8080 default.
- **`src/middlewares/auth.ts`** — Firebase token verification; sets `req.auth`; `requireAuth` used on most API routes.
- **`src/routes/`** — auth, receipts, transactions, groups, expenses, balances, payments, prices, basket, ai, appQuery, user, reports, smartlist, demo.
- **`src/services/`** — expenseService (splits, balances), receiptShareService (share receipt to group), priceRecordService, basketInsightsService, communityService, aiService; receipt_engine for text-based parsing.
- **`prisma/schema.prisma`** — Data models; PostgreSQL.

### Docs folder

- **`/docs`** — Holds the four consolidated markdown files (product overview, architecture, feature behavior spec, audit/fixes/roadmap). Intended as the single source of truth for product and implementation knowledge.

---

## 3. High-level architecture

- **Mobile UI** (Expo/React) uses Zustand and calls **API layer** (Express) with `Authorization: Bearer <idToken>` (or dev-token for local).
- **API layer** verifies token, loads/upserts user, then talks to **PostgreSQL** via Prisma. Receipt images can be uploaded (Multer); receipt parsing uses **Gemini** or backend **receipt_engine** (text pipeline).
- **Group logic** lives in routes (groups, expenses, balances, payments) and **expenseService** (splits, balance updates); **receiptShareService** creates group expense from receipt and links `receiptId`/`receiptUrl`.
- **Price intelligence**: receipt upload/share can sync to **PriceRecord** (priceRecordService); **basketInsightsService** powers basket finalize; **communityService** and **CommunityPriceAggregate** for aggregate community data. **App-query** (appQueryService) answers natural-language-style questions from receipts and groups.

---

## 4. Main backend domains

| Domain | Routes / services | Responsibility |
|--------|-------------------|----------------|
| **Auth** | auth.ts | Verify token, sync/upsert user |
| **Receipts** | receipts.ts | GET list, POST upload/process-text/from-local/from-base64, share to group, delete |
| **Transactions / summary** | transactions.ts | GET list, GET stores, GET summary, DELETE purge |
| **Groups** | groups.ts | CRUD groups, members, invite-link, join-by-token, dashboard (expenses, balances, price_records, activity_log), leave |
| **Expenses** | expenses.ts, expenseService | Add expense (splits, balances), PUT update (replace splits, recalc balances), DELETE |
| **Balances / payments** | balances.ts, payments.ts, expenseService | Get balances, settle payment |
| **Prices** | prices.ts, priceRecordService, communityService | Group prices, private share API, community opt-in/out, aggregates |
| **Basket insights** | basket.ts, basketInsightsService | POST /insights: itemNames, optional lat/lng → best store, estimated total, your history, group, community |
| **App query** | appQuery.ts, appQueryService | POST /: query string → intent detection → answer from receipts/groups (spend by store/category, top category, recent, cheapest store for item, group summary) |
| **AI chat** | ai.ts, aiService | POST /chat: message + receipt context → Gemini reply |

---

## 5. Main frontend domains

| Domain | Main files | Responsibility |
|--------|------------|-----------------|
| **Home** | (tabs)/index.tsx | Summary, categories, recent receipts, nav to Receipts/Stores/Profile |
| **Search / Insights** | (tabs)/insights.tsx | App-query bar, basket UI, Finalize, empty-state tiles, location consent, appQuery + askSmartBudget |
| **Scan** | (tabs)/scan.tsx, modal/scanner.tsx, modal/library.tsx | Scan entry, camera/gallery, library list, delete, Split with Group |
| **Groups list** | (tabs)/shared.tsx | List groups, create, delete, open group |
| **Group dashboard** | group/[id].tsx | Tabs (Expenses, Balances, Prices), add expense, expense detail, edit/delete, member list, invite sheet, paid-by picker, participant selection |
| **Join by token** | join/[token].tsx | Join group by invite token, redirect to group or list |
| **Profile / Privacy** | (tabs)/profile.tsx, modal/login.tsx | Auth, location toggle, reset data, dev section |
| **API client** | src/api/client.ts | All fetch calls to backend |
| **Shared components** | src/components/, theme, lib | LocationConsentModal, category tiles, theme, locationConsent |

---

## 6. Core data models

| Model | Represents | Key fields | Important relationships |
|-------|------------|------------|--------------------------|
| **User** | App user (synced from Firebase) | id, firebaseId, email, name, displayName, avatarUrl, isCommunityOptIn | Stores, Receipts, Group owner/members, Expense paidBy/createdBy, ExpenseSplit, Balance, Payment, PriceRecord, PriceSharePermission |
| **Store** | Store where user shopped | id, userId, name, address, lat, lng | Receipts (storeId) |
| **Receipt** | One scanned/uploaded receipt | id, userId, storeId, date, total, imageUrl, groupId | Store, User, Items, Expense (when receipt shared to group) |
| **Item** | Line item on a receipt | id, receiptId, name, rawName, quantity, unit, unitPrice, totalPrice, category | Receipt |
| **Group** | Expense-sharing group | id, name, type, description, ownerId | Owner, GroupMember, Receipt (optional groupId), Expense, ActivityLog, GroupInviteLink |
| **GroupMember** | Membership in a group | id, groupId, userId, role | Group, User |
| **GroupInviteLink** | Invite token for a group | id, token, groupId, expiresAt | Group |
| **Expense** | Group expense | id, description, amount, paidByUserId, groupId, receiptId, receiptUrl, category | Group, User (paidBy, createdBy), Receipt (optional), ExpenseSplit |
| **ExpenseSplit** | One user’s share of an expense | id, expenseId, userId, amountOwed | Expense, User. Unique (expenseId, userId). |
| **Balance** | Pairwise balance in a group | id, user1Id, user2Id, groupId, balanceAmount | User (user1, user2), Group. Unique (user1Id, user2Id, groupId). Convention: positive = user2 owes user1. |
| **Payment** | Settlement between two users | id, payerId, receiverId, groupId, amount | User (payer, receiver), Group |
| **PriceRecord** | One price observation (from receipt or share) | id, ownerUserId, shareMode (NONE/PRIVATE/GROUP/COMMUNITY), groupId, rawStoreName, canonicalStoreName, rawItemName, canonicalItemName, price, quantity, unit, purchaseDate, cityOrArea | User (owner, createdBy) |
| **PriceSharePermission** | Permission to see another user’s prices | id, ownerUserId, targetUserId, targetGroupId, permissionType, shareScope, scopeConfig, revokedAt | User |
| **CommunityPriceAggregate** | Aggregate community price (no individual link) | id, canonicalItemName, canonicalStoreName, regionBucket, averagePrice, lowestPrice, highestPrice, dataPointCount | No user FK; unique (canonicalItemName, canonicalStoreName, regionBucket) |

Other models (SmartList, MedicalFolder, Income, RecurringPayment, BudgetSettings, ActivityLog, etc.) exist in the schema; the above are the ones most relevant to the core flows described in this doc.

---

## 7. Important data flows

### Receipt scan flow

1. User opens Scanner (camera or gallery) → image captured/picked.
2. Optional on-device OCR; then either `POST /api/receipts/process-text` (full engine) or `POST /api/receipts/from-base64` (Gemini vision) or equivalent.
3. Backend creates/updates Store, Receipt, Item records; optionally syncs to PriceRecord (priceRecordService).
4. Receipt can later be assigned to a group or shared to group via Library → “Split with Group” → `shareReceiptToGroup(receiptId, groupId, participantIds)`.

### Basket insights flow

1. User adds items to basket (Zustand) in Search tab.
2. User taps Finalize → optional location (if consented) → `POST /api/basket/insights` with itemNames and optional lat, lng, locationAccuracy.
3. basketInsightsService returns best store, estimated total, your history, group/shared, community (aggregate) as configured.
4. UI shows recommendation or fallback message (no fake best store when confidence low).

### Group expense flow

1. User adds expense: description, amount, paidByUserId, splitInput (e.g. equal + participantIds).
2. `POST /api/expenses/add` → expenseService computes splits, creates Expense + ExpenseSplit rows, updates Balance (pairwise debts).
3. Edit: `PUT /api/expenses/:id` with new description, amount, paidByUserId, splitInput → backend reverses old balances, deletes old splits, updates expense, creates new splits, applies new balances.
4. Delete: `DELETE /api/expenses/:id` → reverse balances, delete expense and splits.

### Receipt-to-group flow

1. User has receipt in Library → “Split with Group” → selects group, split mode (all/selected), participants.
2. `shareReceiptToGroup(receiptId, groupId, userId, participantIds)` (receiptShareService): loads receipt and group, checks unique (receiptId, groupId), creates Expense with receiptId and receiptUrl, creates splits, updates balances, sets receipt.groupId.
3. Group dashboard and expense detail include receipt (store, items, user); “View receipt” when imageUrl/receiptUrl exists.

### Member invite / join flow

1. **Invite link:** Create link → `POST /api/groups/:id/invite-link` (or equivalent) → backend creates GroupInviteLink with token → frontend gets inviteUrl/token; user can Share or Copy link (`smartbudget://join/{token}` or web).
2. **Join:** Recipient opens `/join/[token]` → `joinGroupByToken(idToken, token)` → backend validates token, adds user as member (or finds existing) → redirect to group or groups list.
3. **Manual add:** `POST /api/groups/:id/members` with name/email; backend may create ghost user and GroupMember.
4. **Contacts:** Frontend uses expo-contacts to pick contact; then typically name/email sent to same members endpoint. Depends on permissions; may fail or show empty if denied.

### App-query flow

1. User types question in Search bar and submits.
2. Frontend calls `appQuery(idToken, query)` → `POST /api/app-query` with `{ query }`.
3. appQueryService loads user’s receipts (with store, items) and groups; detects intent (spend by store, by category, top category, recent purchase, cheapest store for item, group summary); builds answer from real data.
4. Returns `{ answer, data? }`. Frontend then may also call `askSmartBudget` (AI chat with receipt context) and show both “From your data” and “SmartBudget” when both exist.

---

## 8. State and refresh behavior

- **After add expense:** Frontend calls `load()` (getGroupDashboard) so list and balances refresh.
- **After edit expense:** Same; dashboard reload.
- **After delete expense:** Same; optional short feedback message.
- **After add member:** Dashboard reload to include new member in list and in participant pickers.
- **After remove member:** Dashboard reload.
- **After join by token:** Redirect to group or groups list; group screen loads dashboard.
- **After finalize basket:** `basketInsights` and `showFinalized` set; UI shows result or fallback.
- **After app-query / AI ask:** Reply state set; card shows answer(s).

Refresh is typically explicit (e.g. `load()` after mutations) or on focus (e.g. useFocusEffect for summary/recent on Home or empty-state categories on Search). **Needs verification:** whether any real-time push (Socket.io) is used for group updates in production.

---

## 9. Important API routes

| Method | Path | Purpose |
|--------|------|--------|
| GET | /health | Liveness |
| POST | /api/auth/sync | Verify token, upsert user |
| GET | /api/receipts | List user’s receipts |
| POST | /api/receipts/* | Upload/process receipt (from-base64, process-text, from-local, etc.) |
| POST | /api/receipts/:id/share-to-group | Share receipt to group (participantIds optional) |
| GET | /api/transactions | List receipts (transactions) |
| GET | /api/transactions/summary | Total spent, categories, totalStores |
| GET | /api/transactions/stores | By-store visits and totalSpent |
| GET | /api/groups | List user’s groups |
| POST | /api/groups | Create group |
| GET | /api/groups/:id | Group detail with expenses (include receipt) |
| GET | /api/groups/:id/dashboard | Dashboard: recent_expenses, balances, price_records, members, etc. |
| POST | /api/groups/:id/members | Add member (name/email) |
| POST | /api/groups/:id/invite-link | Create invite link |
| POST | /api/groups/join/:token | Join group by token |
| DELETE | /api/groups/:id/members/:userId | Remove member |
| POST | /api/groups/:id/leave | Leave group |
| POST | /api/expenses/add | Add group expense |
| PUT | /api/expenses/:id | Update expense (splits replaced, balances recalculated) |
| DELETE | /api/expenses/:id | Delete expense |
| GET | /api/balances | Balances for group (or via dashboard) |
| POST | /api/payments/settle | Settle payment between two users |
| POST | /api/basket/insights | Basket insights (itemNames, optional lat/lng) |
| POST | /api/app-query | App-data query (spend by store/category, top category, recent, cheapest store for item, group summary) |
| POST | /api/ai/chat | AI chat (message + receipt context) |
| PUT | /api/user/profile | Update displayName, avatarUrl |
| DELETE | /api/transactions/purge/all | Purge user data (receipts, etc.; owned groups and related data removed) |

*Note:* Transfer ownership route (`PATCH /api/groups/:id/owner`) was removed; it is no longer registered.

---

## 10. Known architecture weaknesses and brittle flows

- **Community/nearby:** Backend has communityService and CommunityPriceAggregate; radius and aggregation wiring **Needs verification**. Frontend sends lat/lng when consented; behavior under low data or edge cases not fully documented.
- **Basket insights:** Exact conditions for “recommended store” vs “best total estimate” vs fallback depend on basketInsightsService and `bestStore.enabled`; contract should be confirmed when changing behavior. **Partially verified.**
- **Add member from contacts:** Depends on Expo Contacts permission and runtime; can fail or show empty list. **Partially verified.**
- **Real-time:** Socket.io is mounted and group rooms exist; use in production for group updates is minimal or disabled (e.g. “TEMPORARILY DISABLED” in group page). Refresh is primarily pull (load after mutation). **Unclear from current implementation** whether Socket.io is used in any live path.
- **Price share create:** Backend has private share API; no create-share UI in main flow, so capability is unused from the app.
