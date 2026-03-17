# SmartBudgetAI — CEO & CFO Assessment

**Purpose:** Align the product with stated goals (Layer 1–3), call out what works, what’s broken, and a concrete plan to fix and improve usability and interconnectedness.

---

## 1. Goal Alignment (What We Said We’re Building)

| Layer | Goal | Status |
|-------|------|--------|
| **Core** | User uploads receipts | ✅ Built (camera, gallery, from-local/process-text/from-base64) |
| **Core** | Categorise spend | ✅ Built (15 categories, store + item dictionary + AI) |
| **Core** | Show category + how much spent | ✅ Built (Home summary, categories, stores) |
| **Core** | Search in app data from receipts | ✅ Built (Library search, app-query, receipts filter) |
| **Core** | Basket → compare DB → recommend store, estimate, “save $X” | ✅ Built (basket insights, best store, estimated total, your history) |
| **Layer 2** | Community within 30km: item/price/store → recommend different store if better | ⚠️ Partial (community aggregates exist; no 30km radius) |
| **Layer 2** | Prescription/drug data: separate folder, when purchased, from receipt scan, for whom (AI) | ❌ Not built (medical is manual only; no receipt→Rx detection) |
| **Layer 3** | Splitwise-like groups + expense tracker, share groups/expenses | ✅ Built (groups, expenses, splits, balances, payments) |
| **Layer 3** | Group/expense data updates user’s **personal** category spend | ❌ Not built (summary = own receipts only) |
| **Layer 3** | Group/expense data feeds **community pricing** for better suggestions | ⚠️ Partial (receipt→PriceRecord→COMMUNITY; group expenses not synced to PriceRecord) |

---

## 2. What’s Working Very Well

- **Receipt pipeline:** Upload → OCR (on-device + cloud fallback) → parse → categorize → store (Receipt + Store + Items). Hybrid pipeline and confidence handling are in place.
- **Categorisation:** 15 categories (incl. Transportation, Banking, Clothing, Subscriptions, etc.), item dictionary, store mapping, fuzzy match, AI fallback. “Other” is reduced when data matches.
- **Single-user value:** Home total spent, categories, stores, recent transactions; Library with search and receipt images; basket auto-filled from recent receipts; Finalize shows your history (item + store + price), best store, estimated total.
- **Basket intelligence:** Your history from receipts, best-store recommendation, estimated total, multi-store optimization service; group and shared-friend prices in API.
- **Groups:** Create/join groups, invite links, add expenses (with optional receipt link), splits, balances, payments. Receipts can be shared to a group.
- **Data model:** Receipts, Items (with category), Stores, PriceRecord (PRIVATE/GROUP/COMMUNITY), CommunityPriceAggregate, MedicalFolder/MedicalRecord/MedicalExpense, Groups/Expenses/Splits/Balances. Backend is structured for the vision.
- **Community plumbing:** User opt-in (`isCommunityOptIn`), receipt sync to PriceRecord, shareMode COMMUNITY, `generateCommunityAggregates()` (item/store/regionBucket). Used in basket insights when lat/lng sent.

---

## 3. Current Broken Structure & Gaps

### 3.1 Layer 2 — “30km community”

- **Issue:** Product goal is “community **within 30km**”; implementation has **no geographic radius**.
- **Current behaviour:** `cityOrArea` is a text bucket (e.g. “Toronto”). Basket insights return **all** matching community aggregates when lat/lng are present; there is no distance or 30km filter.
- **Impact:** User may see “community” prices from far away, not “around me in 30km”.

### 3.2 Layer 2 — Prescription / medical from receipts

- **Issue:** Goal is “prescription drug data, separate folder, when purchased, **from receipt scan in library**, **for whom** (AI)”.
- **Current behaviour:** Medical is **manual only**: user creates folders (e.g. patient name), adds records and expenses by hand. No flow from “scan receipt” → detect Rx / drug items → “for whom” (AI) → attach to medical folder.
- **Impact:** Medical is a separate manual ledger; receipt library does not feed it.

### 3.3 Layer 3 — Group data → personal profile

- **Issue:** Goal is “use group/expense data to **update user’s personal profile on category spent**”.
- **Current behaviour:** Summary (and Home) use only **user’s own receipts** (`userId`, VERIFIED). Group expenses (and splits) are **not** included in “total spent” or “category spent” on the user’s profile.
- **Impact:** Splits/group spending don’t show up in “how much I spent” or category breakdown.

### 3.4 Layer 3 — Group/expense data → community pricing

- **Issue:** Goal is “use that data for **community pricing** for better suggestion”.
- **Current behaviour:** Community pricing is fed by **receipts** (syncReceiptToPriceRecords). Group **expenses** (manual or receipt-linked) do not create or update PriceRecords for community.
- **Impact:** A lot of shared/group spend never enters the price-intelligence layer.

### 3.5 Usability / discoverability

- **Medical:** Medical tab/screen may be hidden (e.g. `href: null`); flow “receipt → medical folder” is missing, so the feature feels disconnected.
- **Community:** Opt-in and “why share” (better local prices) need to be clear in UI; 30km vs “all regions” is not explained.
- **Basket:** “Basket is filled from recent receipts” is correct; per-item price in Finalize (your history) could be more prominent so “save $X” is obvious.
- **Groups:** Link from “my spending” to “what I’ve paid in groups” / “my splits” could be stronger so Layer 3 feels connected to personal view.

---

## 4. Plan to Fix (Prioritised)

### P0 — Must fix for goal alignment

