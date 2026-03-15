# OCR Full-Receipt Fix (First-Line-Only Bug)

## Root cause

On **iOS**, `expo-text-extractor` uses Vision's `VNRecognizeTextRequest` without setting `recognitionLevel`. The native code also did not sort observations by position, so order could be wrong. In practice, only one observation (first line) was often returned.

**Android** (ML Kit) already uses `visionText.text` (full document) and splits by newline; no change needed there.

## Changes made

### 1. iOS native (expo-text-extractor)

**File:** `node_modules/expo-text-extractor/ios/ExpoTextExtractorModule.swift`

- Set `request.recognitionLevel = .accurate` so Vision returns full-document text instead of a fast/partial result.
- Sort observations by bounding box (top-to-bottom, then left-to-right) before extracting strings, so the joined text is in reading order.
- Pass **image orientation** into `VNImageRequestHandler(cgImage:orientation:options:)` so Vision sees the receipt right-side-up (fixes “only first line” when the photo has EXIF rotation).
- Set `request.usesLanguageCorrection = false` and `request.recognitionLanguages = ["en-US"]` so receipt/product text isn’t over-corrected and full-page recognition is more reliable.

**Persistence:** The fix is persisted using **patch-package**. The repo has:
- `patches/expo-text-extractor+2.0.0.patch` — applies the iOS changes.
- `package.json` scripts include `"postinstall": "patch-package"` so every `npm install` (including on EAS) re-applies the patch.
- Dev dependency `patch-package` is added to the frontend.

### 2. Frontend: OCR logging and short-OCR rule

- **`src/utils/ocr.ts`**
  - Added `getRawTextFromImageWithMeta()` returning `{ text, blockCount, lineCount, charCount }`.
  - Logs in dev: `[OCR] Native returned blocks=X lines=Y chars=Z` and a short preview; warns if only one block.
  - `getRawTextFromImage()` still exists and returns only `text` (uses the meta function internally).

- **`app/modal/scanner.tsx`**
  - Uses `getRawTextFromImageWithMeta()` and logs:
    - Original image dimensions (when URI available)
    - Preprocessed: maxWidth, quality
    - OCR blocks, lines, chars, and whether result is too short
    - Final text length and preview passed to parser
    - Whether cloud fallback was triggered
  - **Short-OCR rule:** `OCR_MIN_LINES = 5`, `OCR_MIN_CHARS = 150`. If OCR has fewer than 5 lines or fewer than 150 chars, local result is **not** trusted: cloud is used (and image is always sent with process-text so backend can fallback).

### 3. Backend: short-OCR bypass

- **`backend/src/routes/receipts.ts`**
  - Constants: `PROCESS_TEXT_MIN_LINES = 5`, `PROCESS_TEXT_MIN_CHARS = 150`.
  - If `rawText` has fewer than 5 lines or fewer than 150 chars **and** `image` (base64) is provided, the handler **skips the hybrid pipeline** and calls `parseReceiptImage(base64)` directly, then saves the receipt with `extractionSource: "cloud"` and `pipelineDebug.shortOcrBypass: true`.
  - First-line-only OCR is never passed to the parser as if it were a full receipt.

## Runtime logging (one receipt)

For a single scan, in dev you should see logs similar to:

- `[ReceiptScan] original image dimensions: WxH`
- `[ReceiptScan] preprocessed: maxWidth=1600 quality=0.78`
- `[OCR] Native returned blocks=N lines=L chars=C | raw preview: ...`
- `[OCR] Only one block returned – receipt may be truncated. Cloud fallback recommended.` (if N ≤ 1)
- `[ReceiptScan] OCR blocks=N lines=L chars=C | tooShort=true/false`
- `[ReceiptScan] final text passed to parser: X chars, preview: ...`
- `[ReceiptScan] Short-OCR: local result not trusted ...` (if too short)
- `[ReceiptScan] cloud fallback triggered: yes/no`

Backend (when short-OCR bypass runs):

- `[process-text] Short-OCR: lines=X chars=Y. Skipping local pipeline, using cloud.`

## Re-test checklist

1. **Short receipt** — OCR lines and chars; full text present; fallback only if short; parser gets full text when not short.
2. **Long receipt** — After iOS patch, multiple blocks/lines; full receipt text; fallback not triggered if OCR is sufficient.
3. **Gallery upload** — Same logging and short-OCR rule.
4. **Camera capture** — Same; original dimensions logged when URI available.

Pass: full receipt text is present when device OCR returns multiple blocks/lines; when OCR is short, cloud is used and first-line-only is never treated as verified local.
