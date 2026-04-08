# Auth Test Plan — SmartBudgetAI

**Last updated:** 2026-04-04  
**Applies to:** Firebase Auth ID token flow (post P0 repair).

---

## Preconditions

- Backend running with valid `FIREBASE_PROJECT_ID` / `GOOGLE_APPLICATION_CREDENTIALS` and Firebase Admin able to verify tokens.
- Frontend `.env` has **all** `EXPO_PUBLIC_FIREBASE_*` fields from Firebase Console (Web app).
- Firebase Console → Authentication → Sign-in method: **Google** and **Apple** enabled for the same project.
- Google OAuth client IDs still configured (`app.json` `extra` or `EXPO_PUBLIC_GOOGLE_*`).

---

## Local manual tests

| # | Step | Expected |
|---|------|----------|
| 1 | Open login modal | Buttons visible; no crash |
| 2 | Tap Google (configured client IDs) | OAuth UI; then app returns signed in or shows readable error |
| 3 | Tap Apple (iOS only) | Apple sheet; then same |

---

## Apple login — expected result

- Successful: modal closes; Profile / API calls work; Prisma `User.firebaseId` equals Firebase Auth **uid** (opaque string).
- Failure: Alert with Firebase or network message — **not** silent success with wrong user.

---

## Google login — expected result

- Same as Apple regarding backend user and `firebaseId`.
- If `access_token` missing in OAuth response, exchange may still work with `id_token` only.

---

## Bad token — expected result

- Call any `GET /api/transactions` (or protected route) with `Authorization: Bearer not-a-real-token`.
- **Expected:** `401` JSON error (`Invalid or expired token` from `requireAuth`, or sync route error).

---

## Expired token — expected result

- (Advanced) Use an old Firebase ID token if you can capture one — **Expected:** `401` from `verifyIdToken`.

---

## Signed-out / guest — expected result

- Guest flow unchanged; unauthenticated routes behave as before.
- Protected routes without `Authorization` or with invalid token: **401** (except documented health checks).

---

## Backend sync verification

1. After successful OAuth + Firebase exchange, capture **no** raw token in logs.
2. `POST /api/auth/sync` with Firebase ID token returns `200` and `user` object with `id`, `firebaseId`, `email`.
3. Second call with same account: same `firebaseId` and stable internal `id` (upsert).

---

## Production safety checks

| Check | Pass criteria |
|-------|----------------|
| `NODE_ENV=production` on API | `dev-token` rejected (`401`) |
| Invalid Bearer token | **401**, not success |
| No `dev-bypass` user on bad token | Request does not succeed as `dev-bypass` |

---

## Dev bypass verification (`dev-token`)

- **Non-production** backend: `Authorization: Bearer dev-token` → mock Prisma user; APIs succeed for local testing.
- **Production** backend: same header → **401**.

---

## Regression — existing users

- Users who already signed in with the **same Firebase project** should get the **same** `firebaseId` (Firebase UID) and thus the same Prisma row after upsert.
- If Firebase project changed, UIDs change — expect **new** user rows (product decision).

---

## Automated

- No automated E2E in repo for OAuth; manual/device tests required for Apple/Google.
