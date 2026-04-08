# Agent & Plugin Brief — Token-Efficient Execution

**Audience:** Cursor agents, plugins, and humans orchestrating them.  
**Goal:** Do the job with **minimal context**, **no duplicate discovery**, **no broad refactors** unless explicitly requested.

---

## Read first (in order)

1. `PROJECT_CONTROL_CENTER.md` — who owns what.
2. `TOOL_INTEGRATION_AUDIT.md` — what is actually in the repo vs MCP-only.
3. `INTEGRATION_GAPS_AND_CONFLICTS.md` — known traps (especially **auth tokens**).
4. **Phase 1.5 (live verification):** `LIVE_TOOL_VERIFICATION.md`, `RUNTIME_VS_IDE_BOUNDARY.md`, `AUTH_TRUTH_CHECK.md`, `PHASE_2_FOUNDATION_PLAN.md`.
5. **Auth changes:** `AUTH_REPAIR_PLAN.md`, `AUTH_TEST_PLAN.md`, Skill `.cursor/skills/auth-repair/SKILL.md`.
6. Task-specific file only — e.g. one route, one screen.

**Do not** re-audit the whole repo if these docs exist and are recent.

---

## Hard rules

| Rule | Why |
|------|-----|
| **No broad feature rewrites** in integration phase | User directive |
| **No secrets in output** | Never echo `.env`, API keys, `DATABASE_URL` |
| **Prefer `rg`/grep over “explore everything”** | Saves tokens |
| **One MCP per intent** | e.g. Context7 for library docs; don’t chain duplicate searches |
| **Clerk / Braintrust** | Not in codebase — don’t assume they’re wired |
| **Firebase** | Backend `firebase-admin`; frontend uses **Firebase JS Auth** (`frontend/src/auth/*`) + `firebase` package — see `AUTH_REPAIR_PLAN.md` |
| **Stripe** | Not in app code; Prisma `Subscription` ≠ Stripe |
| **iOS builds** | Follow `.cursor/rules/eas-build-conservation.mdc` — don’t suggest EAS for JS-only tasks |

---

## When to use which tool

| Need | Use | Don’t use |
|------|-----|-----------|
| Find symbol / usage | Local grep, IDE search | Full-repo semantic scan first |
| Library API / best practice | Context7 MCP | Random blog posts |
| Cross-repo / huge search | Sourcegraph MCP | Blind grep across clones |
| Issues / priorities | Linear MCP | Notion for bug status |
| Long spec / decision | Notion MCP | Linear description for essays |
| Errors in prod (once wired) | Sentry MCP | Guess from logs only |
| Infra status | Render MCP | Assumptions about URLs |
| Firebase project config | Firebase MCP | Manual console only when MCP insufficient |

---

## Task starter template (paste into agent)

```
Role: Follow AGENT_AND_PLUGIN_BRIEF.md and PROJECT_CONTROL_CENTER.md.
Scope: [single file or ticket ID].
Out of scope: refactors outside [paths], new features.
Deliverable: [PR / answer / checklist].
If blocked: cite TOOL_INTEGRATION_AUDIT.md section and stop.
```

---

## Stop conditions (don’t burn tokens)

- **Same search twice** — stop; widen hypothesis or ask human.
- **MCP auth error** — stop; human must log in — don’t retry 10x.
- **Auth/sign-in “fix”** without staging repro — stop; see `PROJECT_RISK_REGISTER.md` A-1.

---

## One-line summary for plugins

> **SmartBudgetAI = Expo + Express + Prisma Postgres + Firebase Admin auth; MCPs are IDE-side; Notion/Linear/Figma coordinate work; Sentry/Stripe not wired in code yet.**
