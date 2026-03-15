# On-Device LLM (Option 2) + Specialized Receipt Model (Option 4) – Integration Steps

This doc outlines how both options are integrated and how to extend them.

---

## Architecture Overview

```
Receipt scan → OCR text (existing)
       ↓
  ┌─────────────────────────────────────────────────────────────────┐
  │  Unified pipeline (receiptParsePipeline)                        │
  │  1. Try Option 4: Specialized receipt model (fast, small)        │
  │  2. Try Option 2: On-device LLM (flexible, one model for all)    │
  │  3. Fallback: Backend process-text / regex / cloud               │
  └─────────────────────────────────────────────────────────────────┘
```

- **Option 4 (specialized):** Small model or rules tuned only for “receipt text → store, total, date, items.” Currently implemented with the enhanced local parser; later you can plug in an ONNX/Donut-style model.
- **Option 2 (on-device LLM):** General 1–3B LLM (e.g. via llama.rn) for receipt parsing via prompt, plus future chat/categorization. Requires a dev build (no Expo Go).

---

## Step-by-Step Integration Status

### Phase 1 – Foundation (done in code)

| Step | What | Status |
|------|------|--------|
| 1.1 | Add `specializedReceiptModel` service – interface + implementation using enhanced local parser | ✅ |
| 1.2 | Add `onDeviceLLM` service – init + receipt prompt; graceful no-op when llama.rn not loaded | ✅ |
| 1.3 | Add `receiptParsePipeline` – try specialized → LLM → return result or `null` for fallback | ✅ |
| 1.4 | Wire scanner to pipeline: use pipeline when OCR text is available; else keep current flow | ✅ |

### Phase 2 – Option 2: On-device LLM (llama.rn)

| Step | What | Notes |
|------|------|--------|
| 2.1 | Install `llama.rn` and `expo-build-properties` | Done. Requires a **development build** (Expo Go does not include the native module). |
| 2.2 | Enable New Architecture | Expo 54+ uses it by default. |
| 2.3 | Add a small GGUF model | e.g. Phi-3 mini or Llama 3.2 1B/3B; bundle in app or download on first use. |
| 2.4 | Init LLM in app | Call `initOnDeviceLLM(modelPath)` once; use `expo-file-system` document dir for model path. |
| 2.5 | Rebuild native app | Run `npx expo prebuild --clean` then `npx expo run:ios` or EAS Build. |

### Phase 3 – Option 4: Real specialized model (optional upgrade)

| Step | What | Notes |
|------|------|--------|
| 3.1 | Choose model | Donut-CORD (image→JSON) or a small NER/seq2seq for text→JSON. |
| 3.2 | Export to mobile | Core ML (iOS) / TFLite or ONNX (Android). Hugging Face `exporters` or `coremltools`. |
| 3.3 | Add runtime in app | e.g. `onnxruntime-react-native` for ONNX, or native Core ML / TFLite modules. |
| 3.4 | Implement `SpecializedReceiptModel.runModel()` | Load model once; run on OCR text or image; map output to `SpecializedParseResult`. |

---

## File Map

| File | Role |
|------|------|
| `src/services/specializedReceiptModel.ts` | Option 4: interface + current implementation (local parser). |
| `src/services/onDeviceLLM.ts` | Option 2: init LLM, receipt prompt, JSON parse. No-op if llama.rn not present. |
| `src/services/receiptParsePipeline.ts` | Orchestrates: try specialized → try LLM → return or null. |
| `app/modal/scanner.tsx` | Uses pipeline when OCR text exists; falls back to existing backend/regex/cloud. |

---

## Usage

- **No extra setup:** App behaves as before; pipeline uses specialized (local parser) then falls back to backend.
- **With on-device LLM:** Install llama.rn, add model, init in app (or from a “Download model” screen); pipeline will use it when available.
- **With real Option 4 model:** Implement model load/run in `specializedReceiptModel.ts`; pipeline will use it first.

---

## Env / Config (optional)

- Backend still respects `RECEIPT_USE_CLOUD_WHEN_NEEDS_REVIEW=0` and `RECEIPT_CLOUD_FALLBACK_ENABLED=0` for free tier.
- Frontend can add a setting later, e.g. “Use on-device AI” toggle that enables/disables calling the LLM and/or specialized model in the pipeline.

