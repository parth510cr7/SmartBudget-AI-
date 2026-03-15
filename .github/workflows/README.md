# GitHub Actions → EAS

## What’s automated

**Workflow:** `eas-production-on-push.yml`  
**Trigger:** Every push to `main` or `master`  
**Action:** Runs your EAS production workflow (Android + iOS builds) so the latest code is built on EAS.

So: push your changes to `main` → GitHub Action runs → EAS gets your project and starts the two production builds. No need to run `workflow:run` by hand.

## One-time setup

### 1. Put the repo on GitHub

If the project isn’t on GitHub yet:

- Create a new repo on GitHub (e.g. `SmartBudgetAI`).
- In your project folder (SmartBudgetAI), run:
  ```bash
  git init
  git add .
  git commit -m "Initial commit"
  git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
  git branch -M main
  git push -u origin main
  ```

### 2. Add `EXPO_TOKEN` secret

- On GitHub: open your repo → **Settings** → **Secrets and variables** → **Actions**.
- Click **New repository secret**.
- **Name:** `EXPO_TOKEN`
- **Value:** Create a token at [expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens) (Expo account → Access tokens → Create). Paste it here.

After this, every push to `main` will trigger the EAS production workflow. You don’t need to wait for any build to finish to set this up.

---

**Quick test:** On GitHub go to **Actions** → **EAS Production Build on Push** → **Run workflow** → **Run workflow**. That triggers the workflow once with the latest code on the default branch (no push needed).

*Last test push: EAS automation*
