param([switch]$NoDatabase, [string]$DatabaseName)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not (Test-Path -LiteralPath '.env')) {
    throw '.env 不存在。先运行 node scripts/init-env.mjs 或 .\scripts\dev.ps1 生成配置。'
}

foreach ($line in Get-Content -LiteralPath '.env') {
    if ($line -match '^([A-Z0-9_]+)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process') }
}

if (-not $NoDatabase) {
    docker compose up -d --wait postgres
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL 启动失败' }
}

$dbPort = if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { '55432' }
$database = if ($DatabaseName) { $DatabaseName } else { 'flowforge' }
$env:FLOWFORGE_DATABASE_URL = "postgres://flowforge:$($env:POSTGRES_PASSWORD)@localhost:$dbPort/$($database)?sslmode=disable"
$env:GOWORK = 'off'

Write-Host ('API  http://127.0.0.1:8088  （修改 Go 代码后重新运行本脚本）')
go run ./cmd/flowforge
if ($LASTEXITCODE -ne 0) { throw '后端启动失败' }