1. **30km community (Layer 2)**  
   - Store `lat`/`lng` (or a single region point) when creating/updating PriceRecord (e.g. from user location at opt-in or at receipt sync).  
   - In `basketInsightsService`, when returning “nearby community average”, filter CommunityPriceAggregate by **distance ≤ 30km** from `(req.lat, req.lng)` (e.g. store region centroid or user’s region).  
   - If no geo exists yet, keep current behaviour but document “region = city/area” until geo is added.

2. **Group → personal profile (Layer 3)**  
   - Define “personal spend” for profile: e.g. **own receipts** + **your share of group expenses** (from ExpenseSplit where userId = current user).  
   - In summary (or a dedicated endpoint), aggregate: (a) receipt items by category, (b) split amounts by category from group expenses.  
   - Expose in Home/summary: e.g. “Total spent (including your share in groups)” and category breakdown including splits.

3. **Group/expense → community pricing (Layer 3)**  
   - When an expense is tied to a receipt (`receiptId`) and that receipt has items, run the same sync logic (or a variant) so **group receipt-backed expenses** also create/update PriceRecords (with shareMode COMMUNITY when eligible).  
   - Optional: allow manual expenses (no receipt) to contribute a single “item” PriceRecord if we add an item name and price (simpler version).

### P1 — High value (Layer 2 medical)

4. **Prescription / medical from receipts**  
   - **Detection:** In receipt pipeline (or post-save), flag items that look like Rx/drugs (e.g. keyword list + optional AI).  
   - **“For whom”:** Optional AI step: from receipt context (store, existing items) infer or ask “for which patient?” and link to MedicalFolder (patientName).  
   - **Flow:** In Library, “Add to medical” on a receipt (or on selected line items) → choose folder (patient) → create MedicalExpense(s) and optionally MedicalRecord.  
   - Keeps medical as the “folder” layer but connects it to receipt data and AI.

### P2 — UX and consistency

5. **Medical discoverability:** Ensure Medical is reachable from main nav or profile; short onboarding tip “Track prescriptions by scanning receipts and adding to a patient folder.”  
6. **Community clarity:** In settings/profile, “Share anonymised item/price/store to improve local recommendations (within ~30km).” Explain benefit and radius once 30km is implemented.  
7. **Basket “save $X”:** In Finalize, show “You could save ~$X at [Store]” when best store is different from user’s usual or when multi-store split saves money.

---

## 5. Validation (Are We on Path?)

- **Vision:** “Receipts → categorise → show spend → search → basket recommendation → community + medical + groups” matches the codebase and roadmap.  
- **Core (Layer 1):** Delivered: upload, categorise, show by category, search, basket with store recommendation and estimate.  
- **Layer 2:** Architecture is there (community aggregates, medical folders); **gaps:** 30km filter and receipt→medical (with “for whom”) not implemented.  
- **Layer 3:** Groups/expenses/splits/balances exist; **gaps:** group data does not yet update personal profile or feed community pricing.

So: **we are on path** for the product vision; the main deviations are **no 30km filter**, **no receipt→medical pipeline**, **no group→personal summary**, and **no group→community pricing**. Fixing these will align behaviour with the stated goals.

---

## 6. Overall Progress and Where to Improve

| Area | Progress | Comment |
|------|----------|--------|
| Receipt upload & parse | High | Solid pipeline; image storage/serving fixed. |
| Categorisation | High | 15 categories; fewer items in “Other”. |
| Single-user dashboard | High | Home, Stores, Library, Search, basket flow. |
| Basket intelligence | High | Your history, best store, estimate; multi-store in backend. |
| Groups & expenses | High | Splitwise-like; receipt-to-group link. |
| Community pricing | Medium | Data model and aggregates; **no 30km**; clarity of opt-in. |
| Medical | Low | Folders/records/expenses exist; **no receipt→Rx→for whom**. |
| Personal profile | Medium | Strong for receipts; **missing group/split contribution**. |
| Interconnectedness | Medium | Receipt→basket and receipt→group work; **group↔profile** and **group↔community** and **receipt↔medical** need wiring. |

**Where to improve and make it more interconnected:**

1. **One “total spend” story:** Combine own receipts + your group splits in summary and Home so the user has a single place that answers “how much did I spend (including my share in groups)?”  
2. **One “price intelligence” story:** All relevant spend (receipts + group receipt-backed expenses) should feed community pricing so “community around you” improves with usage.  
3. **One “medical” story:** Receipt scan → optional “Add to medical” → choose patient → auto-create expenses (and “for whom” where we can infer).  
4. **Geography:** Implement 30km (or configurable radius) and surface it in copy so “community” is clearly “near you.”  
5. **Surfaces:** One place for “my spending” (receipts + splits), one for “my groups,” one for “medical,” and clear entry points from Home/Library so Layers 2 and 3 feel part of the same app.

---

## 7. CEO/CFO Takeaway

- **Working well:** Core receipt-to-category-to-dashboard, search, and basket recommendation (store + estimate) are in place and aligned with the main goal. Groups and expense splitting are implemented. Data model supports community and medical.  
- **Needs to be done:** (1) 30km filter for community, (2) group data into personal profile and into community pricing, (3) receipt→medical with “for whom” (AI) and clear UX.  
- **Broken structure:** Not “broken” so much as **incomplete**: community is not yet “30km,” medical is not fed by receipts, and group data is not yet reflected in profile or community.  
- **Plan:** P0 = 30km + group→profile + group→community; P1 = receipt→medical + “for whom”; P2 = UX and copy.  
- **Validation:** The project is on path; addressing the gaps above will align the product with the stated Layers 1–3 and make the system more interconnected and easier to understand for users.

---

*Document generated from codebase review and product goals. Use this as the single source for “what’s working, what’s missing, and what to do next.”*
