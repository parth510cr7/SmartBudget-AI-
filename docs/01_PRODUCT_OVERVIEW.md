# Purpose
This file describes SmartBudget at the highest level: what it is, who it is for, core vision, main tabs, product pillars, key rules, and current maturity. Use it to onboard quickly and align on product language.

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

- **Not all features are fully implemented.** This file describes product intent and current maturity at a high level; it is **not** the source of truth for what actually works in the app.
- **For current weak spots and remaining issues,** use **`docs/04_AUDIT_FIXES_AND_ROADMAP.md`** as the authoritative source. Do not assume a feature is live because it appears here.
- Where the doc uses **Partially implemented**, **Intended / not yet implemented**, or certainty tags (**Needs verification**, **Partially verified**, **Unclear from current implementation**), treat those as strict—do not invent certainty.

---

## What this file is NOT

- This file is **product-level only**. It does **not** state implementation truth (exact APIs, exact UI state, or which code paths are wired). For expected behavior and implementation status, see **`docs/03_FEATURE_BEHAVIOR_SPEC.md`** and **`docs/04_AUDIT_FIXES_AND_ROADMAP.md`**.
- It does **not** replace the need to verify behavior in the codebase or to read the audit file for remaining known issues.

---

# SmartBudget Product Overview

## 1. What the app is

SmartBudget is a **mobile-first receipt and spending app** that:

- Lets users **scan or upload receipts** and get structured data (store, date, line items, totals).
- Tracks **personal spending** with category breakdowns and summaries.
- Supports **groups** for splitting expenses (roommates, trips) with clear who-owes-who and settlement.
- Offers **price intelligence**: basket-style “where to buy” and “best price” from the user’s own receipt history and, when enabled, **community** (aggregate-only) pricing.
- Lets users **ask questions** about their spending and get answers from real app data (app-query) plus AI (Ask SmartBudget).

**Problem it solves:** People want to see where they spend, split costs fairly with others, and get practical price guidance from their own (and optionally community) data—without switching between multiple apps.

---

## 2. Who it is for

- **Individual consumers** who want to track spending by scanning receipts and see category breakdowns.
- **Shoppers** who want to know where to buy their list cheapest based on past receipts.
- **Groups** (roommates, trips, shared households) who want to split expenses and settle up.
- **Developers/QA** who use demo seed and dev-token auth for local testing.

**Key use cases:** Scan receipt → see spending; add items to basket → finalize → see recommended store/estimate; create group → add expenses → split among members → view balances → settle; ask “spend by store” or “top category” → get answers from real data.

---

## 3. Core product vision

The app aims to be a **receipt-first spending and splitting** product that:

- Treats **receipts** as the source of truth for both personal and group spending.
- Keeps **receipt-backed expenses** traceable (user can see they came from a scanned receipt and, when available, view the receipt).
- Combines **personal** (my receipts, my categories, my basket) with **social** (groups, shared expenses, invite-by-link) and **intelligence** (app-query, AI chat, basket insights, optional community pricing).
- Avoids fake precision: e.g. no “best store” when confidence is weak; fallback messaging instead.

**How it differs from a normal budgeting app:** Emphasis on receipt capture and parsing, group expense splitting with balances and settle, price memory (private/group/community), and querying spending in natural language grounded in real data.

---

## 4. Main tabs and their purpose

| Tab | Purpose |
|-----|--------|
| **Home** | Dashboard: total spent, category bars, recent receipts, navigation to Receipts, Stores, Profile. No standalone “add transaction”; adding is via Scan (new receipt) or backend transactions. |
| **Search** | App-query bar (“Ask SmartBudget about your spending”), basket (add items, Finalize for best store/estimate), empty-state category tiles, location consent when needed. Combines real app-data answers (spend by store/category, recent, cheapest store for item, group summary) with AI chat. |
| **Scan** | Entry to New Scan (camera), Upload from Photos, and Library. Library lists receipts and supports delete and “Split with Group.” |
| **Groups / Shared** | List of groups (create, delete, open). Opening a group shows the group dashboard: Expenses, Balances, Prices tabs; add expense; member list; invite (link, manual add, contacts); join by token. |
| **Profile / Privacy** | Auth (sign in / log out), location access status, “Use location for nearby community pricing” toggle, reset app data, Developer section (connection check, demo data, seed test group). No “Share my price history” in main flow (entry point was removed; feature deferred). |

