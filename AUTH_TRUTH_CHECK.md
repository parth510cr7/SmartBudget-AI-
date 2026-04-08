# Auth Truth Check — End-to-End Trace

**Last updated:** 2026-04-04  
**No code patches in this document** — analysis and test plan only.

---

## 1. Intended contract (as written in code comments)

- `backend/src/routes/auth.ts` documents: *“Expects Authorization: Bearer \<idToken\> (**Firebase ID token** from Apple/Google sign-in).”*  
- Implementation: `admin.auth().verifyIdToken(token)` (`firebase-admin`).

Per Firebase Admin behavior (see also Context7 `/firebase/firebase-admin-node`): **`verifyIdToken` validates ID tokens issued by Firebase Authentication** to Firebase Auth client sessions — not arbitrary OAuth JWTs from Google/Apple alone.

---

## 2. Client: token origin

### Apple (`frontend/app/modal/login.tsx`)

| Step | What happens |
|------|----------------|
| Source | `expo-apple-authentication` → `AppleAuthentication.signInAsync` |
| Token variable | `credential.identityToken` |
| Type | **Apple identity token** (JWT from Apple’s issuer, for your Apple Services ID / bundle) |
| Sent to API? | Yes — passed to `syncWithBackend(token)` → `authSync(idToken)` |

### Google (`frontend/app/modal/login.tsx`)

| Step | What happens |
|------|----------------|
| Source | `expo-auth-session` → `useIdTokenAuthRequest` → `googlePromptAsync()` |
| Token variable | `id_token` from OAuth response params (or `authentication.idToken`) |
| Type | **Google OAuth 2.0 ID token** (JWT from Google’s issuer for your OAuth client) |
| Sent to API? | Yes — `syncWithBackend(idToken)` |

### Firebase JS SDK

| Observation | Detail |
|-------------|--------|
| **Imports** | No `import ... from 'firebase/auth'` (or `firebase/app`) found in `.ts`/`.tsx` in prior audit. |
| **`firebase` package** | Present in `frontend/package.json`; **unused** in source unless added since audit — **re-verify** before Phase 2 edits. |

**Conclusion (client):** Tokens are **OAuth/OIDC JWTs from Apple and Google**, obtained **without** a visible `signInWithCredential` + Firebase Auth `getIdToken()` step in `login.tsx`.

---

## 3. Client: how tokens are sent

| Field | Value |
|-------|--------|
| **Function** | `authSync` in `frontend/src/api/client.ts` |
| **HTTP** | `POST` to `${getBaseURL()}/api/auth/sync` |
| **Header** | `Authorization: Bearer <token>` |
| **Body** | None |

Store: after success, `idToken` in Zustand is the **same string** returned from Apple/Google flows — used for subsequent `authHeaders(idToken)` calls.

---

## 4. Backend: verification path

### `/api/auth/sync` (`backend/src/routes/auth.ts`)

1. Extract `Bearer` token from `Authorization`.  
2. `ensureFirebase()` — init `firebase-admin` from `FIREBASE_PROJECT_ID` / `GOOGLE_CLOUD_PROJECT` / `GOOGLE_APPLICATION_CREDENTIALS`.  
3. `admin.auth().verifyIdToken(token)`.  
4. On success: `prisma.user.upsert` by `firebaseId` = `decodedToken.uid`.  
5. On failure: 401/500 with error message.

**No alternate verifier** for Apple/Google-only JWTs.

### `requireAuth` (`backend/src/middlewares/auth.ts`)

1. Production: rejects missing token or `dev-token`.  
2. Non-production: `dev-token` → fixed Prisma user.  
3. Otherwise: `verifyIdToken(token)`; on failure → **fallback** to upsert user `firebaseId: "dev-bypass"` and continue.

**Critical:** This fallback means **invalid tokens may still attach a user** in non-production — and the behavior must be **understood before production hardening**.

---

## 5. Does `verifyIdToken` match the client token type?

| Token from client | Expected by `verifyIdToken` | Match? |
|-------------------|----------------------------|--------|
| Firebase Auth **ID token** (issuer `https://securetoken.google.com/<project>`) | Yes | **Yes** |
| Google **OAuth** `id_token` (issuer `accounts.google.com`) | Firebase ID token | **No** — different issuer/audience |
| Apple **identity** token (issuer `https://appleid.apple.com`) | Firebase ID token | **No** |

**Uncertainty resolved at architecture level:** Unless the mobile app obtains tokens through **Firebase Authentication** (or you replace verification), **the written comment in `auth.ts` does not match the actual token types produced by `login.tsx`.**

**Operational uncertainty:** If sign-in **appears** to work locally, possible explanations include: Firebase/project misconfiguration masking errors, different code path not reviewed, or tokens being replaced in a build not reflected in source — **must be verified with a real token decode in staging** (do not guess).

---

## 6. Exact uncertainty points

1. **Whether production builds ever call Firebase Auth `getIdToken()`** — not visible in `login.tsx` as of this trace.  
2. **Whether backend ever receives a Firebase ID token** from another entry point (e.g. different branch, native module) — not found in this pass.  
3. **`dev-bypass` fallback** — can make API calls “succeed” with wrong tokens in dev — obscures (1) and (2).  
4. **Email/password path** in `frontend/app/auth.tsx` uses **mock** `idToken: "mock-email-id-token"` — likely **fails** real `verifyIdToken` unless only used offline; separate from OAuth flow.

---

## 7. What to test (staging) — minimal checklist

1. **Capture token** after Apple sign-in (first 20 chars + decode payload offline if safe) — note `iss`, `aud`, `sub`.  
2. Repeat for Google.  
3. **POST** `/api/auth/sync` with that Bearer token; record status and body.  
4. If 401: decode error from Firebase Admin message — confirms mismatch.  
5. **Temporarily** disable `dev-bypass` path and retest — ensure failures are **401**, not silent success.

---

## 8. What might need to change (planning only — no patch here)

| Direction | Idea |
|-----------|------|
| **Align with Firebase** | Add Firebase JS Auth on client: after Apple/Google credential, `signInWithCredential`, then `getIdToken()`; send **that** to `/api/auth/sync`. |
| **Align without Firebase client** | Replace `verifyIdToken` with Apple/Google JWT verification (e.g. `jwks-rsa`, issuer-specific) — **different** security model; `firebaseId` may need mapping strategy. |

**Product + security** must pick one; **do not** mix silently.

---

## 9. Files reference (trace anchor)

| Role | Path |
|------|------|
| OAuth UI + token send | `frontend/app/modal/login.tsx` |
| HTTP sync | `frontend/src/api/client.ts` (`authSync`, `authHeaders`) |
| Sync route | `backend/src/routes/auth.ts` |
| API auth middleware | `backend/src/middlewares/auth.ts` |
| Mock email auth | `frontend/app/auth.tsx` |

---

## 10. Summary sentence

**The backend is written for Firebase ID tokens; the login modal supplies Apple/Google OAuth JWTs. That is a structural mismatch until either the client obtains Firebase ID tokens or the server verifies the correct JWT type explicitly.**

---

## 11. Update (2026-04-04) — P0 client fix

The Expo client now completes **Firebase Auth** (`signInWithCredential` + `getIdToken`) before calling `/api/auth/sync`. See **`AUTH_REPAIR_PLAN.md`** and **`CHANGELOG_DEV.md`**. Backend verification remains `verifyIdToken` on Firebase-issued ID tokens only.
