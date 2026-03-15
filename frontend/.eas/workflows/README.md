# EAS Workflows

Automate EAS builds (CI/CD). Run from the **frontend** directory (Windows or any OS).

## One-time setup (do this once)

**iOS production credentials** are required before workflows can build iOS. Run this **once** in a terminal (PowerShell or CMD) — **do not** add `--non-interactive`; complete any login or prompts:

```bash
cd frontend
npx eas-cli@latest build --platform ios --profile production
```

Or from repo root:

```powershell
cd frontend; npx eas-cli@latest build --platform ios --profile production
```

Alternatively run the script: `frontend\scripts\setup-ios-production-credentials.ps1`

After this succeeds once, workflows and future `build --platform all` runs will use the stored credentials.

## Workflow files

| File | What it does |
|------|----------------|
| `create-production-builds.yml` | Builds **production** Android (AAB) and iOS in parallel for store releases. |

## Run a workflow

From the **frontend** directory:

```bash
npx eas-cli@latest workflow:run create-production-builds.yml
```

You can also run workflows from the [Expo dashboard](https://expo.dev) under your project → Workflows.

## Windows notes

- Use `cd frontend` then run all commands from there.
- Use backslashes in paths only when needed; `workflow:run create-production-builds.yml` uses the filename.
- If a command hangs, run it in an interactive terminal (e.g. PowerShell or VS Code terminal) so you can complete any auth prompts.
