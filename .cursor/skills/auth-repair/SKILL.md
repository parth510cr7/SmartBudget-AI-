---
name: auth-repair
description: Fix or verify Firebase Auth ID token flow between Expo client and Express backend (SmartBudgetAI).
---

# Auth repair (project-specific)

## When to use

- Changing `frontend/app/modal/login.tsx`, `frontend/src/auth/*`, `backend/src/middlewares/auth.ts`, or `backend/src/routes/auth.ts`.
- Debugging 401s after sign-in or Prisma user mismatch.

## Read first

1. `AUTH_TRUTH_CHECK.md` — token contract.
2. `AUTH_REPAIR_PLAN.md` — intended architecture.
3. `PROJECT_RISK_REGISTER.md` — auth risks.

## Rules

- `.cursor/rules/eas-build-conservation.mdc` — JS auth changes are Expo Go testable; no iOS build for token-only fixes.
- Never log raw tokens or secrets.

## Workflow

1. Confirm client sends **Firebase ID token** (`getIdToken()` after `signInWithCredential`).
2. Confirm backend uses **`verifyIdToken` only** for real users (`backend/src/routes/auth.ts`, `requireAuth`).
3. Local API testing without device Firebase: use `Authorization: Bearer dev-token` with **non-production** backend only (`middlewares/auth.ts`).
4. After edits: run `AUTH_TEST_PLAN.md` manual section.

## Canonical files

| Area | Path |
|------|------|
| OAuth UI | `frontend/app/modal/login.tsx` |
| Firebase client | `frontend/src/auth/firebaseClient.ts` |
| OAuth → Firebase token | `frontend/src/auth/exchangeOAuthForFirebaseIdToken.ts` |
| API sync | `frontend/src/api/client.ts` (`authSync`) |
| Sync route | `backend/src/routes/auth.ts` |
| Route guard | `backend/src/middlewares/auth.ts` |
