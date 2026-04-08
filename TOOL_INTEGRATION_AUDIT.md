# Tool & Integration Audit — SmartBudgetAI

**Phase:** Integration leadership (no feature work).  
**Last updated:** 2026-04-04  
**Method:** Static repository analysis + Cursor MCP server descriptor inventory. **Live API calls to third parties were not executed** in this pass; access status for SaaS tools is **“descriptor present”** unless noted.

---

## Legend

| Status | Meaning |
|--------|--------|
| **Integrated (code)** | Imported or configured in app/backend code. |
| **Integrated (ops)** | Used in CI/CD or deployment config only. |
| **MCP only** | Available as a Cursor MCP plugin; not necessarily in app code. |
| **Not in repo** | No dependency or reference found. |
| **Unverified live** | Needs human login / token test in Cursor. |

---

## Infrastructure

### Firebase

| Item | Detail |
|------|--------|
| **Access / status** | **Integrated (code).** Backend: `firebase-admin` (`backend/src/middlewares/auth.ts`, `backend/src/routes/auth.ts`). Frontend: `firebase` listed in `frontend/package.json` but **no `import` from `firebase/` found** in `.ts`/`.tsx` — **likely unused dependency** (verify before removal). |
| **Role** | **Identity:** Verify ID tokens (`verifyIdToken`), upsert `User` by `firebaseId`. **Not** used as primary database. |
| **Code locations** | `backend/src/middlewares/requireAuth`, `POST /api/auth/sync`, Prisma `User.firebaseId`. |
| **Env** | `FIREBASE_PROJECT_ID` / `GOOGLE_CLOUD_PROJECT` / `GOOGLE_APPLICATION_CREDENTIALS` (`backend/.env.example`). |
| **Issues** | **Token contract:** Client sends Apple/Google OAuth tokens to `/api/auth/sync`; Firebase Admin expects **Firebase ID tokens**. This mismatch is a **production-risk** until verified (see `PROJECT_RISK_REGISTER.md`). |
| **Next steps** | Confirm production sign-in path (Firebase Auth client SDK vs raw OAuth). Remove or wire `firebase` npm package on frontend intentionally. |

### Clerk

| Item | Detail |
|------|--------|
| **Access / status** | **Not in repo.** No `@clerk` dependency, no Clerk env vars in examples. |
| **Role (if adopted)** | Would duplicate Firebase Auth; **not** part of current architecture. |
| **Next steps** | If product requires Clerk: explicit migration plan from Firebase-linked `firebaseId` model — **out of scope** for this phase. |

### Render

| Item | Detail |
|------|--------|
| **Access / status** | **MCP only** (`plugin-render-render` in Cursor MCP folder). **Not** in app code. Docs mention Render as a **possible** API host (`frontend/EAS_STEP_BY_STEP.md`, `EAS_BUILD_GUIDE.md`). No `render.yaml` in repo. |
| **Role** | Optional PaaS for backend; **not** locked in by code. |
| **Next steps** | If chosen: add `render.yaml` or dashboard config, env vars, health check URL. Use Render MCP for service inspection after login. |

### Sentry

| Item | Detail |
|------|--------|
| **Access / status** | **MCP only** (`plugin-sentry-sentry`). **Not** in application code (no `@sentry/*` in `package.json`). |
| **Role** | Error monitoring — **recommended** for production mobile + API; currently **not wired**. |
| **Next steps** | Add Sentry React Native + Node SDKs, DSN via env, source maps for EAS builds; use MCP for issue triage. |

---

## Data / analytics

### Prisma

| Item | Detail |
|------|--------|
| **Access / status** | **Integrated (code).** `backend/prisma/schema.prisma`, `backend/src/lib/db`, routes/services use `prisma.*`. |
| **Role** | **System of record:** users, receipts, groups, expenses, prices, medical, households, etc. |
| **Database** | PostgreSQL via `DATABASE_URL` (see `backend/.env.example`). **Do not commit secrets.** |
| **MCP** | `plugin-prisma-Prisma-Local` and `plugin-prisma-Prisma-Remote` descriptors present in Cursor. |
| **Next steps** | Keep migrations disciplined; use Prisma MCP for schema introspection in Cursor when authenticated. |

### Braintrust

| Item | Detail |
|------|--------|
| **Access / status** | **Not in repo.** No MCP folder named Braintrust in workspace inventory; no code references. |
| **Role** | Would cover evals / prompt quality if AI pipelines adopt it — **not active**. |
| **Next steps** | Defer until on-device/cloud AI eval strategy is defined. |

---

## Productivity / planning / design (SaaS + MCP)

