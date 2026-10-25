$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Test-Path -LiteralPath '.env')) {
    $dbPassword = [Guid]::NewGuid().ToString('N')
    $apiToken = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
    @("POSTGRES_PASSWORD=$dbPassword", "FLOWFORGE_API_TOKEN=$apiToken", 'FLOWFORGE_PUBLIC_URL=http://localhost:8088', 'FLOWFORGE_DEMO=false') | Set-Content -LiteralPath '.env' -Encoding utf8
}
docker compose -f compose.yaml -f compose.demo.yaml --profile app up --build -d --wait
if ($LASTEXITCODE -ne 0) { throw 'ERP demo startup failed' }
Write-Host 'Open http://localhost:8088 and run the factory ERP workflow. Login token: FLOWFORGE_API_TOKEN in .env'
