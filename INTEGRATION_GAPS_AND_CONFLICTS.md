# Integration Gaps & Conflicts — SmartBudgetAI

**Last updated:** 2026-04-04  
**Scope:** Honest assessment from repository + MCP inventory. **Uncertainties** called out explicitly.

---

## 1. Missing integrations (expected but absent)

| Gap | Impact | Notes |
|-----|--------|--------|
| **Sentry (or similar) in code** | Production blind spots for crashes | Add React Native + Express instrumentation. |
| **Stripe in code** | No in-app monetization | Intentional unless product opens billing. |
| **Clerk** | N/A | Listed in stakeholder tools but **not** in codebase — not a gap if Firebase remains canonical. |
| **Braintrust** | No eval harness | Acceptable until AI quality program starts. |
| **Render (or fixed PaaS) as code** | No infra-as-code for API | Backend deploy is **process-defined**, not repo-defined. |
| **Canonical Notion/Linear/Figma links in repo** | Process fragmentation | Add URLs to `PROJECT_CONTROL_CENTER.md` when stable. |

---

## 2. Broken or unverified integrations

| Item | Evidence | Risk |
|------|----------|------|
| **Auth token type vs `verifyIdToken`** | `POST /api/auth/sync` uses Firebase Admin `verifyIdToken` on client-supplied Bearer token from Apple/Google OAuth flows (`login.tsx`). | **High** if OAuth JWTs are not Firebase ID tokens — sign-in could fail or behave differently per environment. **Requires staging verification.** |
| **Frontend `firebase` package** | In `package.json` but no imports in `.ts`/`.tsx` found. | Dead dependency or incomplete migration — **low** technical debt, **medium** if someone assumes Firebase JS SDK is in use. |
| **MCP SaaS (Notion, Linear, Figma, …)** | Descriptors exist; **no live test** in this audit. | Unknown until maintainer authenticates each plugin. |

---

## 3. Overlapping responsibilities

### 3.1 Clerk vs Firebase

- **Reality:** Only **Firebase Admin** participates in auth.
- **Overlap:** Conceptual — both are auth vendors. **No code conflict** because Clerk is absent.
- **Recommendation:** If Clerk is ever introduced, treat it as a **migration project** (new token shape, `User` keying), not a parallel integration.

### 3.2 Prisma vs Firebase

- **Split:** Firebase = identity verification; Prisma = all durable app data keyed by internal `User.id` / `firebaseId`.
- **Overlap:** None for data storage — Firebase Firestore is **not** the app DB here.
- **Risk:** Naming confusion if Firestore is added later — document “Postgres only for domain data.”

### 3.3 Notion vs Linear vs Miro

| Tool | Should own | Should not own |
|------|------------|----------------|
| **Notion** | Narrative PRD, decisions, runbooks | Sprint execution |
| **Linear** | Issues, status, cycles | Long documents |
| **Miro** | Workshops, diagrams | Issue tracking |

**Overlap risk:** Same content maintained in two places → **stale docs**. Pick **one** primary for each artifact type.

### 3.4 “Subscription” naming (Prisma vs Stripe)

- Prisma `Subscription` = **user recurring expenses** (budget domain).
- Stripe “subscriptions” = **billing**.
- **Conflict:** Semantic only — future Stripe work could confuse readers. Consider renaming domain model later (e.g. `RecurringExpense`) if Stripe ships.

### 3.5 Render vs EAS vs GitHub Actions

- **Render:** API hosting (optional).
- **EAS:** Native mobile builds.
- **GitHub Actions:** Triggers EAS workflows.
- **Overlap:** None functional — **organizational** only (different dashboards for release).

---

## 4. Risky architecture decisions (watchlist)

| Decision | Why it’s sensitive |
|----------|---------------------|
| **Dev auth bypass** (`dev-token`, non-production) | Convenient but must never leak to production config. |
| **verifyIdToken fallback** (`auth.ts` middleware catches failure and upserts `dev-bypass`) | Could mask real auth failures — understand before tightening production. |
| **Single Postgres** | All domains in one DB — good for transactions; **backup and RLS** depend on provider practices. |
| **On-device LLM (`llama.rn`)** | Native builds required — aligns with EAS conservation rule. |

---

## 5. Security & stability concerns

| Area | Concern | Mitigation direction |
|------|---------|----------------------|
| **Secrets** | `.env` in backend — ensure gitignored | Use secret manager in host; rotate if exposed. |
| **API exposure** | Backend binds `0.0.0.0` | Firewall / host networking in production. |
| **Observability** | No Sentry in code | Add before scaling users. |
| **Payments (future)** | Stripe webhooks must verify signatures | Standard Stripe middleware patterns. |

---

## 6. What should be simplified

1. **Clarify auth path** — One documented flow: Firebase ID token end-to-end **or** documented exchange step.
2. **Remove or use `firebase` frontend package** — Reduce confusion.
3. **Pick one deployment story for the API** — Document “Render vs X” in README when chosen.
4. **Process tools** — Notion + Linear only; demote Miro/Wix until there is a concrete deliverable.

---

## 7. Uncertainties (do not assume resolved)

- [ ] Production Apple/Google sign-in succeeds against current backend.
- [ ] Each Cursor MCP plugin is logged in and scoped to correct org/workspace.
- [ ] Whether a marketing Wix site exists and links to the app.
