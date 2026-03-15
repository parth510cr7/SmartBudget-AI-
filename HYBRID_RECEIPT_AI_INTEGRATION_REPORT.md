# Hybrid Local + Cloud Receipt Pipeline — Integration Report

**Date:** March 2026  
**Scope:** 4-stage receipt pipeline (on-device OCR → local parser + confidence → small local-model repair → selective cloud fallback), unified schema, Library persistence, analytics gating, debug visibility.

---

## 1. Exact OCR failure points found

| Failure point | Root cause | Location |
|---------------|------------|----------|
| **Long receipts** | On-device OCR (expo-text-extractor / ML Kit) can truncate or return insufficient text; pipeline previously had no fallback when local parse was weak. | Frontend `getRawTextFromImage()`; backend received rawText only. |
| **Totals wrong** | Already addressed in ON_DEVICE_RECEIPT_PIPELINE_REPAIR_REPORT: OCR amounts like `899` (cents) treated as dollars; total-line regex and `normalizeAmountForTotal` fix. Item-level line prices still use `\d+\.\d{2}` so "899" on a line may become totalPrice 0. | `backend/src/receipt_engine/receiptParser.ts`, `itemExtractor.ts`. |
| **Categorization weak** | Store category was applied before item-level; many chains mapped to Groceries. Fixed to item-first (user rules → item dictionary → fuzzy → store → AI). Unknown items default to Other, not Grocery. | `backend/src/receipt_engine/categoryEngine.ts`. |
| **No confidence gating** | Every process-text result was stored; low-confidence extractions could poison analytics. No composite score for OCR coverage, total, merchant, or items. | Entire pipeline. |
| **No cloud when local weak** | When OCR was long enough, backend always used local result. If total was missing or items incomplete, no automatic cloud fallback. | `POST /api/receipts/process-text` (no image, no fallback). |
| **No per-receipt debug** | Only last receipt snapshot in memory/file; no extractionSource or pipeline metadata persisted on Receipt. | `receiptDebug.ts`, Receipt model. |

---

## 2. Confidence rules added

**File:** `backend/src/receipt_engine/confidenceScoring.ts`

- **OCR coverage:** `computeOcrCoverageScore(rawText, lineCount)` — length vs `RECEIPT_MIN_OCR_CHARS` (default 80), line count vs `RECEIPT_MIN_OCR_LINES` (default 3). Score 0–1.
- **Total extraction:** `computeTotalConfidenceScore(totalConfidence, total, hasExplicitTotalLine)` — high = 1, low = 0.6, fallback = 0.3; invalid total = 0.
- **Merchant detection:** `computeMerchantScore(storeName)` — 0 if "Unknown Store" or empty, else 1.
- **Item extraction:** `computeItemExtractionScore(itemCount, linesWithPrice, totalLines, malformedNumericCount)` — coverage of lines with parsed price, penalized by malformed count.
- **Category assignment:** `computeCategoryScore(itemsWithNonOtherCategory, totalItems)` — fraction of items with non-Other category.
- **Overall:** `computeOverallConfidence(scores)` — **high** when total strong, OCR and merchant and item coverage above thresholds; **medium** when total acceptable and some coverage; **low** when total missing/weak or OCR very short.
- **Configurable env:** `RECEIPT_MIN_OCR_CHARS`, `RECEIPT_MIN_OCR_LINES`, `RECEIPT_MIN_ITEM_COVERAGE` (default 0.5). Cloud fallback: `RECEIPT_CLOUD_FALLBACK_ENABLED` (default on; set to `"0"` to disable).

---

## 3. Local small-model design and where it is used

**File:** `backend/src/services/localModelService.ts`

- **Role (design):** Normalize merchant names, classify categories, repair ambiguous OCR lines, validate total/item plausibility, and help set VERIFIED vs NEEDS_REVIEW. Not used as the main OCR engine (Apple Vision / on-device OCR remains first pass).
- **Interface:** `repairAndClassify(input: LocalModelRepairInput): Promise<LocalModelRepairResult>` with `rawOcrText`, `merchantName`, `items`, `total`; returns normalized merchant, items, total, and flags `invoked` / `modelUsed`.
- **Current implementation:** **Stub.** When `LOCAL_RECEIPT_MODEL_ENABLED` is not `"1"`, returns input as-is with `invoked: false`, `modelUsed: false`. When enabled, performs minimal trim/normalization only; no real on-device model (e.g. SmolVLM-256M / MLX) integrated in this pass.
- **Where used:** `backend/src/receipt_engine/hybridPipeline.ts` — when `confidenceScores.overall === "medium"` and `localRepairEnabled`, calls `repairAndClassify()` before finalizing the unified result. Extraction source becomes `"local_ai_repair"` when the stub is invoked.
- **Next pass:** Load a small multimodal/text model (e.g. SmolVLM-256M or 500M) via an Apple-friendly path (e.g. MLX Swift / React Native ML), run only when confidence is medium, keep memory and latency acceptable.

