# 发布与提交范围

## 配置独立仓库

将项目放入独立目录。确定 GitHub 仓库地址后，先更新 Go 模块路径和所有内部导入：

```bash
node scripts/configure-repository.mjs https://github.com/your-account/your-repository
go mod tidy
```

地址替换为自己的仓库。脚本只改源码和文档中的模块路径，不读取或上传凭据。完成这一步后，外部开发者才能按实际 GitHub 模块路径引入 `pkg/worker`。

```bash
git init --initial-branch=main
git config core.hooksPath .githooks
node scripts/release.mjs check
git add .
git update-index --chmod=+x .githooks/pre-commit
node scripts/release.mjs check --staged
```

项目采用 MIT，`LICENSE` 随源码提交。GitHub 仓库的 Description 和 Topics 可使用本文末尾的内容。

## 可以提交哪些文件

提交检查和打包使用同一份源码白名单：

| 范围 | 内容 |
| --- | --- |
| 根文件 | README、许可证、贡献/安全/变更文档、Go 模块文件、Docker 与示例配置 |
| `cmd`、`internal`、`pkg` | 源码与测试、数据库 schema / 迁移 |
| `web` | `src`、HTML、Vite / TypeScript 配置、`package.json` 和锁文件 |
| `examples` | 可重复演示的数据、定义与服务源码 |
| `docs` | 公开文档和 `screenshots` 中的 PNG 截图 |
| `scripts`、`.github`、`.githooks` | 开发、测试、发布工具和 CI |

禁止提交 `.env`、实际密钥、本地配置、依赖目录、构建产物、数据库卷、备份、日志和浏览器测试输出。`.env.example` 可以提交，其中只保留说明性占位值。

以下为**项目的提交规则**，与运行时 API 限制分别处理：

| 规则 | 上限 |
| --- | --- |
| 单个源码/文档文件 | 2 MiB |
| 单张文档 PNG 截图 | 1 MiB |
| 未压缩的源码文件总量 | 20 MiB |
| 符号链接 | 不允许进入源码包 |

检查会匹配私钥、常见 GitHub 令牌、本地 `.env` 中的已知凭据和机器绝对路径；也检查 JSON 格式。Git 仓库中已追踪的白名单外文件会直接报错，忽略规则不会替代此检查。检测不可能覆盖所有业务敏感信息，提交前仍需检查暂存区内容。

若本地配置曾进入暂存区，用 `git rm --cached .env` 取消追踪并保留本地文件。已公开的凭据需要撤销，不能仅依靠删除当前文件。

## 检查与打包

```bash
node --test scripts/release.test.mjs
node scripts/release.mjs check
node scripts/release.mjs manifest
node scripts/release.mjs pack
```

`manifest` 输出实际白名单文件；`pack` 生成 `dist/flowforge-source.tar.gz` 和 SHA-256 校验文件，只包含通过检查的源码。

Windows ZIP：

```powershell
.\scripts\package.ps1
```

输出为 `dist/flowforge-source.zip` 和校验文件。源码包不含 `.git`、`.env`、`node_modules`、前端产物或数据库数据。`dist` 自身被忽略，不会进入后续源码包。

## 运行时提交限制

当前没有文件上传接口。流程、触发数据和状态上报使用 JSON：单次请求体最多 1 MiB，单次 HTTP 响应最多 1 MiB，流程最多 128 步，错误信息最多 2,000 字节。需要处理文件时传入对象存储地址，不要把 PDF、图片或大段二进制编码进请求。

## GitHub 配置参考

**Description**

> Lightweight workflow orchestration for business systems and AI agents. Go, React and PostgreSQL, with parallel DAGs, retries and durable async reporting.

**中文介绍**

> 面向企业系统与 AI 智能体的轻量工作流调度平台，支持串并行编排、异步状态上报、失败重试和持久化执行。内置工厂 ERP 多智能体演示，基于 Go、React 和 PostgreSQL，可通过 Docker 独立部署。

**Topics**

`workflow` `workflow-engine` `task-scheduler` `orchestration` `ai-agents` `low-code` `golang` `react` `postgresql` `docker` `erp` `webhook`

仓库可启用 GitHub Actions、Secret scanning 和私密漏洞报告。CI 已配置 Go/数据库测试、race 检查、前端构建和提交范围校验；只有推送到 GitHub 后才会实际触发。
