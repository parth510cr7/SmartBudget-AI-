# Phase 1 — Integration & Setup Execution Plan

**Goal:** Finish integration validation, remove ambiguity, **no broad feature rewrites.**  
**Last updated:** 2026-04-04

---

## Principles

1. **Verify before refactor** — Especially auth and tokens.
2. **Minimal code changes** — Only when fixing a confirmed gap (e.g., remove unused dep).
3. **Manual gates** — Secrets, MCP login, Stripe/Render dashboards require the maintainer.

---

## Ordered tasks

### Tier A — Must complete before confident shipping

| # | Task | Automated by agent? | Manual / human |
|---|------|---------------------|----------------|
| A1 | **Staging auth test:** Apple + Google sign-in → `/api/auth/sync` → authenticated API call | Can draft checklist | **You:** run on device/simulator with staging backend + real Firebase project |
| A2 | **Resolve token model:** Confirm Bearer tokens are Firebase ID tokens; if not, design exchange or change verification | Can outline options | **You + EM:** decision |
| A3 | **Document API deployment:** Chosen host, env var list, health URL | Can template | **You:** fill hostnames |
| A4 | **Secrets hygiene:** Confirm `.env` gitignored; no secrets in docs | Grep / lint | **You:** rotate if ever leaked |

### Tier B — Tooling & observability

| # | Task | Automated? | Manual |
|---|------|------------|--------|
| B1 | **Sentry:** Add SDKs + env DSN (mobile + backend) | Can implement small PR | **You:** create Sentry project, DSN, auth release |
| B2 | **Linear:** Link project; create labels matching phases | No | **You:** MCP login |
| B3 | **Notion:** Link canonical PRD / control doc | No | **You:** paste URLs into `PROJECT_CONTROL_CENTER.md` |
| B4 | **Figma:** Map key screens → routes | No | **You / design** |

### Tier C — MCP operationalization

| # | Task | Automated? | Manual |
|---|------|------------|--------|
| C1 | Log into **Firebase, Notion, Linear, Figma, Sentry, Render, Stripe, Sourcegraph, Context7, Miro, Wix** MCPs in Cursor (as needed) | No | **You:** OAuth per vendor |
| C2 | Drop unused MCPs from Cursor to reduce noise | No | **You:** disable plugins not in use |

### Tier D — Codebase cleanup (small, reversible)

| # | Task | Automated? | Manual |
|---|------|------------|--------|
| D1 | Audit `firebase` npm usage on frontend; remove if truly unused | Agent can PR | Review |
| D2 | Rename Prisma `Subscription` model (long-term) | Defer | Product approval |

### Tier E — Payments (only when product asks)

| # | Task | Notes |
|---|------|--------|
| E1 | Stripe Connect vs simple Checkout — decision doc in Notion | Not started |
| E2 | Webhook route + idempotency | Standard pattern |

---

## What the agent can automate safely

- Repository grep / inventory (done in control docs).
- Adding Sentry boilerplate **after** DSN provided.
- PR to remove unused dependencies **after** CI passes locally.
- Updating markdown links when URLs are supplied.

---

## What requires you (maintainer)

- All **OAuth logins** for MCP and cloud consoles.
- **Firebase** project settings, Apple/Google OAuth client IDs in Expo.
- **Database** provider dashboard (Supabase or other).
- **EAS** credentials and device testing.
- **Business** decisions: Clerk vs Firebase, Stripe scope, Render vs alternative.

---

## Recommended next step after Phase 1 completes

1. **Short “auth hardening” sprint** — Token model verified, production `NODE_ENV`, no accidental dev bypass.
2. **Observability sprint** — Sentry + structured logging.
3. **Feature execution phase** — Use Linear backlog; follow `PROJECT_CONTROL_CENTER.md` ownership rules.

---

## Exit criteria for Phase 1

- [ ] Auth behavior verified in staging (A1–A2).
- [ ] Control docs accepted as team baseline (`TOOL_INTEGRATION_AUDIT.md`, etc.).
- [ ] Sentry scoped (B1) or explicitly deferred with date.
- [ ] MCP tools either connected or consciously disabled (C1–C2).