These tools are **coordination surfaces**, not runtime app dependencies. Cursor has MCP plugins for several; **live Notion/Linear/Figma/Miro access was not verified** in this audit run.

### Notion

| **Status** | MCP: `plugin-notion-workspace-notion` present. **Not in app code.** |
| **Role** | PRD, specs, meeting notes, wiki — **single source for “why”** if maintained. |
| **Next steps** | Maintainer: connect Notion MCP in Cursor; link canonical pages from `PROJECT_CONTROL_CENTER.md`. |

### Linear

| **Status** | MCP: `plugin-linear-linear` present. **Not in app code.** |
| **Role** | Issues, sprints, bug backlog — **execution queue**. |
| **Next steps** | Connect Linear MCP; align labels with phases in `PHASE_1_EXECUTION_PLAN.md`. |

### Figma

| **Status** | MCP: `plugin-figma-figma` present. **Not in app code.** |
| **Role** | UI/UX source of truth for screens and flows. |
| **Next steps** | Map Figma frames to `frontend/app` routes in a short index (manual). |

### Miro

| **Status** | MCP: `plugin-miro-miro` present. **Not in app code.** |
| **Role** | Architecture diagrams, journey maps — **optional** visual layer. |
| **Next steps** | Use for onboarding; avoid duplicating Notion/Linear content without ownership rules. |

### Wix

| **Status** | MCP: `plugin-wix-wix-mcp` present. **Not in app code.** |
| **Role** | Marketing site / CMS — **only if** product links landing pages to app. |
| **Next steps** | If no public marketing dependency, mark Wix as **optional** and skip MCP spend. |

---

## Payments

### Stripe

| Item | Detail |
|------|--------|
| **Access / status** | **MCP only** (`plugin-stripe-stripe`). **Not** in app `package.json`. Prisma `Subscription` model is **user recurring budget items** (name/amount/frequency), **not** Stripe billing (`backend/prisma/schema.prisma`). |
| **Role** | Future monetization — **not implemented** in codebase. |
| **Next steps** | If adding billing: new tables/webhooks; separate from existing `Subscription` model or rename domain model to avoid confusion. |

---

## Code intelligence / docs (IDE)

### Sourcegraph

| **Status** | MCP: `plugin-sourcegraph-sourcegraph` present. **Not app runtime.** |
| **Role** | Cross-repo search, large-scale refactors — **engineering navigation**. |
| **Next steps** | Enable when multi-repo or code search exceeds local `rg`; authenticate in Cursor. |

### Context7

| **Status** | MCP: `plugin-context7-plugin-context7` present. **Not app runtime.** |
| **Role** | Upstream library docs / best practices inside IDE. |
| **Next steps** | Use when implementing Clerk/Firebase/Stripe/Sentry **if** official patterns needed — verify each library against current major versions in `package.json`. |

---

## Other: mobile build & CI

### Expo / EAS / GitHub Actions

| **Status** | **Integrated (ops).** `frontend/eas.json`, `frontend/.eas/workflows/*.yml`, `.github/workflows/eas-production-on-push.yml` (**manual** `workflow_dispatch`). |
| **Role** | Device builds; **not** the same as Render. |
| **Secrets** | `EXPO_TOKEN` per workflow comments. |

### Cursor IDE utilities

| **cursor-app-control** | Move workspace, create project — meta only. |
| **cursor-ide-browser** | Browser automation for web testing — use for web builds only; app is React Native. |

---

## Summary table

| Tool | In app code? | MCP in workspace? | Primary responsibility |
|------|----------------|---------------------|-------------------------|
| Firebase Admin | Yes | Yes (Firebase MCP) | Auth token verification, user id |
| Clerk | No | No | N/A (not adopted) |
| Prisma / Postgres | Yes | Yes | All domain data |
| Render | No | Yes | Optional API hosting |
| Sentry | No | Yes | Errors (recommended, not wired) |
| Stripe | No | Yes | Future payments |
| Notion / Linear / Figma / Miro / Wix | No | Yes | Product/design/process |
| Sourcegraph / Context7 | No | Yes | IDE intelligence |
| Braintrust | No | No | Evals (not adopted) |
| EAS / GitHub | Yes (CI) | N/A | Mobile builds |

---

## Blockers requiring human action

1. **Firebase vs OAuth tokens:** Validate end-to-end sign-in with real Apple/Google in a staging environment; confirm tokens are Firebase ID tokens or adjust backend verification.
2. **Each MCP SaaS:** Log in through Cursor / plugin vendor flows; **cannot** be verified without maintainer credentials.
3. **Secrets:** Ensure `backend/.env` and CI secrets are rotated if this document is shared; never paste `DATABASE_URL` or API keys into docs.
