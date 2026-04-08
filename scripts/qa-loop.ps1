Param(
  [string]$ApiBase = $env:API_BASE,
  [string]$FirebaseIdToken = $env:FIREBASE_ID_TOKEN,
  [int]$MaxIterations = 50
)

if (-not $ApiBase -or $ApiBase.Trim() -eq "") {
  $ApiBase = "http://localhost:8080"
}

$env:API_BASE = $ApiBase
if ($FirebaseIdToken -and $FirebaseIdToken.Trim() -ne "") {
  $env:FIREBASE_ID_TOKEN = $FirebaseIdToken
}

Write-Output "QA LOOP"
Write-Output "API_BASE=$($env:API_BASE)"
if ($env:FIREBASE_ID_TOKEN) { Write-Output "FIREBASE_ID_TOKEN=set" } else { Write-Output "FIREBASE_ID_TOKEN=not set (health-only smoke)" }
Write-Output ""

for ($i = 1; $i -le $MaxIterations; $i++) {
  Write-Output "=== Iteration $i/$MaxIterations ==="

  $backendOk = $true
  $smokeOk = $true

  Write-Output ""
  Write-Output "Running backend unit tests…"
  npm --prefix backend test
  if ($LASTEXITCODE -ne 0) { $backendOk = $false }

  Write-Output ""
  Write-Output "Running API smoke tests…"
  npm run -s qa:smoke
  if ($LASTEXITCODE -ne 0) { $smokeOk = $false }

  Write-Output ""
  if ($backendOk -and $smokeOk) {
    Write-Output "✅ QA PASS"
    exit 0
  }

  Write-Output "❌ QA FAIL"
  Write-Output "Waiting for fixes… (re-run will happen automatically)"
  Start-Sleep -Seconds 3
}

Write-Output "❌ QA still failing after $MaxIterations iterations"
exit 1

