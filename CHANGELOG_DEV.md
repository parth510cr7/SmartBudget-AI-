# Changelog — Development (SmartBudgetAI)

## 2026-04-04 — P0 Auth: Firebase ID tokens end-to-end

### What changed

- **Frontend:** After Apple/Google OAuth, the app exchanges provider tokens for a **Firebase Authentication** session via `signInWithCredential`, then sends **`user.getIdToken()`** to `POST /api/auth/sync` and all API calls.
- **Frontend:** New modules `frontend/src/auth/firebaseClient.ts`, `frontend/src/auth/exchangeOAuthForFirebaseIdToken.ts`; Apple sign-in uses a cryptographic **nonce** passed to both Apple and Firebase.
- **Backend:** `requireAuth` no longer falls back to a `dev-bypass` user when `verifyIdToken` fails — returns **401** instead.
- **Docs:** `AUTH_REPAIR_PLAN.md`, `CURSOR_AUTOMATION_PLAN.md`, `AUTH_TEST_PLAN.md`, `NEXT_ACTIONS.md`, project Skills under `.cursor/skills/`.

### Why

- `verifyIdToken` only accepts Firebase-issued ID tokens; raw Apple/Google JWTs were structurally wrong (see `AUTH_TRUTH_CHECK.md`).

### Files touched

- `frontend/app/modal/login.tsx`
- `frontend/src/auth/firebaseClient.ts` (new)
- `frontend/src/auth/exchangeOAuthForFirebaseIdToken.ts` (new)
- `frontend/.env.example`
- `backend/src/middlewares/auth.ts`
- `backend/src/routes/auth.ts` (comments)

### Risk level

- **Medium** — requires correct `EXPO_PUBLIC_FIREBASE_*` and Firebase Console provider setup; misconfiguration surfaces as sign-in errors (fail-safe).

### Rollback

- Revert the commit that introduced this changelog entry; restore previous `login.tsx` and `middlewares/auth.ts` **only** if rollback is required (previous client sent non-Firebase tokens — not valid for production).

---

## 2026-04-04 — Metro + Firebase JS (Expo Go / dev client startup)

### What changed

- **`frontend/metro.config.js`:** set `resolver.unstable_enablePackageExports = false` so Metro resolves the **React Native** Firebase Auth bundle. Default `package.json` exports (Metro ≥0.79) break Firebase Auth on device (“auth not registered” / failed startup).
- **`frontend/src/auth/firebaseClient.ts`:** use direct `getReactNativePersistence` import from `firebase/auth` (safe once resolver is fixed); removed `require("firebase/auth")` workaround.

### After pulling

- Clear cache once: `npx expo start -c`
