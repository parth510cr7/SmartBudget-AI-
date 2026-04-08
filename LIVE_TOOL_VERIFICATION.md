# Live Tool Verification — Phase 1.5

**Last updated:** 2026-04-04  
**Method:** Smallest safe read-only checks via MCP where applicable; repository facts otherwise. **No production objects created.**

---

## Legend

| Status | Meaning |
|--------|--------|
| **Verified OK** | Tool responded successfully to a read-only call. |
| **Installed, blocked** | MCP/server present; call failed due to auth or missing login. |
| **Installed, degraded** | Tool ran but dependency failed (e.g. DB URL). |
| **Not in workspace** | No MCP descriptor for this Cursor project. |
| **Skipped** | Only `mcp_auth` (or equivalent) exposed; no read-only probe without OAuth flow. |

---

## Per-tool results

### Firebase (MCP: `plugin-firebase-firebase`)

| Field | Value |
|-------|--------|
| **Validation status** | **Installed, blocked** |
| **How checked** | `call_mcp_tool` → `firebase_list_projects` with small `page_size`. |
| **Result** | Error: user **not logged into Firebase CLI**; suggests `firebase_login` or Application Default Credentials. |
| **Access / auth** | Not authenticated for Firebase MCP in this environment. |
| **Usable now** | **Blocked** until maintainer runs Firebase login / ADC. |
| **Blocker** | Local Firebase CLI session or ADC not configured for the MCP process. |

---

### Prisma (MCP: `plugin-prisma-Prisma-Local`)

| Field | Value |
|-------|--------|
| **Validation status** | **Installed, degraded** (MCP works; datasource failed) |
| **How checked** | `migrate-status` with `projectCWD` = repo `backend` path. |
| **Result** | Prisma CLI ran; PostgreSQL returned **FATAL: Tenant or user not found** (connection/auth to configured host rejected). |
| **Access / auth** | MCP invoked successfully; failure is **database credentials / URL / provider account**, not “MCP logged out.” |
| **Usable now** | **Partially** — fix `DATABASE_URL` (or provider user) for this machine; then re-run. |
| **Blocker** | Valid DB role/password for the configured Postgres instance (maintainer action; do not commit secrets). |

**Runtime note:** Prisma is fully integrated in code regardless of this MCP check.

---

### Stripe (MCP: `plugin-stripe-stripe`)

| Field | Value |
|-------|--------|
| **Validation status** | **Skipped** (auth-gated surface) |
| **How checked** | Tool directory contains **`mcp_auth.json` only** — no token-safe list operation invoked. |
| **Access / auth** | Unknown until Stripe MCP OAuth completes in Cursor. |
| **Usable now** | **Blocked** for API operations until authenticated. |
| **Blocker** | Complete Stripe MCP authentication in Cursor settings. |

---

### Figma (MCP: `plugin-figma-figma`)

| Field | Value |
|-------|--------|
| **Validation status** | **Skipped** |
| **How checked** | Tools folder contains **`mcp_auth.json` only**. |
| **Access / auth** | Unknown. |
| **Usable now** | **Blocked** until Figma MCP auth. |
| **Blocker** | Figma OAuth / token in Cursor. |

---

### Linear (MCP: `plugin-linear-linear`)

| Field | Value |
|-------|--------|
| **Validation status** | **Skipped** |
| **How checked** | **`mcp_auth.json` only** in tools folder. |
| **Access / auth** | Unknown. |
| **Usable now** | **Blocked** until Linear MCP auth. |
| **Blocker** | Linear API auth in Cursor. |

---

### Notion (MCP: `plugin-notion-workspace-notion`)

| Field | Value |
|-------|--------|
| **Validation status** | **Skipped** |
| **How checked** | **`mcp_auth.json` only**. |
| **Access / auth** | Unknown. |
| **Usable now** | **Blocked** until Notion MCP auth. |
| **Blocker** | Notion integration token / OAuth in Cursor. |

---

### Sentry (MCP: `plugin-sentry-sentry`)

| Field | Value |
|-------|--------|
| **Validation status** | **Skipped** |
| **How checked** | **`mcp_auth.json` only**. |
| **Access / auth** | Unknown. |
| **Usable now** | **Blocked** until Sentry MCP auth. |
| **Blocker** | Sentry auth in Cursor. |

---

### Render (MCP: `plugin-render-render`)

| Field | Value |
|-------|--------|
| **Validation status** | **Installed, blocked** |
| **How checked** | `list_workspaces` (read-only, no args). |
| **Result** | **`unauthorized`**. |
| **Access / auth** | Not authorized for Render API from this MCP session. |
| **Usable now** | **Blocked**. |
| **Blocker** | Render API key / workspace linkage per Render MCP docs. |

---

### Sourcegraph (MCP: `plugin-sourcegraph-sourcegraph`)

| Field | Value |
|-------|--------|
| **Validation status** | **Skipped** |
| **How checked** | **`mcp_auth.json` only** in tools folder. |
| **Access / auth** | Unknown. |
| **Usable now** | **Blocked** until Sourcegraph MCP auth. |
| **Blocker** | Sourcegraph instance URL + token in Cursor. |

---

### Context7 (MCP: `plugin-context7-plugin-context7`)

| Field | Value |
|-------|--------|
| **Validation status** | **Verified OK** |
| **How checked** | `resolve-library-id` for `firebase-admin`; optional `query-docs` for `verifyIdToken` behavior. |
| **Result** | Library IDs and documentation returned successfully. |
| **Access / auth** | Authenticated / public API path working from this environment. |
| **Usable now** | **Yes** — for library docs lookup. |

---

### Miro (MCP: `plugin-miro-miro`)

| Field | Value |
|-------|--------|
| **Validation status** | **Skipped** |
| **How checked** | **`mcp_auth.json` only**. |
| **Access / auth** | Unknown. |
| **Usable now** | **Blocked** until Miro MCP auth. |
| **Blocker** | Miro OAuth in Cursor. |

---

### Wix (MCP: `plugin-wix-wix-mcp`)

| Field | Value |
|-------|--------|
| **Validation status** | **Verified OK** (empty data) |
| **How checked** | `ListWixSites` with no filter. |
| **Result** | **`[]`** (empty array) — call succeeded; no sites returned or none match. |
| **Access / auth** | MCP path accepted the request (not an auth error in this response). |
| **Usable now** | **Yes** for listing; marketing relevance still **optional** per audit. |

---

### Braintrust

| Field | Value |
|-------|--------|
| **Validation status** | **Not in workspace** |
| **How checked** | Grep under `mcps/` for `braintrust` — **no matches**; no MCP folder. |
| **Usable now** | N/A — not available as Cursor MCP in this project inventory. |

---

### Clerk

| Field | Value |
|-------|--------|
| **Validation status** | **Not in workspace** |
| **How checked** | No Clerk MCP folder; repo has no `@clerk` dependency (per prior audit). |
| **Usable now** | N/A — not part of stack unless added later. |

---

## Summary

| Tool | Outcome this session |
|------|----------------------|
| Context7 | OK |
| Wix | OK (empty sites) |
| Prisma MCP | Ran; DB connection failed |
| Firebase MCP | Blocked — CLI not logged in |
| Render MCP | Blocked — unauthorized |
| Stripe, Figma, Linear, Notion, Sentry, Miro, Sourcegraph | Auth-only tool list — not probed |
| Braintrust, Clerk | No MCP / not applicable |

**Maintainer follow-up:** Complete OAuth/API keys for Firebase, Render, Linear, Notion, Figma, Sentry, Stripe, Miro, Sourcegraph as needed; fix Postgres credentials for Prisma MCP and local `migrate status`.
