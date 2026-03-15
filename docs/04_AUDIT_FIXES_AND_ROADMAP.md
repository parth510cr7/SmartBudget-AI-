# Purpose
This file summarizes current reality: what is stable, what was found in audits, what fixes were completed, what remains broken or incomplete, and what should happen next. It is the handoff document for the next engineer or LLM.



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

- **Not all features are fully implemented.** This file is the **authoritative source for current weak spots and remaining issues.** Do not assume intended behavior is implemented. Use "Fixes already completed" and "Remaining known issues" (operational table) as the source of truth for what has been done vs what remains.
- **Certainty tags:** Where **Needs verification**, **Partially verified**, or **Unclear from current implementation** appear, do not invent certainty. Verify in the codebase or tests.

---

# SmartBudget Audit, Fixes, and Roadmap

## 1. Current status summary

- **Stable:** Home (summary, categories, recent receipts, navigation); Scan (camera, upload, library, delete, Split with Group); Groups (create, list, open, dashboard with Expenses/Balances/Prices); add/edit/delete expense with paid-by and participant selection; receipt-backed expense visibility and “View receipt”; invite link and join by token; balances and settle; app-query (spend by store/category, top category, recent, cheapest store for item, group summary) and AI chat in Search; Profile (auth, location toggle, reset, dev section). Transfer ownership removed end-to-end; owner leave message corrected; price-sharing entry removed from Profile.
- **Partially stable:** Basket insights (best store/estimate) depend on backend and data; empty-state category tiles can have timing/race; add member from contacts depends on Expo Contacts permission; community/nearby aggregation behavior may need verification.
- **Still needs work:** Create private price share (no UI in main flow); receipt search by text (not implemented); app-query intent coverage (keyword/regex only); optional polish (receipt thumbnail in group list, copy-link format, dev section visibility for production).

---

## 2. Major audits already performed

- **AUDIT_REPORT.md** — Full app audit (Home, Search, Scan, Groups, Profile, Price Sharing). Identified working, partial, broken, missing, and stale behavior. Called out search bar (AI-only vs receipt search), transfer ownership still in backend/client, price-sharing modal not functional, remove-member behavior.
- **FIX_REPORT.md** — Truth-alignment pass: (1) Search placeholder changed to “Ask SmartBudget about your spending”; (2) Transfer ownership removed (backend route and client function deleted, owner leave error message updated); (3) Price history sharing entry point removed from Profile (modal file kept, not linked).
- **REPAIR_REPORT.md** — Repair pass: (1) Real app-query (POST /api/app-query + appQueryService) and Search bar wired to app data first, then AI; (2) Expense update error status (400 vs 500) fixed; (3) Receipt→group traceability and expense edit/group UX verified.

---

## 3. Key issues that were found

**UI issues**

- Search bar placeholder implied “search receipts” but only AI chat existed → fixed by relabel and then by adding app-query.
- Price-sharing entry in Profile suggested a working feature → fixed by removing entry point.

**Stale logic**

- Transfer ownership route and client function remained after product rule “creator is fixed owner” → fixed by removal.
- Owner leave error said “transfer ownership first” → fixed by new message.

**Backend/frontend mismatches**

- Price share create: backend has POST /prices/share/private, no create-share UI → acknowledged; UI deferred, entry point removed so no fake feature.

**Broken flows**

- Search bar did not answer from real app data → fixed by app-query.
- Expense update always returned 400 on failure → fixed by 400 vs 500 by error type.

**Misleading copy**

- Search placeholder; owner leave message; “Share my price history” as normal action → fixed as above.

**Legacy paths**

- PATCH /api/groups/:id/owner and transferGroupOwnership → removed.

---

## 4. Fixes already completed

1. **Search bar** — Placeholder set to “Ask SmartBudget about your spending.” App-query added: POST /api/app-query, appQueryService (spend by store/category, top category, recent, cheapest store for item, group summary). Search bar calls appQuery then askSmartBudget; reply shows “From your data” and/or “SmartBudget.”
2. **Transfer ownership** — Backend route PATCH /api/groups/:id/owner removed; frontend transferGroupOwnership removed; owner leave error updated to “Owner cannot leave. Delete the group if you no longer need it.”
3. **Price history sharing** — “Share my price history” card and navigation to price-history-sharing modal removed from Profile. Modal file kept for future use; not linked from main flow.
4. **Expense update** — PUT /api/expenses/:id catch now returns 400 for participant/amount/member-style errors, 500 otherwise.
5. **Receipt→group and expense edit** — Verified: receipt-backed expense keeps receiptId/receiptUrl and “View receipt”; edit supports description, amount, paid-by, participants (including new members); splits replaced and balances recalculated.

---

## 5. Remaining known issues (operational)

Each row gives: **Symptom**, **Likely root cause**, **User impact**, **Recommended file(s) to inspect first**, **Priority**.

