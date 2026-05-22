# dev.ps1 — Launch backend (Laravel) + frontend (Next.js) for local development.
# Usage:  pwsh ./scripts/dev.ps1

$ErrorActionPreference = "Stop"

Write-Host "[ArmoryDB] Starting Laravel backend on http://127.0.0.1:8000 …" -ForegroundColor Green
Start-Process -NoNewWindow -WorkingDirectory "$PSScriptRoot\..\backend" `
  -FilePath "php" -ArgumentList "artisan","serve","--host=127.0.0.1","--port=8000"

Start-Sleep -Seconds 2

Write-Host "[ArmoryDB] Starting Next.js frontend on http://localhost:3000 …" -ForegroundColor Green
Start-Process -NoNewWindow -WorkingDirectory "$PSScriptRoot\..\frontend" `
  -FilePath "npm" -ArgumentList "run","dev"

Write-Host ""
Write-Host "Open http://localhost:3000 — login with admin / Admin@10RCDG!2025"
Write-Host "Stop both with: Get-Process php,node | Stop-Process -Force"
