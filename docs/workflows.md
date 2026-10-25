# 工作流配置

创建使用 `POST /api/v1/workflows`；更新使用 `PUT /api/v1/workflows/{id}` 并携带上次读取的 `version`，并发修改冲突返回 `409`。

## 流程字段

| 字段 | 默认值 / 限制 | 说明 |
| --- | --- | --- |
| `id` | 必填，1–64 字符 | 字母、数字、下划线、连字符，首字符为字母或数字 |
| `name` | 必填，最多 200 字节 | 控制台名称 |
| `description` | 空 | 用途说明 |
| `input_example` | 无 | 运行对话框的默认 JSON，不参与输入校验 |
| `enabled` | `false` | 允许新 API / Webhook / Cron 触发，已有实例继续执行 |
| `concurrency` | `4`，1–64 | 一个实例内最多同时执行的步骤数 |
| `max_active_runs` | `16`，1–10,000 | 跨进程共享的活动实例上限，包含延时与回调等待 |
| `timeout_seconds` | `86400`，最多 30 天 | 首次接管后的总超时，包含等待 |
| `steps` | 1–128 个 | 执行步骤 |

历史重跑使用原定义快照，是显式手动操作。没有执行历史的定义可删除，有历史的定义只能停用。

## 步骤字段

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `id` | 必填 | 流程内唯一 |
| `type` | 必填 | `http`、`transform`、`delay`，兼容 `callback` |
| `execution_mode` | 按类型 | HTTP 默认 `sync`，可选 `async`；映射为 `sync`，延时为 `async` |
| `depends_on` | `[]` | 前置步骤 ID，拒绝循环依赖 |
| `timeout_seconds` | `60` | 每次尝试超时，1 秒至 7 天，包含异步/延时等待 |
| `retry.max_attempts` | `1` | 含首次的总尝试次数，最多 20 |
| `retry.initial_seconds` | `2` | 首次退避间隔 |
| `retry.max_seconds` | `300` | 指数退避上限，最多 86,400 秒 |
| `on_error` | `stop` | 尝试耗尽后的传播策略 |
| `affects_run` | `true` | 失败是否计入最终流程结果 |
| `join` | `all_success` | 前置步骤汇合规则 |
| `condition` | 无 | 不满足时跳过 |
| `config` | 按类型 | HTTP 配置、映射值或延时秒数 |

HTTP 配置支持 `url`、`method`（默认 `POST`）、`headers`、`body`。同步结果为 `{status_code, body}`；异步最终结果是业务上报的 `output`，不包含响应包装。

```json
{ "id":"map", "type":"transform", "execution_mode":"sync", "config":{"value":"{{input}}"} }
```

```json
{ "id":"wait", "type":"delay", "execution_mode":"async", "timeout_seconds":600, "config":{"seconds":300} }
```

## 模板与条件

- `{{input.field}}`：调用方输入。
- `{{steps.ID.output.path}}`：前置步骤输出。
- `{{run.id}}`、`{{run.workflow_id}}`：执行元数据。
- `{{secrets.NAME}}`：HTTP 配置中的密钥，来源为 `FLOWFORGE_SECRET_NAME`。

完整表达式保留 JSON 类型；字符串插值将非字符串序列化为 JSON。缺失路径使步骤失败。当前不支持数组下标或任意脚本，映射和条件不能读取密钥。

```json
{ "condition": { "path":"input.requires_review", "op":"eq", "value":true } }
```

条件支持 `eq`、`ne`、`exists`，按 JSON 类型比较。

## 失败传播与汇合

| `on_error` | 行为 |
| --- | --- |
| `stop` | 下一次推进时跳过未结束步骤，同批已分发操作可能已执行 |
| `continue` | 允许依赖分支继续，把失败视为满足成功前置条件 |
| `skip_dependents` | 默认规则下跳过依赖分支，独立分支继续 |

`affects_run` 独立决定最终结果。非关键通知可设置 `on_error: continue`、`affects_run: false`。

汇合均等待全部前置步骤终结后判断：`all_success` 要求全部成功或允许继续；`all_done` 允许失败/跳过，适合清理任务；`any_success` 要求至少一个成功或允许继续。条件为假会跳过节点并默认阻断依赖分支，可用 `all_done` 明确继续。

## 时间与触发

```json
{
  "schedule": { "cron":"0 9 * * 1-5", "timezone":"Asia/Shanghai" },
  "window": { "start":"20:00", "end":"08:00", "timezone":"Asia/Shanghai", "days":[1,2,3,4,5] }
}
```

Cron 使用五段表达式，漏过的多次触发合并为一次。窗口只限制新步骤启动，不中断已有请求。星期 `0` 为周日；跨午夜按开始日计算，开始与结束相同表示 24 小时。更新定义会重算下次 Cron。

API 与 Webhook 请求相同：

```json
{ "input": { "order_id":"SO-1042" }, "priority":10, "scheduled_at":"2026-11-05T09:00:00+08:00" }
```

计划时间留空则立即排队。优先级范围 -100 至 100，在同一流程内数值越大越先领取。请求头 `Idempotency-Key` 最多 200 字节，在流程内唯一，重复入队返回原实例。
