# GitHub Actions → EAS (iOS build conservation)

**Constraint:** Limited iOS EAS builds; Windows + iPhone. Do not auto-trigger builds on push.

## How it works now

- **No build on push.** The workflow runs only when you trigger it manually.
- **Choose platform when you run:** iOS only, Android only, or both.
- **iOS-only workflow** exists so you can spend one iOS build when you need it.

## Run a build (manual)

1. GitHub → your repo → **Actions**.
2. Select **"EAS Production Build (manual)"**.
3. Click **"Run workflow"**.
4. Choose **Platform:** `ios`, `android`, or `both`.
5. Run. Only the selected platform(s) will be built.

## When to spend an iOS build

Only when the change **cannot be tested in Expo Go**, e.g.:

- llama.rn / on-device LLM (GGUF load, init, inference)
- Native OCR / camera / file-system behavior
- New or changed native modules or permissions
- Full device QA after a native milestone

For JS-only work (UI, API, state, navigation, receipt pipeline logic, model download UI): test in **Expo Go** or web; do **not** run an iOS build.

## One-time setup

- **EXPO_TOKEN** in repo Secrets (already done).
- iOS credentials set up in EAS (already done).
