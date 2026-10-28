$ErrorActionPreference = 'Stop'
Set-Location (Join-Path (Split-Path $PSScriptRoot -Parent) 'web')

if (-not (Test-Path -LiteralPath 'node_modules')) {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw '前端依赖安装失败' }
}

Write-Host '控制台 http://127.0.0.1:5178  （Vite HMR，/api 代理到 8088）'
npm run dev
if ($LASTEXITCODE -ne 0) { throw 'Vite 启动失败' }
