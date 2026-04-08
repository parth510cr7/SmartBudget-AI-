# Project Risk Register — SmartBudgetAI

**Last updated:** 2026-04-04  
**Review cadence:** Monthly or before major release.

---

## 1. Auth risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| A-1 | Bearer tokens from Apple/Google may not match what Firebase Admin `verifyIdToken` expects | Uncertain | **High** — auth fails or wrong behavior | Staging E2E test; align client with Firebase Auth `getIdToken()` if needed |
| A-2 | `dev-token` / non-prod bypass accidentally enabled in production | Low | **Critical** | Enforce `NODE_ENV=production` in prod; infra checks |
| A-3 | `verifyIdToken` failure path falls through to `dev-bypass` user (`middlewares/auth.ts`) | Uncertain | **High** — could hide misconfiguration | Tighten for production; log alerts |
| A-4 | Clerk considered alongside Firebase without migration plan | Low | **Medium** — duplicate identity models | Decision doc; single auth vendor |

---

## 2. Payment risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| P-1 | Stripe not implemented; future rush job without webhooks | Medium | **High** — billing errors | Phase Stripe behind design review; idempotent webhooks |
| P-2 | Name collision between Prisma `Subscription` and Stripe subscriptions | Medium | **Medium** — dev confusion | Rename domain model or namespace |

---

## 3. Data risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| D-1 | Single Postgres holds all PII | N/A | **High** if breached | Provider backups, encryption at rest, access control |
| D-2 | `DATABASE_URL` or keys in chat/commits | Medium | **Critical** | Secret scanning; rotate if exposed |
| D-3 | Prisma migration errors in production | Low | **High** | Staging migrations; backward-compatible deploys |

---

## 4. Deployment risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| DP-1 | Backend host not documented; ad-hoc deploy | Medium | **Medium** | Document in README; IaC optional |
| DP-2 | EAS iOS build quota / cost | Medium | **Low**–**Medium** | Manual workflows only; native milestones |
| DP-3 | Client `EXPO_PUBLIC_API_URL` wrong for environment | Medium | **Medium** | Env-specific builds; health check on launch |

---

## 5. Observability & debugging risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| O-1 | No Sentry → blind to production crashes | **Current** | **High** | Add Sentry (see Phase 1 plan) |
| O-2 | Logs contain PII | Medium | **High** | Log redaction policies |
| O-3 | MCP-dependent debugging without logged-in tools | Medium | **Low** | Keep local `rg`/tests as fallback |

---

## 6. Product & design alignment risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| PD-1 | Figma and shipped UI drift | Medium | **Medium** | Design review on PRs for UI |
| PD-2 | Notion/Linear backlog out of sync with repo | Medium | **Medium** | Weekly triage; issue links to paths |
| PD-3 | Multiple diagram sources (Miro + Notion) | Low | **Low** | Ownership in `PROJECT_CONTROL_CENTER.md` |

---

## 7. Risk acceptance

| Risk | Accepted? | Owner | Until when |
|------|-------------|-------|------------|
| No Sentry | **Yes (temporary)** | EM | Until B1 in Phase 1 plan |
| Raw OAuth → Firebase verify ambiguity | **No** — must resolve | EM | Before prod scale |

---

## 8. Change log

| Date | Change |
|------|--------|
| 2026-04-04 | Initial register from integration audit |
