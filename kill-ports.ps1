# Kill processes on backend (8080) and Expo/Metro (8081, 8082) so you can start fresh.
# Run from project root: .\kill-ports.ps1

$ports = @(8080, 8081, 8082)
foreach ($p in $ports) {
  $conn = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
  if ($conn) {
    $conn | ForEach-Object {
      Write-Host "Killing PID $_ on port $p"
      Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
  } else {
    Write-Host "No process on port $p"
  }
}
Write-Host "Done. Start backend: cd backend; npm run dev. Then frontend: cd frontend; npm run tunnel"