| Symptom | Likely root cause | User impact | Recommended file(s) to inspect first | Priority |
|---------|-------------------|-------------|-------------------------------------|----------|
| Natural phrasing in Search does not trigger spend-by-store (e.g. how much at Walmart?) | App-query intent is keyword/regex only | User gets general or AI reply instead of structured by-store answer | `backend/src/services/appQueryService.ts` | P2 |
| View receipt missing for some receipt-backed expenses | Button only shown when receiptUrl or receipt.imageUrl exists | User sees receipt metadata but cannot open image | `frontend/app/group/[id].tsx` (expense detail) | P2 |
| No way to create a private price share from the app | Create-share UI not in main flow; backend API exists | User cannot share price history with another user | `frontend/app/modal/price-history-sharing.tsx`, `backend/src/routes/prices.ts` | P1 |
| Community/nearby behavior unclear or weak with low data | Radius and aggregation wiring | Unclear or missing nearby/community insights | `backend/src/services/communityService.ts`, `backend/src/services/basketInsightsService.ts` | P1 — Verified: aggregation by (item, store, regionBucket); no geo-radius filter; region is informational. |
| Add from contacts fails or shows empty list | Expo Contacts permission denied or no contacts | User cannot add members from device contacts | `frontend/app/group/[id].tsx` (invite/contacts flow) | P1 |
| Remove member shows generic "Can't remove member" under load | Backend may return generic error; frontend maps to single message | User does not know if cause is unsettled balance or other | `backend/src/routes/groups.ts` (DELETE member), `frontend/app/group/[id].tsx` (remove member handler) | P1 |
| No search/filter receipts by store or item name | Feature not implemented | User cannot search receipt library by text | N/A (new feature); `frontend/app/modal/library.tsx`, `backend/src/routes/receipts.ts` | P2 |
| No dedicated AirDrop in invite sheet | Only system Share is used | User can use Share and pick AirDrop; no in-app cue | `frontend/app/group/[id].tsx` (invite sheet) | P2 |
| Copy invite link format (deep vs web) unclear | Documentation gap; web fallback may be missing | Recipient may not know how to open link | `frontend/app/group/[id].tsx`, API client createGroupInviteLink | P2 |
| Developer section visible in production | No __DEV__ or build flag | Test tools visible to all users | `frontend/app/(tabs)/profile.tsx` | P2 |

---

## 6. High-priority next steps

**P0 – Critical**

- None that block core use identified. Duplicate split bug and receipt traceability were addressed earlier.

**P1 – Important**

- **Price sharing:** Either add minimal create-share UI (target user + scope) and call POST /api/prices/share/private, or keep feature clearly deferred and ensure no other entry suggests it is live.
- **Community/nearby:** Verify backend radius and aggregation and document behavior for support.
- **Remove member:** Verify backend error handling and frontend messaging under unsettled-balance and other error cases.

**P2 – Polish**

- Receipt thumbnail in group expense list (optional).
- Copy invite link: document and, if needed, align deep link vs web URL for users.
- AirDrop: clarify in copy or docs that system Share supports AirDrop.
- Dev section: consider hiding behind a flag or build variant for production.
- App-query: expand intent coverage for more natural phrasing.

---

## 7. Recommended testing checklist

Use after any change to confirm core behavior.

**Home**

- [ ] Total spent and category bars load from backend.
- [ ] Recent receipts strip shows and navigates to receipts/list.
- [ ] Navigation to Profile, Receipts, Stores works.

**Search**

- [ ] Placeholder: “Ask SmartBudget about your spending.”
- [ ] Submit “spend by store” → reply from real data (or “no spending by store yet”).
- [ ] Submit “top category”, “recent purchases”, “cheapest store for [item]”, “group spending” → appropriate answers.
- [ ] Basket: add items, Finalize → insights or fallback; no fake best store when data weak.
- [ ] Empty basket: category/store tiles when data available.
- [ ] Location consent appears when intended; coords sent when consented.

**Scan**

- [ ] New Scan and Upload from Photos open scanner; receipt saves and appears in Library.
- [ ] Library: list, delete, Split with Group (select group, mode, participants) → success; expense in group with receipt data and “View receipt” when URL exists.

**Groups**

- [ ] Create group; open; see Expenses, Balances, Prices.
- [ ] Add expense: description, amount, paid-by picker, split All/Selected, participants → expense appears; balances update.
- [ ] Tap expense → detail with source, receipt block (if receipt-backed), Edit, Delete, Done.
- [ ] Edit expense: change fields, Save → list and balances refresh.
- [ ] Delete expense: confirm → removed; balances refresh.
- [ ] Member sheet: View details, Remove (disabled + helper when unsettled); no Transfer ownership.
- [ ] Invite: create link, Share, Copy link; join via smartbudget://join/{token} or web works.
- [ ] Remove member: works when no unsettled balance; blocked or clear error when balance exists.

