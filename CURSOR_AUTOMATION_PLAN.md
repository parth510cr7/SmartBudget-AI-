# Cursor Automation Plan — SmartBudgetAI

**Last updated:** 2026-04-04  
**Purpose:** Map **Rules**, **Skills**, and **MCPs** to their roles so agents do not conflate them.

---

## 1. Current project rules (`.cursor/rules/`)


| File                         | Scope                                          | Always-on |
| ---------------------------- | ---------------------------------------------- | --------- |
| `eas-build-conservation.mdc` | iOS EAS build quota; Expo Go vs native testing | Yes       |


**Gap (optional):** A dedicated `auth-and-api.mdc` could restate “Firebase ID tokens only” and “no secrets in logs” — **not created** in this pass to avoid rule sprawl; canonical truth lives in `AUTH_TRUTH_CHECK.md` / `AUTH_REPAIR_PLAN.md`.

---

## 2. Current project Skills (`.cursor/skills/`)


| Skill                | Path                                           |
| -------------------- | ---------------------------------------------- |
| auth-repair          | `.cursor/skills/auth-repair/SKILL.md`          |
| mcp-verification     | `.cursor/skills/mcp-verification/SKILL.md`     |
| production-hardening | `.cursor/skills/production-hardening/SKILL.md` |


**User-global Skills** (outside repo, e.g. `~/.cursor/skills-cursor/`) exist on the machine but are **not** repo-specific; this plan focuses on **project** Skills.

---

## 3. Skills intentionally not duplicated as separate files


| Topic                       | Canonical doc                                |
| --------------------------- | -------------------------------------------- |
| Runtime vs IDE              | `RUNTIME_VS_IDE_BOUNDARY.md`                 |
| Firebase ↔ Prisma user sync | `AUTH_TRUTH_CHECK.md`, `AUTH_REPAIR_PLAN.md` |


Add dedicated Skills later only if the team repeats these weekly.

---

## 4. MCP usage boundaries


| Use MCP when                                               | Do not use MCP when                |
| ---------------------------------------------------------- | ---------------------------------- |
| Need **official** library behavior (Context7)              | Repo answer is in `rg` / one file  |
| Firebase **project** state (after CLI login)               | Replacing `grep` for **this** repo |
| Render/Sentry/Stripe **dashboard** operations (after auth) | Choosing SQL schema from MCP alone |
| Notion/Linear **issue/spec** truth (after auth)            | Duplicating PRD in chat            |


**Blockers:** If MCP returns `unauthorized` or “log in,” stop and assign **human** OAuth — see `LIVE_TOOL_VERIFICATION.md`.

---

## 5. Recommended Skill creation order (future)

1. **release-checklist** — After Sentry + staging URL are real.
2. **eas-submit** — When TestFlight pipeline stabilizes.
3. **schema-migration** — If Prisma migrations become frequent.

---

## 6. Rules vs Skills vs MCPs (one line each)

- **Rules:** Always-on constraints for *this* repo (build conservation).  
- **Skills:** Repeatable *procedural* steps with pointers to canonical docs.  
- **MCPs:** Live external systems; **optional**; auth may block.