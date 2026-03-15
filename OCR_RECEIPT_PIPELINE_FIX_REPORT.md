# OCR Receipt Pipeline Fix Report

## 1. Root cause of first-line OCR bug

**Cause:** On Android, the native module `expo-text-extractor` was using ML Kit’s **`visionText.textBlocks.map { it.text }`** and returning that array to the app. ML Kit’s **textBlocks** are logical regions (e.g. paragraphs); for many receipts the engine returns **one block** (or only the first block), so the app received **only the first line or region** and joined it with `\n`, producing a single line of text.

**Fix:** The Android native code was updated to use **`visionText.text`** (the full recognized string in reading order) and to split it by newlines for the existing API:

- **File:** `frontend/node_modules/expo-text-extractor/android/.../ExpoTextExtractorModule.kt`
- **Change:** Use `visionText.text`; if non-blank, split by `\n` and return the resulting lines; otherwise fall back to `textBlocks.map { it.text }`.

**App-side safeguard (unchanged):** If on-device OCR returns fewer than 100 characters or fewer than 3 non-empty lines, the app treats the result as too short and sends the **full image** to the backend (cloud path) so the full receipt is processed there.

---

## 2. Root cause of wrong total extraction

**Cause:**

- **Backend:** Total was taken as `extractFirstMatch(raw, TOTAL_PATTERNS) ?? Math.max(...normalized.amounts)`. When no line matched TOTAL/AMOUNT DUE, **any** extracted amount was used (e.g. receipt ID, phone number, quantity), so the “largest number” was often wrong.
- **Frontend (localParser):** Same idea: total was the **largest** of all currency amounts, with no filtering of non-totals.

**Fix:**

- **Backend (`backend/src/receipt_engine/receiptParser.ts`):**
  - **Total candidates:** Extract amounts only from lines containing “total”, “amount due”, “balance due”, “grand total” and build candidates with confidence.
  - **Filtering:** `filterPlausibleTotals(amounts)` drops amounts &gt; 5000, and whole-number amounts ≥ 100 that look like IDs.
  - **Choice:** Use total from regex first (high confidence); else best total candidate; else max of filtered amounts (fallback).
  - **OCR normalization:** `normalizeAmount()` handles cases like `899` → 8.99 when the value looks like cents.
  - **Meta:** `totalConfidence` is set to `"high"` | `"low"` | `"fallback"` and exposed for “needs review”.

- **Frontend (`frontend/src/utils/localParser.ts`):**
  - Prefer **total from patterns** (e.g. “total $12.99”, “amount due 12.99”).
  - Use **filterPlausibleTotals** on all amounts before using the largest as fallback.

---

## 3. Root cause of category-storage failure

**Cause:** Categories were already assigned by the backend (user rules → store → item dictionary → fuzzy → AI). The main gaps were:

- Some parsed items were **dropped** by the item extractor (no price line match), so they never got a category.
- Fallback category was not always applied when AI or rules failed.

**Fix:**

- **Backend (`backend/src/receipt_engine/index.ts`):** Every item is assigned a category; `category: category || "Other"` so nothing is sent without a category.
- **Backend (`backend/src/receipt_engine/itemExtractor.ts`):** Lines that look like item text (e.g. contain letters) but **don’t** match the strict price-line regex are no longer dropped; they are stored as items with `totalPrice: 0`, `quantity: 1`, `unit: "item"` so they remain in the receipt and get a category (e.g. “Other”).
- **Routes:** All item creates use `category: it.category ?? "Other"` so DB always has a category.

---

## 4. Exact files changed

| Area | File | Changes |
|------|------|--------|
| OCR (Android) | `frontend/node_modules/expo-text-extractor/android/.../ExpoTextExtractorModule.kt` | Use `visionText.text` and split by `\n` for full receipt text. |
| Frontend OCR | `frontend/src/utils/ocr.ts` | In `__DEV__`, store last raw OCR in `global.__LAST_OCR_RAW` for debugging. |
| Scanner | `frontend/app/modal/scanner.tsx` | Prefill now includes `needsReview` from process-text/from-base64; preprocessing constants updated. |
| Preprocessing | `frontend/app/modal/scanner.tsx` | `MAX_WIDTH` 800→1200, `QUALITY` 0.5→0.65 for better OCR. |
| Local parser | `frontend/src/utils/localParser.ts` | Total from TOTAL/AMOUNT DUE patterns first; `filterPlausibleTotals`; no “largest number” without filtering. |
| Backend parser | `backend/src/receipt_engine/receiptParser.ts` | Total candidates from total lines; `filterPlausibleTotals`; `normalizeAmount`; `totalConfidence` in meta; export helpers for debug. |
| Backend engine | `backend/src/receipt_engine/index.ts` | `processReceiptText` calls debug snapshot; returns `totalConfidence` and `needsReview`; category fallback “Other”. |
| Backend extractor | `backend/src/receipt_engine/itemExtractor.ts` | Keep non-price lines as items (totalPrice 0) so they get categories. |
| Backend debug | `backend/src/receipt_engine/receiptDebug.ts` | **New.** Snapshot: raw OCR, normalized lines, amounts, total candidates, chosen total, items; optional write to `data/debug/last_receipt_debug.json`. |
| Backend routes | `backend/src/routes/receipts.ts` | `GET /api/receipts/debug` returns last receipt debug snapshot; process-text response includes `needsReview` and `totalConfidence`. |
| Store / UI | `frontend/src/store/useStore.ts` | `expensePrefill` type extended with `needsReview?: boolean`. |
| Group add expense | `frontend/app/group/[id].tsx` | `expenseNeedsReview` state; “Needs review – verify total from receipt” banner when true; clear on close. |

