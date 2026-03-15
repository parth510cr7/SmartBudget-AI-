# What’s done for you / What you need to do

## Full pre-flight before opening app on your phone (EAS)

Do this when you want **everything updated and one build to test on device** so you know what’s working:

| # | Where | Command / action |
|---|--------|-------------------|
| 1 | Frontend | `cd frontend` then `Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue; npm install` — applies all patches (e.g. expo-text-extractor ✔). |
| 2 | Backend | `cd backend` then `npm install` — deps up to date. |
| 3 | Frontend | `cd frontend` then `eas build --platform ios --profile development` — upload to EAS and get a new iOS build with patches. |
| 4 | Phone | When the build finishes, install the build from the EAS link (or QR). Open that **development build** (not Expo Go) to test. |
| 5 | Dev | Backend: `npm run dev`. Frontend: `npx expo start`. Use the same dev build on the phone for JS updates. |

After step 3, the app binary on EAS includes the full patches (including the iOS OCR fix). You only need a new EAS build when native code or env changes.

---

## Done in the repo (no action needed)

1. **patch-package**
   - `patches/expo-text-extractor+2.0.0.patch` — reapplies the iOS OCR fix (full receipt, accurate recognition, sorted observations) after every install.
   - `package.json` has `"postinstall": "patch-package"` and `patch-package` in devDependencies.
   - So: every `npm install` (local and on EAS) will re-apply the Swift fix.

2. **Frontend**
   - OCR logging, short-OCR rule (min 5 lines / 150 chars), and `getRawTextFromImageWithMeta` are in place.
   - Scanner uses the new thresholds and logging.

3. **Backend**
   - Short-OCR bypass in process-text (if rawText too short and image provided → cloud only) is in place.

4. **iOS native**
   - The modified `ExpoTextExtractorModule.swift` is already in your `node_modules`; the patch file will restore it after any fresh install.
   - The patch includes: `.accurate` recognition, observation sorting, **image orientation** passed to Vision, and `usesLanguageCorrection = false` / `recognitionLanguages = ["en-US"]` for full receipt text. Scanner uses higher res (1600px / 0.78 quality) for OCR.

---

## What you need to do

### 1. Install patch-package (one time, in frontend)

```bash
cd c:\Users\parth\Desktop\SmartBudgetAI\frontend
npm install
```

This installs `patch-package` and runs `postinstall`, which applies the patch.

- If you see **“Patch applied successfully”** (or no patch errors), you’re good.
- If you see **“Patch failed”** or “already applied”: your `node_modules` already has the Swift fix from earlier. That’s fine — your local app already has the fix. The patch will apply correctly on EAS (clean install) and on future `rm -rf node_modules && npm install`.

To confirm the patch works on a clean install (optional):

```bash
# Windows (PowerShell)
Remove-Item -Recurse -Force node_modules
npm install
```

If the patch still fails on a clean install, regenerate it (your node_modules already has the fix):

```bash
npx patch-package expo-text-extractor
```

Then commit the updated `patches/expo-text-extractor+2.0.0.patch` if it changed.

---

### 2. Run on iPhone via Metro (development)

- Backend: keep `npm run dev` running in the backend folder (you already have this).
- Frontend: from the **frontend** folder run:

  ```bash
  npx expo start
  ```

- Open the app on your iPhone using your **development build** (not Expo Go), so it uses the patched native module.
- The iOS OCR fix is in native code, so you need a **new native build** at least once:
  - **If you use a local dev client:** run `npx expo run:ios` once (with the iPhone connected or simulator) to rebuild the native app with the patched module, then use `npx expo start` as usual.
  - **If you use EAS dev build:** do step 3 below; the next EAS build will include the patch.

---

### 3. EAS build (so the fix is in your uploaded app)

- Commit and push the new files:
  - `frontend/patches/expo-text-extractor+2.0.0.patch`
  - `frontend/package.json` (postinstall + patch-package)
  - Any other OCR/frontend/backend changes you care about.

- Trigger a **new iOS build** so the app binary includes the patched native code:

  ```bash
  cd c:\Users\parth\Desktop\SmartBudgetAI\frontend
  eas build --platform ios --profile development
  ```

  (Use your real EAS profile name if it’s not `development`, e.g. `preview` or `production`.)

- EAS will run `npm install`, which runs `postinstall` → `patch-package`, so the iOS fix is applied before the native build. The new build will have full-receipt OCR on device.

- After the build finishes, install that build on your iPhone (or use the link EAS gives you). Then you can keep using Metro (`npx expo start`) for JS changes; the native OCR fix is already in that build.

---

### 4. Quick checklist

| Step | Where | Command / action |
|------|--------|-------------------|
| 1 | Frontend | `npm install` (installs patch-package, applies patch) |
| 2 | Backend | Already running `npm run dev` ✓ |
| 3 | Frontend | `npx expo start` (Metro) |
| 4 | Native build | Either `npx expo run:ios` (local) or `eas build --platform ios --profile <your-profile>` (EAS) so the app includes the patched OCR |
| 5 | Phone | Open the **development build** (not Expo Go) and test receipt scan |

---

### If the patch ever fails after an install

- If `expo-text-extractor` is upgraded and the patch doesn’t apply:
  1. Open `node_modules/expo-text-extractor/ios/ExpoTextExtractorModule.swift` and re-apply the two changes (sort observations, set `request.recognitionLevel = .accurate`).
  2. Run `npx patch-package expo-text-extractor` to regenerate the patch.
  3. Commit the new patch file.

That’s all you need to do on your side; the rest is already in the repo.
