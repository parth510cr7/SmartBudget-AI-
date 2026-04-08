# Auth Repair Plan — P0 (Executed 2026-04-04)

**Status:** Plan approved; implementation follows this document.  
**Scope:** Auth only — no Clerk, Stripe, Sentry, or feature work.

---

## 1. Root cause

- **Backend** (`firebase-admin`): `verifyIdToken` accepts **Firebase Authentication ID tokens** only (issuer `securetoken.google.com/<project>`).  
- **Frontend (before fix):** Sent **raw** Apple `identityToken` and Google OAuth `id_token` from Expo OAuth — **OIDC tokens from Apple/Google**, not Firebase session tokens.  
- **Risk:** Tokens fail verification or behavior depends on accidental fallbacks (e.g. `dev-bypass` in `requireAuth`).

**Confirmed by:** Repository trace (`AUTH_TRUTH_CHECK.md`), Context7 docs on `verifyIdToken` / `signInWithCredential`.

---

## 2. Exact mismatch

| Layer | Before | After (target) |
|-------|--------|------------------|
| Client token sent to `/api/auth/sync` | Apple/Google OIDC JWT | **Firebase ID token** from `user.getIdToken()` |
| `verifyIdToken` | Same mismatch | **Aligned** |

---

## 3. Chosen fix strategy

**Firebase Auth as single source of truth (Phase 2 option A):**

1. Initialize Firebase **client** app with public web config (`EXPO_PUBLIC_FIREBASE_*`).  
2. **Google:** After `expo-auth-session` returns `id_token` (and `access_token` if present), build `GoogleAuthProvider.credential(idToken, accessToken)`, `signInWithCredential`, then `getIdToken()`.  
3. **Apple:** Generate a **cryptographic `nonce`**, pass **same** value to `AppleAuthentication.signInAsync({ nonce })` and to `OAuthProvider('apple.com').credential({ idToken, rawNonce })`, then `signInWithCredential`, then `getIdToken()`.  
4. Send **only** the Firebase ID token to `authSync()` / backend.  
5. **Backend:** Keep `verifyIdToken`; update comments to state “Firebase Auth ID token” only.  
6. **`requireAuth`:** Remove silent `dev-bypass` on verification failure; return **401**. Keep explicit **`dev-token`** path for non-production local testing only.

---

## 4. Files to change

| File | Change |
|------|--------|
| `frontend/src/auth/firebaseClient.ts` | **New** — Firebase app + Auth (`initializeAuth` + AsyncStorage persistence on native; `getAuth` on web). |
| `frontend/src/auth/exchangeOAuthForFirebaseIdToken.ts` | **New** — Google + Apple → Firebase ID token helpers. |
| `frontend/app/modal/login.tsx` | Call helpers before `authSync`; Apple uses `nonce`; Google passes optional `access_token`. |
| `backend/src/routes/auth.ts` | Comment clarity only (token type). |
| `backend/src/middlewares/auth.ts` | Remove verify-failure bypass; 401 on bad token; narrow logging. |
| `frontend/.env.example` | Document `EXPO_PUBLIC_FIREBASE_*`. |
| `frontend/app.json` | Optional empty `extra` keys for Firebase (or rely on env only). |

---

## 5. Why this is the smallest safe fix

- Reuses existing **backend** contract (`verifyIdToken` + Prisma `firebaseId`).  
- Adds only **client-side** exchange using official Firebase JS Auth APIs.  
- No schema migration; `User.firebaseId` remains Firebase UID.  
- Removes **misleading** auth success path for invalid tokens in dev.

---

## 6. Risks

| Risk | Mitigation |
|------|------------|
| Firebase web config missing / wrong | Clear Alert in UI; `.env.example` documents vars. |
| Apple nonce mismatch | Same `rawNonce` for Expo + Firebase credential. |
| Hot reload double `initializeAuth` | Catch `auth/already-initialized` → `getAuth(app)`. |
| Existing users | Same Firebase project → same UID → same Prisma row. |

---

## 7. Manual test cases

See **`AUTH_TEST_PLAN.md`**.

---

## 8. Evidence sources

| Claim | Source |
|-------|--------|
| `verifyIdToken` = Firebase ID tokens | Context7 `/firebase/firebase-admin-node`; repo `auth.ts` |
| `signInWithCredential` + Google/Apple | Context7 Firebase JS SDK; `@firebase/auth` RN typings |
| Prior mismatch | `AUTH_TRUTH_CHECK.md` |
| MCP | Context7 used; Firebase MCP not required for code fix |
