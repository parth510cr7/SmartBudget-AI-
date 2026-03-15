# On-Device Receipt Pipeline Repair Report

## 1. Exact root cause of inflated totals

**Cause:** OCR often returns totals **without a decimal** (e.g. `TOTAL 899` instead of `TOTAL 8.99`). The pipeline treated that as **899 dollars** instead of **8.99 dollars**.

- **receiptNormalizer:** `CURRENCY_REGEX` captures `\d+\.\d{2}` and plain integers; `parseAmount` did no cents→dollars conversion, so `899` stayed 899.
- **receiptParser:** `extractTotalCandidates` used a regex that only matched `\d+\.\d{2}` on total lines, so `899` was then picked from the **amounts** array (from the normalizer). That array was not normalized for cents, so **max(filtered amounts)** could be 899 and was stored as receipt total.
- **Analytics:** `totalSpent` and store spend sum `receipt.total` for all receipts. One receipt with total 899 instead of 8.99 made totals “hundreds” instead of the real total.

**Fix:**  
- **normalizeAmountForTotal(amount):** If amount is an integer in 100–9999 (looks like cents), convert to dollars: `amount / 100`.  
- Applied when building total candidates (from total-line regex and from filtered amounts).  
- **extractFirstMatch** already had **normalizeAmount** for raw regex captures (e.g. 2–5 digit strings → cents). Tightened so only values &lt; 100 are left as-is; 100–99999 as integer → divide by 100.

---

## 2. Exact root cause of Grocery over-classification

**Cause:** Category resolution used **store-level category before item-level**.  
`store_categories.json` maps many chains (e.g. Walmart, Target, Costco) to **"Groceries"**. For any receipt from such a store, **matchStoreCategory(storeName)** ran **second** (after user rules) and returned "Groceries", so **every line item** got "Groceries" before trying item dictionary or fuzzy match.

**Fix:** Category order is now **item-first, store as hint**:

1. User rules  
2. **Item dictionary**  
3. **Fuse fuzzy** (item name)  
4. **Store category** (only when item didn’t match)  
5. AI  

Unknown items still default to **"Other"** from AI; nothing is forced to Groceries.

---

## 3. Exact root cause of store total vs receipt total mismatch

**Cause:**  
- **Store spend** and **total spent** both came from **sum of `receipt.total`** over **all** receipts (no confidence filter).  
- One bad receipt (wrong total or duplicated) made store totals and overall total wrong.  
- There was no separate “trusted” set; low-confidence scans were counted the same as good ones.

**Fix:**  
- **Receipt.status:** `VERIFIED` | `NEEDS_REVIEW`.  
- **Analytics** (summary, stores, reports, appQueryService) now **only use receipts with `status = "VERIFIED"`** for:  
  - totalSpent  
  - byStore totalSpent / visits  
  - category sums from line items  
- **Source of truth:** Receipt-level spend = `receipt.total` for that receipt. Display and analytics use that; line items are only used for category breakdown and only from VERIFIED receipts. Low-confidence (NEEDS_REVIEW) receipts are **excluded** from all spend aggregates.

---

## 4. Exact root cause of Library persistence failure (receipt not visible)

**Cause:** The Library UI **filtered out receipts without an image**:

```ts
const withImages = (data ?? []).filter(
  (r) => r.imageUrl != null && r.imageUrl !== undefined
);
setReceipts(withImages);
```

On-device flows (**process-text**, **from-local**) do **not** upload an image, so `imageUrl` is always **null**. Every on-device scan created a receipt in the DB but the Library hid it.

**Fix:**  
- Removed the `imageUrl` filter: Library shows **all** receipts returned by the API.  
- Cards without `imageUrl` show a **placeholder** (store name + total) instead of an image.  
- Receipts with `status === "NEEDS_REVIEW"` show a **“Review”** badge so the user can correct or verify later.

---

## 5. Exact files changed

| Area | File | Change |
|------|------|--------|
| Schema | `backend/prisma/schema.prisma` | Added `Receipt.status` (String, default `"VERIFIED"`). |
| Total extraction | `backend/src/receipt_engine/receiptParser.ts` | `normalizeAmount` (only allow &lt;100 as dollars); `normalizeAmountForTotal` (100–9999 integer → /100); total-line regex extended to match 3–5 digit “cents”; candidates and filtered amounts normalized. |
| Category order | `backend/src/receipt_engine/categoryEngine.ts` | Order: user rules → item dictionary → fuzzy → **store category** → AI (store no longer overrides item). |
| Confidence gating | `backend/src/routes/receipts.ts` | All receipt creates set `status`: VERIFIED (AI success, or process-text high confidence); NEEDS_REVIEW (process-text low/fallback, from-local, Pending Review, AI failure). |
| Analytics | `backend/src/routes/transactions.ts` | Summary and stores use `where: { userId, status: "VERIFIED" }`. |
| Analytics | `backend/src/routes/reports.ts` | Report receipts use `status: "VERIFIED"`. |
| Analytics | `backend/src/services/appQueryService.ts` | Receipts for queries use `status: "VERIFIED"`. |
| Library visibility | `frontend/app/modal/library.tsx` | Removed imageUrl filter; show all receipts. Placeholder for missing image; “Review” badge when `status === "NEEDS_REVIEW"`. |
| Debug | `backend/src/receipt_engine/receiptDebug.ts` | Snapshot includes `status`, `sumOfItemPrices`. |
| Debug | `backend/src/receipt_engine/index.ts` | Debug snapshot includes status and sumOfItemPrices. |

