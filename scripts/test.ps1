$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
foreach ($line in Get-Content -LiteralPath '.env') {
    if ($line -match '^([A-Z0-9_]+)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process') }
}
docker compose up -d --wait postgres
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL startup failed' }
$dbPort = if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { '55432' }
$env:FLOWFORGE_TEST_DATABASE_URL = "postgres://flowforge:$($env:POSTGRES_PASSWORD)@localhost:$dbPort/flowforge?sslmode=disable"
$env:GOWORK = 'off'
go test -count=1 ./...
if ($LASTEXITCODE -ne 0) { throw 'Go tests failed' }
go vet ./...
if ($LASTEXITCODE -ne 0) { throw 'Go vet failed' }
Push-Location web
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
} finally { Pop-Location }
