# 开发与测试

## Go

```bash
go test ./...
go vet ./...
```

不设置数据库地址时，数据库集成用例会跳过。完整验证需要 PostgreSQL：

```bash
export FLOWFORGE_TEST_DATABASE_URL='postgres://user:password@localhost:5432/database?sslmode=disable'
go test -count=1 ./...
```

每个集成用例创建独立 schema，并在结束时清理；账号需具备创建 schema 权限。请使用测试数据库。支持 CGO 的环境可运行 `go test -race -count=1 ./...`；GitHub Actions 配置包含该检查。

Windows 的 `scripts/test.ps1` 会启动本地 PostgreSQL、设置测试地址、运行 Go 测试和前端构建。

| 测试 | 覆盖内容 |
| --- | --- |
| 工作流规则 | 循环依赖、未知依赖、执行模式、时区、跨午夜窗口、模板类型与密钥隔离 |
| 执行引擎 | 并行汇合、定义快照、重试、失败传播、取消与重跑 |
| 持久化协调 | 幂等、过期租约隔离、多引擎活动名额、并发 Cron |
| 异步协议 | 提前回调、过期结果、并发保存与唤醒、延时超时 |
| 上报 SDK | 请求元数据、来源约束、自动重试、大小校验、取消、错误信息脱敏 |
| ERP 集成 | 完整八步骤、显式异步上报、首次库存失败重试、非关键通知失败 |
| API / 配置 | 访问令牌、JSON 校验、版本冲突、历史保护、配置拼写和 OpenAPI |

## 前端与发布工具

```bash
npm --prefix web ci
npm --prefix web run build
node --test scripts/release.test.mjs
node scripts/release.mjs check
```

发布工具测试覆盖文件白名单、凭据检查、大小限制和仓库模块路径配置。

## 浏览器检查与截图

安装 Playwright 包及 Chromium 后，运行：

```bash
node scripts/ui-smoke.cjs
node scripts/demo-screenshots.cjs
```

可通过 `FLOWFORGE_PLAYWRIGHT_PATH` 指向已有 Playwright 包目录。脚本默认访问 `http://127.0.0.1:8088`，从本地 `.env` 读取令牌，不将其写入截图。基础脚本检查登录、流程配置、字段保存、无效 JSON、实际执行和移动端布局；ERP 脚本检查完整流程与显式模式，并生成 `docs/screenshots` 中的真实页面截图。

截图脚本需要先启动 ERP 演示。它会创建演示实例以展示真实时间线，不执行真实 ERP 或模型请求。

测试不替代生产容量验证。根据部署环境补充长期运行、数据库资源、业务幂等与故障恢复测试。