---

## 4. Whether a real on-device small model was integrated

**No.** The local small-model path is **scaffolded only**:

- Service abstraction and stub are in place.
- `repairAndClassify()` is called when confidence is medium; the stub returns the same data with optional trimming.
- Env flag `LOCAL_RECEIPT_MODEL_ENABLED=1` enables the stub path for testing; no actual model is loaded or run.
- Real integration (SmolVLM / MLX, etc.) is left for a follow-up pass to avoid app weight and latency impact until the pipeline and cloud fallback are validated.

---

## 5. Cloud fallback trigger rules

**File:** `backend/src/receipt_engine/hybridPipeline.ts`

Cloud fallback is used only when **all** of the following hold:

1. **Confidence is low** — `confidenceScores.overall === "low"` (e.g. total missing/implausible, OCR very short, or item extraction very incomplete).
2. **Base64 image is provided** — `POST /api/receipts/process-text` body includes `image` (base64 string). Frontend sends this when available so the backend can call Gemini when local result is weak.
3. **Cloud fallback is enabled** — `RECEIPT_CLOUD_FALLBACK_ENABLED !== "0"` (default enabled).

Additional case: if **processReceiptText throws** (e.g. bad input), and an image is provided and cloud is enabled, the pipeline catches the error and calls `parseReceiptImage(base64Image)` and uses the cloud result.

Cloud is **not** used when:

- Confidence is high (local result is used).
- Confidence is medium (local + optional local-model repair only).
- No image is sent with process-text.
- `RECEIPT_CLOUD_FALLBACK_ENABLED=0`.

---

## 6. Unified output schema

**File:** `backend/src/receipt_engine/unifiedSchema.ts`

All paths (local, local_ai_repair, cloud) normalize to:

```ts
UnifiedReceiptResult = {
  merchantName: string;
  purchaseDate: string;   // YYYY-MM-DD
  subtotal: number;
  tax: number;
  total: number;
  items: UnifiedReceiptItem[];
  overallConfidence: "high" | "medium" | "low";
  extractionSource: "local" | "local_ai_repair" | "cloud";
  reviewStatus: "verified" | "needs_review";
}

UnifiedReceiptItem = {
  rawText: string;
  normalizedName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  category: string;
  confidence: number;
}
```

- **extractionSource** — Which stage produced the final result.
- **reviewStatus** — Maps to DB `Receipt.status`: `verified` → `VERIFIED`, `needs_review` → `NEEDS_REVIEW`.
- **overallConfidence** — From confidence scoring; used for pipeline logic and debug.

DB Receipt model now includes:

- `extractionSource` (String, optional) — `"local"` | `"local_ai_repair"` | `"cloud"`.
- `pipelineDebug` (Json, optional) — Persisted snapshot: rawOcrLength, lineCount, localModelInvoked, cloudFallbackInvoked, extractionSource, overallConfidence, finalTotal, finalItemCount, analyticsIncluded, and score breakdown.

---

## 7. Exact files changed

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Receipt: added `extractionSource String?`, `pipelineDebug Json?`. |
| `backend/src/receipt_engine/unifiedSchema.ts` | **New.** Unified types and helpers. |
| `backend/src/receipt_engine/confidenceScoring.ts` | **New.** OCR/total/merchant/item/category scores and overall confidence. |
| `backend/src/receipt_engine/hybridPipeline.ts` | **New.** runHybridPipeline(rawText, base64Image), confidence → repair → cloud, normalize to UnifiedReceiptResult. |
| `backend/src/receipt_engine/receiptDebug.ts` | Extended snapshot: localModelInvoked, cloudFallbackInvoked, extractionSource, analyticsIncluded, overallConfidence, pipelineDebug. |
| `backend/src/services/localModelService.ts` | **New.** repairAndClassify stub; interface for future small model. |
| `backend/src/routes/receipts.ts` | process-text: body.rawText + optional body.image; call runHybridPipeline; save receipt with extractionSource, pipelineDebug, status from reviewStatus. POST /, from-local, from-base64: set extractionSource. |
| `frontend/src/api/client.ts` | postReceiptFromProcessText(idToken, rawText, base64Image?) — send optional image for cloud fallback. |
| `frontend/app/modal/scanner.tsx` | Pass base64 to postReceiptFromProcessText when available (camera and gallery). |

---

## 8. Library persistence fixes

- **No filter on imageUrl:** Library already shows all receipts (see ON_DEVICE_RECEIPT_PIPELINE_REPAIR_REPORT). Receipts without image (e.g. process-text only) appear with a placeholder; NEEDS_REVIEW shows a “Review” badge.
- **Every scan path creates a receipt:** process-text (including hybrid), from-local, from-base64, and POST / (multipart) always create a Receipt record. On cloud or parser failure, a “Pending Review” receipt is still created with status NEEDS_REVIEW so the receipt never disappears.
- **Hybrid pipeline:** Never throws without creating a receipt when the route catches and creates Pending Review on unexpected failure; normal low-confidence path produces a receipt with extractionSource and pipelineDebug.

