# QA Report – SmartBudget AI

**Date:** March 5, 2026  
**Build / branch:** N/A (codebase verification)  
**Scope:** Local Parser (parseReceiptText), Hybrid flow (scanner + localExtract), Backend safety (receipts.ts), Reset with locally verified receipts

---

## 1. Build and run

| Check | Result (Pass / Fail) | Notes |
|-------|----------------------|--------|
| Backend builds (`cd backend && npm run build`) | Not run | Static code verification only |
| Frontend has no linter errors | Not run | — |
| Backend starts (e.g. `npm run dev` or `npm start`) | Not run | — |
| Frontend starts (e.g. `npx expo start`) | Not run | — |

---

## 2. Test cases

| # | Test case | Steps | Expected | Result (Pass / Fail) | Notes |
|---|-----------|--------|----------|----------------------|--------|
| 1 | **Local Parser – store name** | Verify parseReceiptText extracts store from "WELCOME TO COSTCO WHOLESALE" | Store name derived (e.g. Costco) | **Pass** | extractStoreName() lowercases text and checks STORE_KEYWORDS; "costco" is in list. lower.includes("costco") → true. Returns keyword title-cased: "Costco". |
| 2 | **Local Parser – total (with $)** | Verify total from "TOTAL $145.20" | Total 145.20 extracted | **Pass** | extractCurrencyAmounts() uses regex `/\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?|\d+\.\d{2})/g`. Matches $145.20. Total = largest amount = 145.20. |
| 3 | **Local Parser – total (no $)** | Verify total from "BALANCE DUE 145.20" | Total 145.20 extracted if supported | **Partial** | Regex requires a `$` prefix. "BALANCE DUE 145.20" has no `$`, so 145.20 is not matched. Parser only extracts currency amounts that include `$`. Document as limitation; optional enhancement: add pattern for "total"/"balance" lines with plain number. |
| 4 | **Local Parser – date** | Verify date from "03/05/2026" | Date extracted (e.g. YYYY-MM-DD) | **Pass** | extractDate() has `/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g`. Match: 03, 05, 2026 → returns "2026-03-05". |
| 5 | **Hybrid – locallyVerified before backend** | Check scanner uses local verification before sending to backend | localExtract sent only when locally verified; backend still called | **Pass** | getLocalExtractFromImage() returns non-null only when parsed.locallyVerified && parsed.storeName != null && parsed.total != null (localParser.ts). Scanner: localExtract = await getLocalExtractFromImage(base64); postReceiptFromBase64(..., localExtract ?? null). Client (client.ts) only adds body.localExtract when localExtract has storeName (string) and total (number). So backend is always called; localExtract is only sent when local parse was verified. |
| 6 | **Backend – localExtract handling & items-only failure** | Verify receipts.ts handles localExtract and doesn't crash if items-only parsing fails | When localExtract present, use items-only path; on AI/items failure, fallback (e.g. Pending Review) not crash | **Pass** | POST /from-base64: validates localExtract (storeName string, total number > 0). If localExtract: calls parseReceiptImageItemsOnly(base64, localExtract); on success builds parsed from localExtract + items. On throw (catch aiErr): creates "Pending Review" store + receipt (total 0) + one "Pending Review" item, returns 201. No unhandled crash; fallback receipt created. |
| 7 | **Reset – locally verified receipt wiped** | Confirm Reset clears receipts created via hybrid/local flow | After Reset, all receipts (including locally verified) removed | **Pass** | Locally verified receipts are stored via same POST /api/receipts/from-base64 → Receipt created in DB. Reset calls purgeAllData() → DELETE /api/transactions/purge/all. transactions.ts: purge/all does prisma.receipt.deleteMany({ where: { userId: user.id } }). So all user receipts are deleted regardless of creation path; locally verified receipts are wiped. |

---

## 3. Regressions

| Description | Steps to reproduce | Expected vs actual |
|-------------|--------------------|---------------------|
| None | — | No regressions identified. |

---

## 4. Summary

- **Overall:** **Pass** (with one **Partial** for total without `$`)
- **Ready for next task:** Yes
- **Recommended next step:** (Optional) Extend local parser to recognize totals in lines like "BALANCE DUE 145.20" or "TOTAL 145.20" (amount without `$`) if product requirement includes that format. Otherwise document that only `$`-prefixed amounts are extracted.

---

## 5. Notes

- **localParser.ts:** parseReceiptText returns storeName (from STORE_KEYWORDS + includes), total (largest $ amount from extractCurrencyAmounts), date (MM/DD/YYYY → YYYY-MM-DD), and locallyVerified = true only when storeName and total are present.
- **Scanner:** Always calls backend; localExtract is optional and only set when getLocalExtractFromImage returns a value (i.e. locally verified). Camera and gallery flows both use getLocalExtractFromImage and pass localExtract to postReceiptFromBase64.
- **Backend:** /from-base64 accepts localExtract; when present uses parseReceiptImageItemsOnly; on any exception in that path, catches and creates Pending Review receipt and returns 201.
- **Reset:** purge/all deletes all receipts for the user; no special case for locally verified receipts.
- Verification was static code review only; no live run.
