# Project Control Center — SmartBudgetAI

**Purpose:** Single coordination layer for engineering, product, design, and delivery.  
**Last updated:** 2026-04-04

---

## 1. Architecture summary

| Layer | Technology | Notes |
|-------|------------|--------|
| **Mobile client** | Expo 54, React Native, Expo Router (`frontend/`) | Native modules (camera, OCR, `llama.rn`) for device builds; JS-only testing in Expo Go for many flows. |
| **API** | Node, Express 5 (`backend/src/index.ts`) | REST under `/api/*`; `/health` unauthenticated. |
| **Auth** | Firebase Admin verifies Bearer tokens; Prisma stores `User` keyed by `firebaseId` | Dev bypass: `dev-token` non-production (`middlewares/auth.ts`). |
| **Data** | PostgreSQL + Prisma | Single source of truth for receipts, groups, insights data, etc. |
| **Realtime** | Socket.io present; group UX may use polling per product docs | Confirm active path per feature. |
| **Mobile release** | EAS + GitHub Actions (manual workflow) | Build conservation policy in `.cursor/rules/eas-build-conservation.mdc`. |

**Explicit non-goals for this document:** Clerk is **not** part of the stack unless product decides to migrate. **Braintrust** is not integrated.

---

## 2. Tool responsibility matrix

| Domain | Owner tool / system | What it must NOT own |
|--------|---------------------|----------------------|
| **Identity** | Firebase Admin (backend) | Business data (delegated to Prisma). |
| **Application data** | Prisma / PostgreSQL | Auth credentials (Firebase). |
| **Errors / crashes (target)** | Sentry (recommended, not wired) | Feature flags or analytics alone. |
| **Payments (future)** | Stripe + backend webhooks | Not the Prisma `Subscription` budget model without renaming/clarifying. |
| **API hosting (optional)** | Render, Railway, Fly, etc. | Mobile binary builds (that is EAS). |
| **Work tracking** | Linear | Long-form specs (use Notion). |
| **Specs & wiki** | Notion | Executable issues (use Linear). |
| **UI truth** | Figma | Implementation details (use repo). |
| **Diagrams / workshops** | Miro | Single source of PRD (Notion wins). |
| **Marketing site** | Wix (if used) | In-app navigation (Expo Router). |
| **Repo search / docs in IDE** | Sourcegraph, Context7 | Production runtime. |

---

## 3. Product workflow ownership

| Activity | Where it lives | Owner |
|----------|----------------|--------|
| Vision, roadmap themes | Notion | Product lead |
| Prioritized backlog & sprints | Linear | Product + EM |
| UX flows & visual design | Figma | Design |
| User research / journey | Miro or Notion | Product |
| Go-to-market / landing | Wix (if applicable) | Marketing / product |

**Rule:** Every Linear issue should link to **either** a Notion spec **or** a Figma frame reference — not both duplicated in full.

---

## 4. Engineering workflow ownership

| Activity | Where it lives | Owner |
|----------|----------------|--------|
| Implementation | `frontend/`, `backend/` | Engineering |
| Schema changes | `backend/prisma`, migrations | Engineering |
| Code search (large scope) | Sourcegraph MCP | Engineering |
| Library usage patterns | Context7 MCP | Engineering |
| CI / EAS builds | `.github/workflows`, `frontend/eas.json` | Engineering |
| Staging/prod API deploy | Render or alternative | Engineering + DevOps |

**Rule:** No production schema change without migration + rollback note in PR description.

---

## 5. Design workflow ownership

| Activity | Where it lives | Owner |
|----------|----------------|--------|
| Screen designs & components | Figma | Design |
| Implementation parity | PR review vs Figma | Design + EM |
| Experimental UI | Branch / draft PR | Engineering |

**Rule:** Figma is **prescriptive** for spacing and hierarchy; NativeWind/Tailwind in repo is **canonical** for what actually ships.

---

## 6. Deployment & debugging ownership

| Concern | Channel |
|---------|---------|
| **Mobile binary** | EAS (manual workflow), TestFlight / Play Internal |
| **Backend** | Host’s dashboard (e.g. Render), env vars, logs |
| **API health** | `GET /health`, host metrics |
| **Client errors (target)** | Sentry (once integrated) |
| **Database** | Prisma migrate, provider (e.g. Supabase) dashboard — **no secrets in chat/logs** |

**Rule:** One **staging** environment mirrors production auth and DB shape before iOS build quota is spent on native tests.

---

## 7. Recommended operating model

1. **Single DRI per phase** — Named owner for “integration phase” vs “feature phase” (can be same person).
2. **Linear as execution queue** — Tickets small enough for one PR; link repo paths in ticket.
3. **Notion as narrative** — Why and constraints; link to `docs/` or control docs when stable.
4. **MCP with discipline** — Use `AGENT_AND_PLUGIN_BRIEF.md` so agents do not burn tokens on redundant searches.
5. **Auth and money are gated** — No Stripe or auth provider swap without a written decision in Notion + risk register update.
6. **Build conservation** — iOS EAS builds only for native milestones (per workspace rule).

---

## 8. Related documents

| File | Use |
|------|-----|
| `TOOL_INTEGRATION_AUDIT.md` | Per-tool status |
| `INTEGRATION_GAPS_AND_CONFLICTS.md` | Overlaps and risks |
| `PHASE_1_EXECUTION_PLAN.md` | Ordered next tasks |
| `PROJECT_RISK_REGISTER.md` | Auth, data, deploy risks |
| `AGENT_AND_PLUGIN_BRIEF.md` | Token-efficient agent rules |
