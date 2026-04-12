# graphify (knowledge graph) — SmartBudgetAI

[graphify](https://github.com/safishamsi/graphify) builds a **queryable knowledge graph** from this repo (code AST + optional docs). It is a **developer-only** tool: it does not ship in the Expo app.

## Why we use it

- **Lower token use:** Agents read `graphify-out/GRAPH_REPORT.md` (summary: “god nodes”, communities, key links) **before** spraying wide `grep` / full-tree reads.
- **Faster navigation:** Architecture questions map to structure, not keyword luck.

## One-time setup (this machine)

Requires **Python 3.10+**.

```bash
pip install graphifyy
```

Install the **Cursor** rule into this repo (already committed as `.cursor/rules/graphify.mdc`; re-run after upstream graphify upgrades):

```bash
python -m graphify cursor install
```

## Build / refresh the graph

In **Cursor** chat, from the repo root:

```text
/graphify .
```

That produces (ignored by git, stays local):

- `graphify-out/GRAPH_REPORT.md` — **read this first** for broad questions
- `graphify-out/graph.html` — interactive view
- `graphify-out/graph.json` — for `graphify query "..."` CLI

Re-run after **large refactors** or when onboarding new areas.

## Focused queries (CLI)

After a graph exists:

```bash
graphify query "your question" --graph graphify-out/graph.json --budget 1500
```

Use smaller `--budget` for tighter prompts.

## Repo-specific exclusions

Corpus exclusions live in **`.graphifyignore`** at the repo root (e.g. `node_modules/`, build artifacts).

## Official package name

PyPI: **`graphifyy`** (two y’s). The CLI command is still `graphify`.