---

## 5. Preprocessing improvements

- **Resize:** `MAX_WIDTH` increased from 800 to **1200** so receipt text stays readable for OCR.
- **Compression:** `QUALITY` increased from 0.5 to **0.65** to reduce blur and character loss.
- **Comment:** Documented that aggressive resize/compression can harm OCR.
- **No cropping:** Only resize is applied; no content is cropped. Cropping is not introduced.

---

## 6. Parsing improvements

- **Total:** Regex for TOTAL / AMOUNT DUE / BALANCE DUE / GRAND TOTAL; confidence scoring; filtering of implausible totals; optional decimal normalization (e.g. 899 → 8.99).
- **Subtotal / tax:** Unchanged; still regex-first, then derived from total when needed.
- **Line items:** Strict price-line parsing unchanged; lines that don’t match but look like item text (letters, length ≥ 2) are stored as items with `totalPrice: 0` so they are not dropped and get a category.
- **Store / date:** Unchanged (keywords + first non-meta line for store; date patterns for date).

---

## 7. Storage / data-model changes

- **Receipt:** No schema change. Receipt and items are created as before; process-text and from-base64 still create one receipt and many items.
- **Item:** No new columns. Low-confidence lines are stored as items with `totalPrice: 0`, `category: "Other"` (or from categorizer).
- **API response:** Process-text response now includes `needsReview: boolean` and `totalConfidence: "high" | "low" | "fallback"` for the client.
- **Expense prefill:** Prefill now includes `needsReview` so the Add Expense screen can show “Needs review”.

---

## 8. Manual test results

Recommended manual tests (to be run after deploy):

| # | Case | Expected total | Check extracted total | Items expected | Items extracted | Categories | Pass/fail |
|---|------|----------------|------------------------|----------------|-----------------|-----------|-----------|
| 1 | Short receipt, clear image | e.g. 12.99 | From TOTAL line | Few | All + possible 0-price lines | Assigned | _ |
| 2 | Long receipt, full page | e.g. 45.00 | From TOTAL/AMOUNT DUE | Many | All lines kept | Assigned | _ |
| 3 | Gallery upload | Same as image | Same as #1/#2 | Same | Same | Same | _ |
| 4 | Camera capture | Same | Same | Same | Same | Same | _ |
| 5 | Subtotal + tax + total | Total line | Total = grand total | All | All | Assigned | _ |
| 6 | Noisy decimals (e.g. 8.99 as 899) | 8.99 | normalizeAmount | 1 | 1 | Other/Groceries | _ |
| 7 | Receipt with phone/ID numbers | Real total | Not phone/ID | All | All | Assigned | _ |

Run with backend in development (or `DEBUG_RECEIPT=1`) and inspect `GET /api/receipts/debug` after each scan to verify raw OCR, normalized lines, total candidates, and chosen total.

---

## 9. Remaining weak spots

- **expo-text-extractor patch:** The fix is in `node_modules`. Reinstalling packages will overwrite it. Options: (1) use `patch-package` to persist the Kotlin change, or (2) fork/publish a patched `expo-text-extractor`, or (3) rely on the app-side “too short → cloud” fallback and keep sending full image when OCR is insufficient.
- **iOS:** The report and native change target Android. If iOS uses a different path (e.g. Vision), verify that full text is returned in reading order.
- **Total confidence:** “Low” and “fallback” are heuristic; receipt layouts vary. More patterns (e.g. locale-specific labels) can be added over time.
- **0-price items:** Lines stored with `totalPrice: 0` help categorization and review but don’t affect receipt total; user can correct later.

---

## 10. How to inspect/debug future receipt failures

1. **Backend debug snapshot (process-text only)**  
   - Run backend with `NODE_ENV=development` or `DEBUG_RECEIPT=1`.  
   - After scanning a receipt (on-device OCR path), call **`GET /api/receipts/debug`** (with auth).  
   - Response includes: `rawOcrText`, `normalizedLines`, `amounts`, `totalCandidates`, `chosenTotal`, `totalConfidence`, `storeName`, `subtotal`, `tax`, `date`, `itemCount`, `items` (name, rawName, totalPrice, category).  
   - File: **`backend/data/debug/last_receipt_debug.json`** (when debug enabled).

2. **Frontend (dev only)**  
   - After a scan, in the JS console or a temporary debug screen, read **`global.__LAST_OCR_RAW`** to see the full raw string returned by on-device OCR (only in `__DEV__`).

3. **When receipt goes to cloud**  
   - If the app shows “Cloud Backup”, the image was sent to the backend; check backend logs and AI (e.g. Gemini) for errors. No debug snapshot is written for from-base64 (only for process-text).

4. **Check total logic**  
   - In the debug snapshot, compare `totalCandidates` (and their `source`/`confidence`) with `chosenTotal` and `totalConfidence` to see why a given total was chosen or why it might be wrong.

5. **Categories**  
   - Inspect `items[].category` in the debug snapshot. Uncategorized or wrong categories can be improved via **`data/user_rules.json`**, **`data/store_categories.json`**, and **`data/item_dictionary.json`** (and AI-learned rules).
