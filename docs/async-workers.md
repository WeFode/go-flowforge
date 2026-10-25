# 同步与异步服务接入

## 执行模式

| 类型 | `execution_mode` | 完成条件 |
| --- | --- | --- |
| `http` | `sync` | 请求返回 2xx，保存 `{status_code, body}` |
| `http` | `async` | 2xx 表示已接收，等待开发者调用统一上报接口 |
| `transform` | `sync` | JSON 数据映射结束 |
| `delay` | `async` | 持久化等待到期，引擎自动完成，无需业务上报 |

旧 `type: callback` 等价于异步 HTTP，继续兼容；新流程建议使用显式 `execution_mode`。

## 请求元数据

| 请求头 | 用途 |
| --- | --- |
| `X-FlowForge-Run-ID` | 实例 ID |
| `X-FlowForge-Step-ID` | 步骤 ID |
| `X-FlowForge-Attempt` | 当前尝试次数，从 1 开始 |
| `X-FlowForge-Execution-Mode` | `sync` 或 `async` |
| `Idempotency-Key` | `{run_id}:{step_id}`，重试保持不变 |
| `X-FlowForge-Callback-URL` | 仅异步 HTTP 提供，每次尝试独立的限时上报地址 |

异步服务应将任务可靠地保存到后台执行器或消息队列，再返回 `202`。不要在 HTTP 请求结束后继续使用 `r.Context()`，它会被取消。

## Go 统一上报 SDK

SDK 位于 `pkg/worker`。发布仓库配置脚本会自动更新导入路径：

```go
import "github.com/WeFode/go-flowforge/pkg/worker"
```

接收层提取元数据，把上报器传给内部业务函数：

```go
task, err := worker.FromRequest(r,
    worker.WithAllowedOrigin("https://flows.example.com"),
)
if err != nil { return err }
// 校验请求来源、业务输入，并按 task.IdempotencyKey 去重。
// 保存任务及回调信息到自己的队列，随后返回 202。
```

内部业务代码只在事务与结果落库后报告成功：

```go
func finishPlan(ctx context.Context, reporter *worker.Reporter) error {
    plan, err := buildAndSavePlan(ctx) // 业务自己的实现
    if err != nil { return reporter.Fail(ctx, err) }
    return reporter.Succeed(ctx, plan)
}
```

使用持久化队列时，保存入站的 `X-FlowForge-Callback-URL`，消费时重建上报器：

```go
reporter, err := worker.NewReporter(savedCallbackURL,
    worker.WithAllowedOrigin("https://flows.example.com"),
)
if err != nil { return err }
return reporter.Report(ctx, worker.Result{
    Status: worker.Succeeded,
    Output: map[string]any{"plan_id": "PLAN-SO-1042"},
})
```

`Succeed`、`Fail` 委托给 `Report`。SDK 校验状态和大小，默认单次请求超时 10 秒，对网络错误、`429` 和 `5xx` 最多尝试三次；`4xx` 不重试。可用 `WithHTTPClient` 注入自定义客户端。上报失败应进入业务自己的重试队列，不能简单丢弃。

## HTTP 上报接口

其他语言直接调用平台提供的 URL：

```bash
curl -X POST "$CALLBACK_URL" \
  -H 'Content-Type: application/json' \
  -d '{"status":"succeeded","output":{"plan_id":"PLAN-SO-1042"}}'
```

失败请求：`{"status":"failed","error":"业务失败原因"}`。

路由为 `POST /api/v1/callbacks/{token}`。地址本身携带权限，无需部署级 Bearer Token。`status` 仅接受 `succeeded`、`failed`；`output` 可为任意 JSON；错误最多 2,000 字节；整个 JSON 请求不超过 1 MiB。

| 响应 | 含义 |
| --- | --- |
| `200` | 已接收，或重复提交相同终态；不覆盖首次输出 |
| `400` | JSON、状态或大小不符合要求 |
| `404` | 令牌不存在或过期 |
| `409` | 旧尝试、已取消实例或已提交冲突终态 |

## 生命周期

平台在分发前保存异步等待状态，允许服务在分发请求返回前上报。重试会产生新令牌，旧尝试不能完成新尝试。等待时释放 Worker，收到结果后在数据库事务中唤醒实例。

执行为至少一次。使用稳定幂等键避免重复副作用；尝试次数用于日志与重试决策。业务去重后仍应将已有结果上报给当前尝试。

上报地址是敏感任务数据，应与任务一起保存并限制读取，不写入普通访问日志。使用 `WithAllowedOrigin` 固定上报平台来源，并自行验证入站任务调用方。反向代理使用子路径时，保存并使用完整上报地址。
