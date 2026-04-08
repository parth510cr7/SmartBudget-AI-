# Incremental MetaGPT run against this repo (Windows PowerShell).
# Prerequisites: MetaGPT installed in `tools/metagpt/.venv_metagpt` (see README).
# Configure LLM keys via MetaGPT (e.g. config2.yaml). See:
# https://docs.deepwisdom.ai/main/en/guide/get_started/configuration.html
#
# Usage:
#   .\run_incremental.ps1 -Idea "Add export receipts to CSV in the backend"
#
param(
  [Parameter(Mandatory = $true)]
  [string] $Idea,
  [string] $ProjectPath = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [double] $Investment = 3.0,
  [int] $NRound = 5
)

$ErrorActionPreference = "Stop"
$venvMetagpt = Join-Path $PSScriptRoot ".venv_metagpt\\Scripts\\metagpt.exe"
$metagptCmd = if (Test-Path $venvMetagpt) { $venvMetagpt } else { "metagpt" }

& $metagptCmd `
  $Idea `
  --inc `
  --project-path $ProjectPath `
  --investment $Investment `
  --n-round $NRound
