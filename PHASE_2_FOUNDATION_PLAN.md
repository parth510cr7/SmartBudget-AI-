# Phase 2 — Foundation Plan (Next Coding Phase)

**Last updated:** 2026-04-04  
**Prerequisite:** Phase 1.5 docs (`LIVE_TOOL_VERIFICATION.md`, `RUNTIME_VS_IDE_BOUNDARY.md`, `AUTH_TRUTH_CHECK.md`).  
**Scope:** Ordered **implementation** work — still **no** broad feature refactors unrelated to foundation.

---

## Goal

Make **authentication truthful**, **observability planned**, and **deployment documented** so feature work proceeds safely.

---

## Order of execution

### 1. Highest risk first — Auth token contract (P0)

| Item | Detail |
|------|--------|
| **Issue** | Backend uses `admin.auth().verifyIdToken`, which validates **Firebase Authentication ID tokens** (issued to Firebase Auth clients). Client currently sends **Apple `identityToken`** and **Google OAuth `id_token`** from `expo-apple-authentication` / `expo-auth-session` — these are **not** Firebase ID tokens unless exchanged via Firebase Auth on the client. |
| **Why first** | Wrong or accidental bypass paths undermine every authenticated route. |
| **Likely files** | `frontend/app/modal/login.tsx`, optional new `frontend/src/auth/*` if adding Firebase JS Auth; `backend/src/routes/auth.ts`, `backend/src/middlewares/auth.ts` (only after token strategy is fixed — **tighten** `dev-bypass` for production). |
| **Human required** | **Yes** — Firebase console (Auth providers, iOS URL schemes, SHA keys for Android), Apple/Google OAuth config, staging device tests. |
| **Staging tests** | Sign in with Apple; Sign in with Google; call `/api/auth/sync` then any `GET /api/...` with `Authorization: Bearer <token>`; confirm **same user** in Prisma `User` with stable `firebaseId`. |
| **Success criteria** | `verifyIdToken` succeeds with the token the client sends; no reliance on non-production fallbacks for real users; production `NODE_ENV` with no `dev-token` for real traffic. |

**Do not** ship a large refactor until one of these **documented** strategies is chosen:

- **A (typical):** Firebase JS Auth on client → `user.getIdToken()` → existing backend.  
- **B:** Custom verification of Apple/Google JWTs with different libraries/claims — **different** code path than `verifyIdToken` (explicit contract change).

---

### 2. Remove ambiguity — Dev and fallback behavior (P1)

| Item | Detail |
|------|--------|
| **Issue** | `requireAuth` falls back to `dev-bypass` user when `verifyIdToken` fails (`middlewares/auth.ts`). That can **mask** misconfiguration. |
| **Files** | `backend/src/middlewares/auth.ts` |
| **Human required** | Decide: disable fallback entirely in production, or gate behind explicit env flag. |
| **Staging tests** | Invalid token → **401**, not success as random user. |
| **Success criteria** | Predictable failure modes; no silent login as `dev-bypass` in production. |

---

### 3. Dependency hygiene — Frontend `firebase` package (P2)

| Item | Detail |
|------|--------|
| **Issue** | `firebase` in `frontend/package.json` with **no imports** in `.ts`/`.tsx` (per audit). |
| **Action** | If Phase 2 adopts Firebase JS Auth → **use** it. Else → **remove** unused dependency after confirmation. |
| **Files** | `frontend/package.json`, new auth module if applicable |
| **Success criteria** | No orphan major dependency; bundle clarity. |

---

### 4. Observability — Sentry (P2–P1 depending on release pressure)

| Item | Detail |
|------|--------|
| **Issue** | No crash reporting in runtime code. |
| **Files** | `frontend` (Expo / RN SDK), `backend/src/index.ts` (error middleware optional) |
| **Human required** | Create Sentry project(s), DSN in env, org policy. |
| **Staging tests** | Force test error; appears in Sentry; source maps for release builds. |
| **Success criteria** | Errors visible per environment; PII redaction policy documented. |

---

### 5. Deployment truth — API host (P3)

| Item | Detail |
|------|--------|
| **Issue** | Render (or other) not defined in repo; `EXPO_PUBLIC_API_URL` must match staging/prod. |
| **Files** | `README.md`, optional `render.yaml` or host-specific doc |
| **Human required** | Choose host; set secrets. |
| **Success criteria** | Documented URL; health check; env parity checklist. |

---

## What not to touch yet

- **Stripe** — No SDK until billing spec exists.  
- **Clerk** — Not in stack.  
- **Braintrust** — Not integrated.  
- **Broad UI/feature work** — After P0 auth is green in staging.

---

## Automation vs human (Phase 2)

| Work | Agent can draft | Human must do |
|------|-----------------|---------------|
| Auth refactor scaffolding | Yes | Firebase console, device testing, merge |
| Remove `dev-bypass` in prod | Yes (small PR) | Review security |
| Sentry wiring | Yes after DSN | Create projects, DSN, release health |
| Deployment doc | Yes | Credentials, DNS, Render/dashboard |

---

## Exit criteria for Phase 2

- [ ] Auth path documented in `AUTH_TRUTH_CHECK.md` with **resolved** token type.  
- [ ] Staging sign-in passes for Apple + Google (or documented platform scope).  
- [ ] No silent `dev-bypass` for invalid tokens in production.  
- [ ] Sentry scoped or explicitly deferred with owner + date.  
- [ ] API base URL documented for staging.
