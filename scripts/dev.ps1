param([switch]$Docker)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path -LiteralPath '.env')) {
    $dbPassword = [Guid]::NewGuid().ToString('N')
    $apiToken = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
    @("POSTGRES_PASSWORD=$dbPassword", "FLOWFORGE_API_TOKEN=$apiToken", 'FLOWFORGE_PUBLIC_URL=http://localhost:8088', 'FLOWFORGE_DEMO=true') | Set-Content -LiteralPath '.env' -Encoding utf8
}
foreach ($line in Get-Content -LiteralPath '.env') {
    if ($line -match '^([A-Z0-9_]+)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process') }
}
if ($Docker) {
    docker compose --profile app up --build -d
    if ($LASTEXITCODE -ne 0) { throw 'Docker deployment failed' }
    Write-Host 'Open http://localhost:8088 ; the console token is stored in .env as FLOWFORGE_API_TOKEN'
    exit
}
docker compose up -d --wait postgres
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL startup failed' }
$dbPort = if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { '55432' }
$env:FLOWFORGE_DATABASE_URL = "postgres://flowforge:$($env:POSTGRES_PASSWORD)@localhost:$dbPort/flowforge?sslmode=disable"
$env:GOWORK = 'off'
Push-Location web
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency install failed' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
} finally { Pop-Location }
Write-Host 'Open http://localhost:8088 ; the console token is stored in .env as FLOWFORGE_API_TOKEN'
docker compose --profile app stop app
if ($LASTEXITCODE -ne 0) { throw 'Could not stop the container preview before starting native development' }
go run ./cmd/flowforge
if ($LASTEXITCODE -ne 0) { throw 'Server failed' }
