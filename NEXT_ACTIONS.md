# Next Actions — SmartBudgetAI

**Last updated:** 2026-04-04

---

## Immediate (after this auth fix)

1. **Configure Firebase Web app** in Firebase Console; copy values into `frontend/.env` (`EXPO_PUBLIC_FIREBASE_*`).
2. **Enable** Google and Apple providers in Firebase Authentication for that project.
3. **Run** `AUTH_TEST_PLAN.md` on a real device/simulator (Apple: iOS; Google: iOS/Android).
4. **Confirm** backend `FIREBASE_PROJECT_ID` matches the Firebase project used by the app (same project as client config).

---

## P0 / P1 remaining

| Priority | Item | Notes |
|----------|------|--------|
| P0 | Staging E2E sign-in | Human — OAuth + device |
| P1 | Sentry (mobile + API) | When ready for production traffic; see `PHASE_2_FOUNDATION_PLAN.md` |
| P1 | Tighten `auth.tsx` mock email flow or document as demo-only | Optional; not OAuth |
| P2 | Deployment doc (Render vs other) + staging URL | `EXPO_PUBLIC_API_URL` |
| P2 | Remove or rename Prisma `Subscription` vs future Stripe | Naming only |

---

## Suggested order after auth is green

1. **Observability** — Sentry DSN, release tracking, source maps (EAS).  
2. **API hosting** — Single documented staging/prod URL.  
3. **Stripe** — Only when billing scope is defined (not for auth).  
4. **Cleanup** — Dependency audit, README env table.

---

## Cursor automation

- Use **Skills:** `.cursor/skills/auth-repair`, `mcp-verification`, `production-hardening`.  
- **Rules:** `.cursor/rules/eas-build-conservation.mdc` for builds.
