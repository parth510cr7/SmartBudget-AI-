# Runtime vs IDE Boundary — SmartBudgetAI

**Last updated:** 2026-04-04  
**Purpose:** Separate **what ships in the app** from **what assists engineers in Cursor**.

---

## Definitions

| Term | Meaning |
|------|--------|
| **Runtime** | Dependencies, env vars, and services used by **Expo app** and **Express API** in dev/staging/prod. |
| **IDE-only** | Cursor MCP plugins, local CLI, docs search — **no** automatic inclusion in production binaries or API unless explicitly coded. |

---

## Matrix

| Tool | Boundary | Current role | Future role | Active scope |
|------|----------|--------------|-------------|--------------|
| **Firebase Admin + project config** | **Runtime** | Verify ID tokens; initialize from env | Same | **Keep** |
| **PostgreSQL + Prisma** | **Runtime** | All domain data | Same | **Keep** |
| **Expo / EAS / GitHub Actions** | **Runtime (ops)** | Mobile builds | Same | **Keep** |
| **Apple / Google OAuth (Expo)** | **Runtime** | Produce tokens sent to backend | Must align with Firebase token contract — see `AUTH_TRUTH_CHECK.md` | **Keep** (fix contract if needed) |
| **Clerk** | N/A | Not integrated | Only if migrating off Firebase Auth | **Remove from scope** until decided |
| **Stripe** | **Future runtime** (optional) | None in code | Billing webhooks + SDK | **Postpone** |
| **Sentry** | **Runtime (recommended)** | Not wired | Crash/error reporting | **Postpone** implementation; IDE MCP optional for triage |
| **Render** | **Runtime (optional)** | Not in repo | Host API | **Postpone** until host chosen |
| **Notion** | **IDE-only** | Specs / wiki | Same | **Keep** as process tool |
| **Linear** | **IDE-only** | Issues / backlog | Same | **Keep** |
| **Figma** | **IDE-only** | Design source | Same | **Keep** |
| **Miro** | **IDE-only** | Diagrams / workshops | Same | **Postpone** if unused |
| **Wix** | **IDE-only** (or separate web runtime) | Marketing site | Same | **Optional** — empty site list in live check |
| **Sourcegraph** | **IDE-only** | Code search at scale | Same | **Keep** when authenticated |
| **Context7** | **IDE-only** | Library docs | Same | **Keep** |
| **Firebase MCP** | **IDE-only** | Project / rules inspection | Same | **Keep** after CLI login |
| **Prisma MCP** | **IDE-only** | Migrate status / studio helpers | Same | **Keep** — does not replace `DATABASE_URL` in runtime |
| **Braintrust** | N/A | Not present | Evals | **Remove from active scope** until adopted |

---

## Overlap clarifications

1. **Firebase (runtime) vs Firebase MCP (IDE):** Same vendor; **different surfaces**. MCP does not authenticate your API users.
2. **Prisma (runtime) vs Prisma MCP (IDE):** MCP runs CLI against a **local** `projectCWD`; production DB is still whatever `DATABASE_URL` is on the **deployed** server.
3. **Stripe MCP vs Stripe SDK:** MCP is for **account operations in IDE**; app billing requires **runtime** SDK + webhooks in `backend/`.
4. **Notion vs Linear:** Notion = narrative; Linear = tasks — **no runtime duplication** if boundaries are respected.

---

## What must be runtime-integrated next (priority)

1. **Auth token correctness** — Firebase ID tokens end-to-end (see Phase 2 plan).  
2. **Observability** — Sentry (or equivalent) when ready for production traffic.  
3. **Hosting** — Document Render (or other) **only** when API deployment is fixed.

Everything else listed as IDE-only should **remain** out of the hot path unless product explicitly requires runtime integration (e.g., Stripe).