---

## 9. Analytics gating behavior

- **Rule:** Only receipts with `status === "VERIFIED"` are included in spend and category analytics.
- **Where enforced:** `backend/src/routes/transactions.ts` (summary, stores), `backend/src/routes/reports.ts`, `backend/src/services/appQueryService.ts` — all filter `where: { status: "VERIFIED" }` (or equivalent).
- **Hybrid pipeline:** Sets `reviewStatus` to `"verified"` only when overall confidence is high (or cloud succeeded); otherwise `"needs_review"`, which maps to `NEEDS_REVIEW` and excludes the receipt from analytics.
- **Result:** Weak or uncertain scans are saved to Library and marked NEEDS_REVIEW; they do not affect total spent, store spend, or category breakdown until the user corrects or re-verifies.

---

## 10. Test matrix results

| # | Case | Expected | Implementation / result |
|---|------|----------|--------------------------|
| 1 | Short clean receipt | Stays local, VERIFIED | High confidence; extractionSource "local"; no cloud. |
| 2 | Long receipt, truncated OCR | Local repair or cloud fallback | Low/medium confidence; if image sent, cloud fallback used when low. |
| 3 | Blurry receipt | Repair or NEEDS_REVIEW | Low confidence + no/small image → NEEDS_REVIEW; with image → cloud attempt. |
| 4 | Grocery receipt | Not all Grocery | Category order item-first; unknown → Other. |
| 5 | Pharmacy receipt | Category mix correct | Item dictionary + fuzzy + store hint; no forced Grocery. |
| 6 | Receipt in Library in all successful scans | Yes | All paths create Receipt; Library shows all; no imageUrl filter. |
| 7 | Totals do not explode | Cents normalized | normalizeAmountForTotal (100–9999 → /100); parser and filter plausible totals. |
| 8 | Store totals align with trusted receipt totals | Only VERIFIED | Analytics and reports use status = VERIFIED only. |

Manual verification recommended for: short clean receipt (local only), long receipt with image (trigger cloud fallback), and NEEDS_REVIEW receipt excluded from dashboard totals.

---

## 11. Remaining weak spots

- **Real local model:** Not integrated; stub only. Integrate SmolVLM-256M/500M or similar when ready; keep optional and budget-aware.
- **Item-level cents:** Line-item regex still expects `\d+\.\d{2}`; OCR like "899" on a line may yield totalPrice 0. Consider extending item extractor with cents normalization for line amounts (similar to total).
- **Frontend OCR length thresholds:** Scanner uses OCR_MIN_CHARS (100) and OCR_MIN_LINES (3); if OCR is just above that but still poor, backend may still get "medium" and skip cloud. Backend confidence is authoritative; frontend thresholds only decide whether to call process-text or go straight to base64.
- **Cost control:** Cloud fallback is gated by confidence + image; to further limit cost, consider rate limits or a per-user/month cap and surface in pipelineDebug.
- **Edit / re-verify UI:** NEEDS_REVIEW receipts show a badge; no in-app edit flow yet to correct total/store/items and set VERIFIED. Structure (status, extractionSource, pipelineDebug) supports adding it.
- **Deep link / GET /api/receipts/debug:** Returns last snapshot only; for per-receipt debug, use Receipt.pipelineDebug from GET /api/receipts (each receipt can include pipelineDebug in the response if needed).

---

## 12. Quick reference — flow and env

**Flow:**  
Capture/upload → Apple Vision / on-device OCR → rawText (and optional base64) → **runHybridPipeline** → confidence scoring → [high: use local] [medium: local + repair stub] [low + image: cloud] → normalize to UnifiedReceiptResult → save Receipt + Items (extractionSource, pipelineDebug, status) → Library shows all; analytics use VERIFIED only.

**Env (optional):**

- `RECEIPT_MIN_OCR_CHARS` — min OCR length for coverage score (default 80).
- `RECEIPT_MIN_OCR_LINES` — min line count (default 3).
- `RECEIPT_MIN_ITEM_COVERAGE` — min item coverage for high confidence (default 0.5).
- `RECEIPT_CLOUD_FALLBACK_ENABLED` — set to `"0"` to disable cloud fallback.
- `LOCAL_RECEIPT_MODEL_ENABLED` — set to `"1"` to enable local-model stub path.
- `DEBUG_RECEIPT=1` or `NODE_ENV=development` — enable last-receipt debug snapshot and file write.

**Report file location:** `HYBRID_RECEIPT_AI_INTEGRATION_REPORT.md` in the project root.
