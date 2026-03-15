# AI Workflow – SmartBudget AI

This document describes the structured roles and how the Builder and Tester agents work together so development can resume or continue with minimal context loss.

## Roles

| Role | File | Purpose |
|------|------|--------|
| **Builder Agent** | `builder_agent_prompt.md` | Implements features, fixes bugs, writes code. Does not remove existing logic. |
| **Tester Agent** | `tester_agent_prompt.md` | Runs the app, verifies fixes and features, checks for regressions. Fills QA report. |
| **QA Report** | `qa_report_template.md` | Template for test results: build status, test cases, regressions, next steps. |

## Workflow

1. **Task selection**  
   User or agent picks the next task from `NEXT_STEPS.md` (or from the user message). Current top priority: **Search tab** (verify updates, reset, best price by store).

2. **Build / fix**  
   - **Builder Agent** reads the task and any handoff docs (`PROJECT_STATE.md`, `AGENT_HANDOFF.md`).  
   - Implements or fixes as described in `builder_agent_prompt.md`.  
   - Writes code directly to the repo; does not delete working logic.  
   - Hands off: lists modified files, how to trigger the behavior, and any limitations.

3. **Test / verify**  
   - **Tester Agent** runs the app (frontend + backend).  
   - Performs the steps from the handoff or from `NEXT_STEPS.md`.  
   - Fills `qa_report_template.md` with results.  
   - Reports pass/fail and any regressions; if something fails, provides clear steps and expected vs actual so the Builder can fix.

4. **Iterate**  
   - If tests fail, return to step 2 (Builder fixes).  
   - If tests pass, update `NEXT_STEPS.md` or `PROJECT_STATE.md` as needed and move to the next task.

## Important Constraints (Both Agents)

- Do not delete or break existing working logic.
- Do not introduce mock data for features that must use real backend data (e.g. Search tab).
- After data mutations (upload, demo seed, reset), the app must call `triggerDashboardRefresh()` so dependent tabs refetch.
- Keep documentation in sync: when a major change is made, update `PROJECT_STATE.md` or `AGENT_HANDOFF.md` so the next session can resume without extra explanation.

## Resuming Development

- Read `PROJECT_STATE.md` and `AGENT_HANDOFF.md` first.
- Start with the **exact next task** in `AGENT_HANDOFF.md` or the first item in `NEXT_STEPS.md`.
- Use this workflow so that one agent builds and the other verifies, with a clear QA report and no unintended regressions.
