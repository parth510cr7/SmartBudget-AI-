## MetaGPT (DeepWisdom) for SmartBudgetAI

This folder sets up **MetaGPT** as a **dev-time** tool to generate/iterate on code in this repo (it is **not** bundled into the Expo app).

### Why installation failed on this machine

Your environment is using **Python 3.14**, and MetaGPT depends on `faiss-cpu==1.7.4`, which currently has **no matching distribution** for **Windows + Python 3.14**.

### What you need to install

- Install **Python 3.11.x** (recommended) or **Python 3.10.x** for Windows.

After installing, make sure you can run:

```powershell
py -3.11 --version
```

### Install MetaGPT (with Python 3.11)

From the repo root:

```powershell
cd tools\metagpt
py -3.11 -m venv .venv_metagpt
.\.venv_metagpt\Scripts\Activate.ps1
python -m pip install --upgrade pip
# Install minimal deps (faster, avoids optional providers)
pip install -r requirements-min.txt
# Install MetaGPT itself
pip install metagpt==0.8.2 --no-deps
# Typer 0.9 + newer Click can break CLI parsing; pin click
pip install --force-reinstall click==8.1.7
metagpt --help
```

### Configure LLM provider (required)

MetaGPT needs an LLM API configuration (OpenAI/Azure/Anthropic/etc). See:

`https://docs.deepwisdom.ai/main/en/guide/get_started/configuration.html`

### Run against this repo (incremental mode)

With the venv activated:

```powershell
.\run_incremental.ps1 -Idea "Add a new backend endpoint to ..."
```

