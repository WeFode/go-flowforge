param([switch]$Docker, [switch]$Hmr)

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
    if ($LASTEXITCODE -ne 0) { throw 'Docker 部署启动失败' }
    Write-Host '控制台 http://localhost:8088；登录令牌见 .env 的 FLOWFORGE_API_TOKEN'
    exit
}

docker compose up -d --wait postgres
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL 启动失败' }
$previous = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
docker compose --profile app stop app *> $null
$ErrorActionPreference = $previous
# 没有运行中的容器时 compose 返回 1，视为无需停止；其余非零码按失败处理。
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1) { throw '无法停止同项目的应用容器，请先手动关闭后重试' }

if ($Hmr) {
    $api = Join-Path $PSScriptRoot 'dev-api.ps1'
    if (Get-NetTCPConnection -State Listen -LocalPort 8088 -ErrorAction SilentlyContinue) {
        throw '8088 端口已被占用，请先关闭已有的 API 进程（可能是上一次的 dev-api.ps1 窗口）'
    }
    Write-Host '正在新窗口启动 API（8088），当前窗口启动 Vite（5178，支持 HMR）…'
    Start-Process -FilePath 'powershell' -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-File', $api, '-NoDatabase') -WorkingDirectory (Get-Location)
    & (Join-Path $PSScriptRoot 'dev-web.ps1')
    exit
}

$dbPort = if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { '55432' }
$env:FLOWFORGE_DATABASE_URL = "postgres://flowforge:$($env:POSTGRES_PASSWORD)@localhost:$dbPort/flowforge?sslmode=disable"
$env:GOWORK = 'off'

Push-Location web
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw '前端依赖安装失败' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw '前端构建失败' }
} finally { Pop-Location }

Write-Host '控制台 http://localhost:8088（Go 托管 web/dist）；登录令牌见 .env 的 FLOWFORGE_API_TOKEN'
go run ./cmd/flowforge
if ($LASTEXITCODE -ne 0) { throw '后端启动失败' }
