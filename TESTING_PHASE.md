# What to do now — testing phase

## 1. Commit and push the latest changes (no build)

You have new files that are **config/docs only** (no native change):

- `.cursor/rules/eas-build-conservation.mdc` — Cursor rule for build conservation
- Earlier: workflow changes (manual trigger, iOS/Android-only), `BUILD_CONSERVATION.md`

**Do this:**

```powershell
cd c:\Users\parth\Desktop\SmartBudgetAI
git add .
git status   # confirm: .cursor/rules, BUILD_CONSERVATION, TESTING_PHASE, .github, frontend/.eas
git commit -m "chore: build conservation — manual EAS trigger, Cursor rule, testing guide"
git push origin main
```

**What to expect:**  
- GitHub Action will **not** run a build (we removed push trigger).  
- Your repo will be up to date. No EAS build is used.

---

## 2. Day-to-day testing (without spending a build)

**Use Expo Go on your iPhone** for:

- UI: Profile, On-device AI section, buttons, loading states
- Navigation, modals, receipts list, basket, groups
- API: backend calls (keep backend running; point app at your machine’s IP)
- Receipt pipeline: scan flow, **except** the actual on-device LLM (that needs a device build)

**What to expect:**

- Most screens and flows work in Expo Go.
- **Download Phi 3.5 mini** in Profile may still say “Storage not available” in Expo Go (Expo Go’s storage can differ). That’s expected until you test with a **device build** (when you spend one iOS build).
- No new iOS build is needed for this phase.

---

## 3. When you’re ready to test native (Phi 3.5 / llama.rn) — spend one iOS build

Do this only when you want to verify on a real install:

- Phi 3.5 download (storage with `expo-file-system/legacy`)
- Load model → **Load model** in Profile
- First receipt parse using on-device LLM

**Do this:**

1. GitHub → **Actions** → **EAS Production Build (manual)**.
2. **Run workflow**.
3. Choose **Platform: ios**.
4. Run. Wait for the build to finish.
5. Install the new build on your iPhone (QR or link from Expo dashboard).
6. In the app: **Profile → On-device AI** → **Download Phi 3.5 mini** → then **Load model** → scan a receipt.

**What to expect:**

- Download should progress (no “No storage directory” if the legacy fix is in that build).
- After **Load model**, status should show “Ready”.
- Scanning a receipt should use the on-device LLM when the specialized parser doesn’t return a confident result.
- If something fails (e.g. init crash, no inference), note the exact screen and error; we can fix in JS/native and then you run **one more** iOS build when the next native milestone is ready.

---

## 4. Quick reference

| Goal                         | Where to test      | Uses an iOS build? |
|-----------------------------|--------------------|----------------------|
| UI, API, navigation, lists | Expo Go + backend  | No                  |
| Receipt scan (no LLM path)  | Expo Go            | No                  |
| Phi 3.5 download + load + LLM | Device (EAS build) | Yes — 1 build       |

**Builds are only used when you manually run the workflow and choose iOS (or both).**
