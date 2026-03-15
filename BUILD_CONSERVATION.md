# iOS EAS build conservation (Windows + iPhone)

**Constraint:** Only 7 iOS EAS builds left. Optimize so we only use a build when native testing is required.

## Rule

- **Do NOT** trigger a new iOS build unless the change truly requires native testing.
- For every task, label: **JS-only / Expo Go testable** vs **Native-change / custom build required**.

## Testing layers

| Layer | Use for | Build needed? |
|-------|---------|----------------|
| **A — JS-only** | UI, layout, copy, state, navigation, API, modals, lists, loading/error, group/basket/search UI | **No** — use Expo Go |
| **B — Native milestone** | llama.rn, OCR/camera, permissions, file-system/model load, native modules | **Yes** — one build when milestone ready |
| **C — Major QA** | Full device QA after a native milestone | **Yes** — one build |

## Before spending an iOS build, state

1. Why this **cannot** be tested in Expo Go
2. Which **native module or behavior** changed
3. What **exact feature** to test on device
4. **Success criteria** before using another build

## Local LLM / Phi-3.5

Do **not** ask for repeated builds early. First complete in JS/Expo Go:

- Model service abstraction, settings UI, download/import flow, model status UI
- Confidence gating, fallback wiring, debug logging, receipt pipeline integration

Then **one** iOS build to test: llama.rn, GGUF load, `initOnDeviceLLM(modelPath)`, first inference, memory/performance.

## Automation

- **No build on push.** EAS production build runs only when you manually run the GitHub Action.
- To build: **Actions** → **EAS Production Build (manual)** → choose **iOS**, **Android**, or **both** → Run workflow.

## Response format (for AI)

For every task:

- Task summary
- **Can this be tested in Expo Go?** yes/no
- If no: why native build is required
- What to complete before spending a build
- Recommended milestone grouping
- **Spend a build now or wait?**