*Note:* Receipts, Stores, and some other screens exist but may be hidden from the tab bar and reached via Home or navigation.

---

## 5. Core product pillars

- **Receipt intelligence** — Scan/upload → parse → store, items, totals, categories. Receipts stay traceable when used in groups.
- **Budgeting / spending visibility** — Summary, categories, recent transactions, stores.
- **Basket optimization** — Add items → Finalize → best store / estimated total from user’s (and optionally community) data; no fake recommendations when confidence is low.
- **Group splitting** — Create group, add expense, paid-by, split among all or selected members, balances, settle.
- **Private / group / community price memory** — Receipts feed price records; group prices visible in group; private share API exists but create-share UI is deferred; community is aggregate-only with consent.
- **Local price insights** — App-query answers (spend by store, by category, top category, recent purchase, cheapest store for item, group summary) from real app data; AI chat grounded in receipt context.

---

## 6. Key product rules

- **Do not fake best-store recommendations** when confidence is weak; show fallback message instead.
- **Scanned receipt data** should remain traceable when used in groups (receipt-backed expense shows source and “View receipt” when URL exists).
- **Group creator remains fixed owner/admin**; there is no ownership transfer. Owner cannot leave without deleting the group (or that rule is enforced in messaging).
- **New members** are not auto-added to past expenses; user must edit an expense to include them.
- **Location-based insights** require user consent; coords are sent only when consented.
- **Community results** must remain aggregate-only (no individual exposure); privacy expectations apply.
- **No raw backend errors** exposed to users; map to user-friendly messages where possible.

---

## 7. Unique value / market differentiation

- **Receipt-first + group splitting** in one app: scan once, split with a group, keep receipt linked.
- **Price memory** from receipts (private, group, optional community) for “where did I buy this?” and “best store for my list.”
- **App-query + AI** so questions like “spend by store” or “top category” return real data first, with AI as complement.
- **Consent and honesty:** location and community opt-in; no fake precision in recommendations.

---

## 8. Current product maturity

- **Stable:** Home summary and navigation; Scan (camera, upload, library) and receipt persistence; group create/list/detail; add/edit/delete expense with paid-by and participants; receipt-backed expense visibility and “View receipt”; invite link and join by token; balances and settle; app-query (spend by store/category, top category, recent, cheapest store for item, group summary); Profile auth and location toggle and reset.
- **Evolving:** Basket insights (best store/estimate) depend on backend and data; empty-state category tiles can have timing/race (**Needs verification**); add member from contacts depends on Expo Contacts permission (**Partially verified**).
- **Rough / deferred:** Create private price share has no UI (backend ready); community/nearby aggregation behavior (**Needs verification**); no receipt search by text; no AirDrop-specific invite button (system Share can be used); no revoke price share UI.

---

## 9. Glossary of important terms

| Term | Definition |
|------|------------|
| **Basket** | The list of items the user adds in the Search tab before “Finalize”; used to get best store / estimated total from receipt (and optionally community) data. |
| **Receipt-backed expense** | A group expense created from a scanned receipt (e.g. via “Split with Group” in Library). It retains `receiptId` / `receiptUrl` and shows “From scanned receipt” and optional “View receipt.” |
| **Group expense** | An expense belonging to a group; has description, amount, paid-by, and splits among participants. Can be manual or receipt-backed. |
| **Private share** | Price history shared with another user (by scope). Backend supports it; create-share UI is not in the main flow (deferred). |
| **Community pricing** | Aggregate-only price data (e.g. by region/area); no individual exposure. Requires consent; backend has community services and aggregates. |
| **App query** | The first-pass answer from real app data (receipts, groups) when the user asks something in the Search bar (e.g. spend by store, top category, recent purchases, cheapest store for item, group summary). Implemented via `POST /api/app-query`. |
| **Selected members split** | When adding/editing an expense, the user can choose “Selected members” and pick which members share the cost; at least one required. |
| **Paid by** | The group member who paid for the expense; used for balance calculation (others owe the payer). |
| **Source receipt** | The original receipt (e.g. from Scan Library) that a receipt-backed group expense is linked to; shown in expense detail when present. |
