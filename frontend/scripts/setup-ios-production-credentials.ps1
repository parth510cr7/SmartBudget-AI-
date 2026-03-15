# One-time: set up iOS production credentials for EAS (required for workflows).
# Run this in PowerShell from the repo root or frontend folder. Do not use -NonInteractive.
# After this succeeds once, "workflow:run create-production-builds.yml" will work.

Set-Location $PSScriptRoot\..
npx eas-cli@latest build --platform ios --profile production