**Profile**

- [ ] Sign in / Log out work.
- [ ] Location toggle and reset data work.
- [ ] No “Share my price history” in main flow.
- [ ] Developer section (if expanded) shows connection check, demo data, seed test group.

**Backend**

- [ ] POST /api/app-query with valid auth returns answer (and data when applicable).
- [ ] PATCH /api/groups/:id/owner not registered (404).
- [ ] PUT /api/expenses/:id: invalid payload → 400; server error → 500.

---

## 8. Files likely to matter for future fixes

**Frontend**

- `frontend/app/(tabs)/insights.tsx` — Search bar, app-query + AI, basket, empty-state.
- `frontend/app/(tabs)/index.tsx` — Home summary, recent, navigation.
- `frontend/app/(tabs)/profile.tsx` — Auth, location, reset, dev section.
- `frontend/app/(tabs)/scan.tsx` — Scan entry.
- `frontend/app/(tabs)/shared.tsx` — Groups list.
- `frontend/app/group/[id].tsx` — Group dashboard, add/edit/delete expense, expense detail, member sheet, invite, paid-by picker, participants.
- `frontend/app/modal/scanner.tsx` — Camera/gallery receipt capture.
- `frontend/app/modal/library.tsx` — Receipt library, Split with Group.
- `frontend/app/modal/price-history-sharing.tsx` — Price sharing modal (not linked from Profile).
- `frontend/app/join/[token].tsx` — Join by token.
- `frontend/src/api/client.ts` — All API calls (appQuery, askSmartBudget, groups, expenses, etc.).
- `frontend/src/store/useStore.ts` — Global state.
- `frontend/src/lib/locationConsent.ts` — Location consent.

**Backend**

- `backend/src/routes/groups.ts` — Groups CRUD, dashboard, members, invite-link, join, leave (no owner transfer).
- `backend/src/routes/expenses.ts` — Add, PUT update, DELETE expense.
- `backend/src/routes/receipts.ts` — Receipts, share-to-group.
- `backend/src/routes/basket.ts` — Basket insights.
- `backend/src/routes/appQuery.ts` — App-query.
- `backend/src/routes/ai.ts` — AI chat.
- `backend/src/routes/prices.ts` — Prices, private share, community.
- `backend/src/services/expenseService.ts` — Splits, balances.
- `backend/src/services/receiptShareService.ts` — Share receipt to group.
- `backend/src/services/appQueryService.ts` — App-query intent and answers.
- `backend/src/services/basketInsightsService.ts` — Basket insights, best store, fallback.
- `backend/src/services/communityService.ts` — Community aggregation.
- `backend/prisma/schema.prisma` — Data models.

---

## 9. Handoff notes for another LLM or engineer

**Which file to read first**

- **For current weak spots and what to fix next:** Read **this file (`docs/04_AUDIT_FIXES_AND_ROADMAP.md`) first.** Section 5 (Remaining known issues, operational table) lists Symptom, Likely root cause, User impact, Recommended files, and Priority. Section 6 gives P0/P1/P2 next steps. Section 8 lists files likely to matter for fixes.
- **For product intent and vocabulary:** Then read `docs/01_PRODUCT_OVERVIEW.md` (what the app is, tabs, pillars, glossary). It is product-level only, not implementation truth.
- **For expected behavior and status of each feature:** Read `docs/03_FEATURE_BEHAVIOR_SPEC.md` (Implemented / Partially implemented / Intended per section; Not Implemented on Purpose; App Query examples and limits).
- **For how the app is built:** Read `docs/02_ARCHITECTURE_AND_DATA_FLOW.md` (stack, structure, models, flows, routes, source-of-truth hierarchy).

2. **How it’s built:** `docs/02_ARCHITECTURE_AND_DATA_FLOW.md` — stack, structure, models, flows, routes.

**What not to assume**

- Do not assume a feature is complete because it appears in the UI or in an older doc. Use the status labels in 03_FEATURE_BEHAVIOR_SPEC and the “Fixes already completed” / “Remaining known issues” in this file.
- Do not assume transfer ownership exists; it was removed. Do not assume “Share my price history” is in the main Profile flow; the entry was removed.
- Do not assume the Search bar is “receipt search” only; it runs app-query (real data) then AI chat. Do not assume every natural-language question is supported; app-query uses keyword/regex intents.

**How to avoid confusing intended vs implemented**

- In 03_FEATURE_BEHAVIOR_SPEC, every section has a status: Implemented, Partially implemented, or Intended / not yet implemented.
- When in doubt, grep the codebase for the route or component and confirm it is mounted and used. Check FIX_REPORT.md and REPAIR_REPORT.md in the project root for exact changes already made.
- If something is unclear from the codebase, document it as “Unclear from current implementation” or “Needs verification” rather than inventing certainty.
