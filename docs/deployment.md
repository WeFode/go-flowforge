# 部署与配置

## Docker

```bash
node scripts/init-env.mjs
docker compose --profile app up --build -d --wait
```

默认端口：平台 `127.0.0.1:8088`，PostgreSQL `127.0.0.1:55432`。应用容器以非 root 用户、只读文件系统运行。数据库使用 `postgres-data` 卷，普通 `docker compose down` 不删除数据。

工厂 ERP 演示使用额外配置：

```bash
docker compose -f compose.yaml -f compose.demo.yaml --profile app up --build -d --wait
```

演示覆盖文件会启用样例、启动 `erp-agents`，并只允许平台向它发送请求；回调在 Docker 内使用 `http://app:8088`。退出演示后用基础 Compose 文件重新启动，可恢复基础环境配置。

## 配置来源

环境变量覆盖 YAML。使用 `go run ./cmd/flowforge -config config.local.yaml` 加载本地文件；可从 `config.example.yaml` 复制。未知 YAML 字段会报错，避免拼写错误被忽略。

| 环境变量（加 `FLOWFORGE_` 前缀） | 默认值 | 用途 |
| --- | --- | --- |
| `DATABASE_URL` | 必填 | PostgreSQL DSN，可配置 SSL/连接选项 |
| `API_TOKEN` | 必填，至少 24 字符 | 工作空间共享访问令牌 |
| `LISTEN` | `:8088` | HTTP 监听地址 |
| `PUBLIC_URL` | `http://localhost:8088` | 异步服务可访问的回调根地址 |
| `WORKERS` | `8`，1–256 | 本进程并发处理的实例数 |
| `POLL_MS` | `500`，50–60,000 | 队列领取间隔 |
| `LEASE_SECONDS` | `30`，至少 10 | 租约周期，心跳为其三分之一 |
| `DB_CONNECTIONS` | `24`，至少 4 | 数据库连接池上限 |
| `HTTP_ALLOW_PRIVATE` | `false` | 是否允许内网、回环等地址 |
| `HTTP_ALLOWED_HOSTS` | 空 | 逗号分隔、精确匹配的出站主机名，不含端口 |
| `DEMO` | `false` | 创建默认示例，不覆盖现有定义 |
| `DEMO_AGENT_URL` | `http://erp-agents:8090` | ERP 样例服务根地址 |
| `WEB_DIR` | `web/dist` | 静态前端目录 |
| `REDIS_URL` | 空 | 保留入口，本版不使用 Redis 调度 |

Compose 宿主机映射另由 `APP_PORT`、`POSTGRES_PORT`、`DEMO_AGENT_PORT` 控制。变更容器环境变量后需要重建容器；已经入库的流程定义不会因修改环境变量自动覆盖，可在控制台更新其 URL。

`FLOWFORGE_PUBLIC_URL` 必须能被实际工作服务访问。容器的 `localhost` 指向容器本身；连接宿主机可使用 `host.docker.internal`。反向代理需要转发 `/api/v1`，生产网络应通过 HTTPS 提供访问。

## 出站请求与密钥

默认在建立连接时检查 DNS 解析结果，拒绝内网、回环和链路本地地址；不使用环境 HTTP 代理，不跟随重定向。接入内部服务时设置 `HTTP_ALLOW_PRIVATE=true`，并优先用 `HTTP_ALLOWED_HOSTS` 限定目的主机。

同步请求还受传输层限制：连接和 TLS 握手各 10 秒，响应头等待 30 秒。长耗时处理应采用异步模式，在业务执行完成后上报。

流程可引用 `{{secrets.NAME}}`。服务进程从 `FLOWFORGE_SECRET_NAME` 读取对应值；Docker 下在自己的 Compose 覆盖文件中注入，示例：

```yaml
services:
  app:
    environment:
      FLOWFORGE_SECRET_AGENT_TOKEN: ${AGENT_TOKEN:?Set the agent token locally}
```

不要把实际密钥填入流程 JSON 或示例文件；定义会保存在执行快照中。平台共享令牌允许管理和读取整个工作空间，当前没有用户级权限隔离。

## 原生开发

要求 Go 1.25+、Node 22+、Docker PostgreSQL。

Windows：`scripts/dev.ps1 -Hmr` 会启动数据库，在新窗口运行 Go API（8088），在当前窗口运行 Vite（5178，HMR，`/api` 代理到 8088）；也可以分别运行 `scripts/dev-api.ps1` 和 `scripts/dev-web.ps1`。不加 `-Hmr` 时，`scripts/dev.ps1` 会构建前端并让 Go 托管 `web/dist`，适合本地验收。启动原生模式前会停止同项目的应用容器。

其他系统可先启动数据库，再设置环境变量：

```bash
node scripts/init-env.mjs
docker compose up -d --wait postgres
set -a; . ./.env; set +a
export FLOWFORGE_DATABASE_URL="postgres://flowforge:${POSTGRES_PASSWORD}@localhost:55432/flowforge?sslmode=disable"
GOWORK=off go run ./cmd/flowforge
```

另一终端运行前端：

```bash
cd web
npm ci
npm run dev
```

Vite 默认使用 `5178`，将 `/api` 代理到后端 `8088`。原生 ERP 开发还需要启动演示服务并将 `DEMO_AGENT_URL` 改为原生进程可访问的地址，详见 [示例说明](erp-demo.md)。

## 数据库与运维

服务启动时自动创建 schema，并用事务锁串行化迁移。也可执行 `-migrate-only` 后退出。数据库账号需要建表和建索引权限；测试账号还需要创建 schema 权限。

健康检查为 `GET /healthz`，检查数据库连通性。所有普通 API 使用 Bearer Token；限时上报地址使用自身令牌。日志为结构化 JSON，不记录上报 URL。

多个应用实例可以共享一个 PostgreSQL，流程并发名额在数据库中协调。当前没有自动历史清理、数据库备份或指标平台，需要按业务保留周期配置；容量与可用性需在实际环境验证。

可选 Redis：`docker compose --profile redis up -d redis`。它当前不会改变队列行为。