---

## 6. Confidence-gating design

- **VERIFIED:** Receipt is trusted for spend and category analytics.  
  - Set when: AI image parse succeeds (POST /, from-base64); or process-text with **high** total confidence (regex total match).  

- **NEEDS_REVIEW:** Receipt is saved and visible in Library but **not** included in:  
  - totalSpent  
  - store totalSpent / visits  
  - category sums  
  - reports / app query aggregates  

  Set when:  
  - process-text with **low** or **fallback** total confidence;  
  - from-local (no line items);  
  - AI parse failure (Pending Review);  
  - from-base64 AI failure.  

- **Library:** Shows **all** receipts (VERIFIED and NEEDS_REVIEW). NEEDS_REVIEW shows a “Review” badge; user can fix total/store/items later (edit UI can be added).  

- **Analytics:** Every aggregate that uses receipt totals or item totals **filters** `status = "VERIFIED"` only.

---

## 7. Parsing and categorization fixes

- **Total:** Prioritize lines with TOTAL / GRAND TOTAL / AMOUNT DUE / BALANCE DUE; normalize cents→dollars for 100–9999 integers; filter implausible totals (e.g. &gt;5000, whole number ≥1000); no “largest number wins” without filtering/normalization.  
- **Categories:** Item dictionary and fuzzy match **before** store category; unknown → Other; never force Groceries.  
- **Items:** Low-confidence lines (no price parsed) still stored as items with totalPrice 0 and category from engine (often Other), so they appear in Library and can be edited.

---

## 8. Persistence fixes

- **Receipt record:** Always created for process-text, from-local, POST /, from-base64 (including failures → Pending Review with NEEDS_REVIEW).  
- **Library:** No filter on imageUrl; all receipts for the user are shown.  
- **Placeholder:** Receipts without imageUrl show store name + total in the card.  
- **Status:** Stored on Receipt; analytics read it and exclude NEEDS_REVIEW.

---

## 9. Test matrix (template)

| # | Case | Expected total | Extracted total | Item count (exp) | Item count (got) | Category mix | In Library? | In analytics? | Needs Review? | Pass/fail |
|---|------|----------------|-----------------|------------------|------------------|--------------|-------------|---------------|--------------|-----------|
| 1 | Short clean receipt | e.g. 12.99 | | Few | | | Yes | If VERIFIED | If low conf | |
| 2 | Long receipt | e.g. 45.00 | | Many | | | Yes | If VERIFIED | If low conf | |
| 3 | Gallery upload | | | | | | Yes | If VERIFIED | | |
| 4 | Camera capture | | | | | | Yes | If VERIFIED | | |
| 5 | Subtotal + tax + total | Grand total | | | | | Yes | If VERIFIED | | |
| 6 | Noisy decimals (899) | 8.99 | 8.99 | | | | Yes | If VERIFIED | | |
| 7 | Grocery store, mixed items | | | | Not all Groceries | Yes | If VERIFIED | | |
| 8 | Pharmacy receipt | | | | Personal Care/Health | Yes | If VERIFIED | | |
| 9 | Dining receipt | | | | Dining | Yes | If VERIFIED | | |
| 10 | On-device only (no image) | | | | | **Yes** | If VERIFIED | | |

---

## 10. Remaining weak spots

- **Existing receipts:** Before this change, all receipts had no status; `db push` adds the column with default `"VERIFIED"`. So old (possibly bad) totals are still in analytics until you mark them NEEDS_REVIEW or correct them.  
- **Manual review UI:** Only “Review” badge and placeholder exist; no edit screen yet for store/total/date/items. Structure (status, raw data) supports adding it.  
- **Item totalPrice:** Line-item parser expects `\d+\.\d{2}`; OCR like "899" on a line won’t match, so that line becomes totalPrice 0. Cents normalization is only applied to **receipt total** candidates, not to every line-item price.  
- **iOS:** Same logic; no iOS-specific change in this pass.

---

## 11. How to inspect/debug future receipt failures

1. **Backend debug snapshot (process-text)**  
   - Set `DEBUG_RECEIPT=1` or run in development.  
   - After a scan, `GET /api/receipts/debug` (with auth) returns: rawOcrText, normalizedLines, amounts, totalCandidates, chosenTotal, totalConfidence, **status**, storeName, subtotal, tax, date, itemCount, **sumOfItemPrices**, items.  
   - File: `backend/data/debug/last_receipt_debug.json`.  
   - Check: chosenTotal vs sumOfItemPrices; status VERIFIED vs NEEDS_REVIEW; totalCandidates (sources and values).

2. **Frontend**  
   - In dev, last raw OCR: `global.__LAST_OCR_RAW` after a scan.

3. **Library**  
   - All receipts appear; no imageUrl filter. If a receipt is missing, the failure is in save (check backend logs and API response).

4. **Analytics wrong**  
   - Confirm only VERIFIED receipts are used: receipts.ts (summary/stores) and reports/appQueryService use `status: "VERIFIED"`.  
   - If one receipt has a wrong total, set its status to NEEDS_REVIEW in DB (or add an “Exclude from totals” action in UI) so it stops affecting spend.

5. **Categories**  
   - Inspect `items[].category` in debug snapshot. Tune `data/item_dictionary.json`, `data/store_categories.json`, and user_rules for better defaults; item-level now overrides store when there’s a match.
