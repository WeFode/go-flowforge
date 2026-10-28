import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, Settings2, Sparkles, Trash2 } from "lucide-react";
import type { Step, Workflow } from "@/types";
import { modeOf, typeNames } from "@/types";
import { pretty } from "@/lib/workflow";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/field";

export function Inspector({
  draft,
  step,
  busy,
  onChange,
  onUpdateStep,
  onSelectStep,
  onDeleteStep,
  onDeleteWorkflow,
}: {
  draft: Workflow;
  step?: Step;
  busy: boolean;
  onChange: (update: Partial<Workflow>) => void;
  onUpdateStep: (update: Partial<Step>) => void;
  onSelectStep: (id: string) => void;
  onDeleteStep: () => void;
  onDeleteWorkflow: () => void;
}) {
  return (
    <aside className="flex w-full flex-col border-t border-white/[0.07] bg-[#080c16]/60 lg:h-full lg:w-[344px] lg:shrink-0 lg:border-l lg:border-t-0 xl:w-[364px]">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-white/[0.07] px-5 py-4">
        <span className="grid size-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-violet-200">
          <Settings2 className="size-4" />
        </span>
        <strong className="text-[13px] font-semibold text-foreground">
          {step ? "步骤配置" : "流程设置"}
        </strong>
        {step && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-[11px]"
            onClick={() => onSelectStep("")}
          >
            流程设置
          </Button>
        )}
      </div>

      <div className="px-5 py-4 lg:scroll-thin lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {step ? (
          <StepSettings
            key={step.id}
            step={step}
            draft={draft}
            busy={busy}
            onUpdateStep={onUpdateStep}
            onDeleteStep={onDeleteStep}
          />
        ) : (
          <WorkflowSettings
            draft={draft}
            busy={busy}
            onChange={onChange}
            onDeleteWorkflow={onDeleteWorkflow}
          />
        )}
      </div>
    </aside>
  );
}

function StepSettings({
  step,
  draft,
  busy,
  onUpdateStep,
  onDeleteStep,
}: {
  step: Step;
  draft: Workflow;
  busy: boolean;
  onUpdateStep: (update: Partial<Step>) => void;
  onDeleteStep: () => void;
}) {
  const mode = modeOf(step);
  const hasRequest = step.type === "http" || step.type === "callback";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between pb-4">
        <span className="flex items-center gap-2 text-[11px] text-violet-200">
          <i className="size-1.5 rounded-full bg-violet-300" />
          {typeNames[step.type]}
        </span>
        <code className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {step.id}
        </code>
      </div>

      <Group title="基础" defaultOpen>
        <Field label="步骤名称">
          <Input
            value={step.name}
            onChange={(event) => onUpdateStep({ name: event.target.value })}
          />
        </Field>
        <Field
          label="执行模式"
          hint={
            step.type === "delay"
              ? "由引擎持久化等待，到期后自动完成，无需上报。"
              : mode === "async"
                ? "HTTP 2xx 仅确认接收，业务完成后调用统一上报方法。"
                : "等待服务返回结果后完成此步骤。"
          }
        >
          <Select
            value={mode}
            disabled={step.type !== "http" && step.type !== "callback"}
            onChange={(event) =>
              onUpdateStep({
                type: "http",
                execution_mode: event.target.value as "sync" | "async",
                timeout_seconds:
                  event.target.value === "async"
                    ? Math.max(step.timeout_seconds, 300)
                    : step.timeout_seconds,
              })
            }
          >
            <option value="sync">同步 · 等待结果</option>
            <option value="async">异步 · 完成后上报</option>
          </Select>
        </Field>
      </Group>

      <Group title="依赖与汇合" defaultOpen>
        <FieldGroup
          label="前置步骤"
          hint="无依赖的步骤并行执行。依赖修改后会自动重新排列。"
        >
          <div className="space-y-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2">
            {draft.steps
              .filter((candidate) => candidate.id !== step.id)
              .map((candidate) => (
                <label
                  key={candidate.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12px] text-secondary-foreground transition-colors hover:bg-white/[0.04]"
                >
                  <Checkbox
                    checked={step.depends_on.includes(candidate.id)}
                    onCheckedChange={(checked) =>
                      onUpdateStep({
                        depends_on: checked
                          ? [...step.depends_on, candidate.id]
                          : step.depends_on.filter((id) => id !== candidate.id),
                      })
                    }
                  />
                  <span className="flex-1 truncate">{candidate.name}</span>
                  <span className="font-mono text-[9px] text-muted-foreground/50">
                    {candidate.id}
                  </span>
                </label>
              ))}
            {draft.steps.length === 1 && (
              <p className="px-2 py-3 text-center text-[11px] text-muted-foreground/60">
                添加步骤后可设置依赖
              </p>
            )}
          </div>
        </FieldGroup>
        <Field label="前置步骤完成规则">
          <Select
            value={step.join}
            onChange={(event) => onUpdateStep({ join: event.target.value })}
          >
            <option value="all_success">全部成功（含允许继续的失败）</option>
            <option value="all_done">全部结束即可</option>
            <option value="any_success">至少一个成功</option>
          </Select>
        </Field>
      </Group>

      {hasRequest && (
        <Group title="请求配置" defaultOpen>
          <Field label="请求地址">
            <Input
              value={String(step.config.url || "")}
              onChange={(event) =>
                onUpdateStep({
                  config: { ...step.config, url: event.target.value },
                })
              }
              placeholder="https://api.example.com/jobs"
              className="font-mono text-[12px]"
            />
          </Field>
          <Field label="请求方法">
            <Select
              value={String(step.config.method || "POST")}
              onChange={(event) =>
                onUpdateStep({
                  config: { ...step.config, method: event.target.value },
                })
              }
            >
              {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].map(
                (method) => (
                  <option key={method}>{method}</option>
                ),
              )}
            </Select>
          </Field>
          <JsonField
            key={step.id + "-body"}
            label="JSON 请求体"
            value={step.config.body ?? {}}
            onChange={(value) =>
              onUpdateStep({ config: { ...step.config, body: value } })
            }
            hint={"可使用 {{input}}、{{steps.步骤ID.output}}"}
          />
          <JsonField
            key={step.id + "-headers"}
            label="请求头"
            value={step.config.headers ?? {}}
            onChange={(value) =>
              onUpdateStep({ config: { ...step.config, headers: value } })
            }
            hint={'密钥引用：{"Authorization":"Bearer {{secrets.API_KEY}}"}'}
          />
          {mode === "async" && (
            <p className="rounded-lg border border-violet-400/20 bg-violet-500/[0.06] p-3 text-[11px] leading-relaxed text-violet-100/80">
              执行引擎将回调地址放在 X-FlowForge-Callback-URL
              请求头中。业务完成后调用 worker.Reporter.Succeed / Fail
              上报，或直接 POST 此地址。
            </p>
          )}
        </Group>
      )}

      {step.type === "transform" && (
        <Group title="数据映射" defaultOpen>
          <JsonField
            key={step.id + "-value"}
            label="输出映射"
            value={step.config.value ?? {}}
            onChange={(value) => onUpdateStep({ config: { value } })}
            hint={'整段表达式保留 JSON 类型，例如 "{{steps.start.output}}"'}
          />
        </Group>
      )}

      {step.type === "delay" && (
        <Group title="延时设置" defaultOpen>
          <Field label="等待时长（秒）">
            <Input
              type="number"
              min={0}
              max={2592000}
              value={Number(step.config.seconds || 0)}
              onChange={(event) =>
                onUpdateStep({
                  config: { seconds: Number(event.target.value) },
                })
              }
            />
          </Field>
        </Group>
      )}

      <Group title="重试与超时">
        <div className="grid grid-cols-2 gap-3">
          <Field label="超时（秒）">
            <Input
              type="number"
              min={1}
              value={step.timeout_seconds}
              onChange={(event) =>
                onUpdateStep({ timeout_seconds: Number(event.target.value) })
              }
            />
          </Field>
          <Field label="最大尝试次数">
            <Input
              type="number"
              min={1}
              max={20}
              value={step.retry.max_attempts}
              onChange={(event) =>
                onUpdateStep({
                  retry: {
                    ...step.retry,
                    max_attempts: Number(event.target.value),
                  },
                })
              }
            />
          </Field>
          <Field label="重试间隔（秒）">
            <Input
              type="number"
              min={1}
              value={step.retry.initial_seconds}
              onChange={(event) =>
                onUpdateStep({
                  retry: {
                    ...step.retry,
                    initial_seconds: Number(event.target.value),
                  },
                })
              }
            />
          </Field>
          <Field label="间隔上限（秒）">
            <Input
              type="number"
              min={1}
              value={step.retry.max_seconds}
              onChange={(event) =>
                onUpdateStep({
                  retry: {
                    ...step.retry,
                    max_seconds: Number(event.target.value),
                  },
                })
              }
            />
          </Field>
        </div>
        <Field label="重试耗尽后的行为">
          <Select
            value={step.on_error}
            onChange={(event) => onUpdateStep({ on_error: event.target.value })}
          >
            <option value="stop">停止流程中尚未结束的步骤</option>
            <option value="continue">允许后续步骤继续</option>
            <option value="skip_dependents">阻断依赖分支，其他分支继续</option>
          </Select>
        </Field>
        <ToggleRow
          label="失败计入流程最终结果"
          description="关闭后，该步骤失败不会让整个实例判定为失败。"
          checked={step.affects_run !== false}
          onChange={(checked) => onUpdateStep({ affects_run: checked })}
        />
      </Group>

      <Group
        title="条件执行"
        badge={step.condition ? "已启用" : undefined}
        defaultOpen={!!step.condition}
      >
        <ToggleRow
          label="启用条件判断"
          description="条件不满足时跳过该步骤，不影响其余分支。"
          checked={!!step.condition}
          onChange={(checked) =>
            onUpdateStep({
              condition: checked
                ? { path: "input.enabled", op: "eq", value: true }
                : undefined,
            })
          }
        />
        {step.condition && (
          <>
            <Field label="数据路径">
              <Input
                className="font-mono text-[12px]"
                value={step.condition.path}
                onChange={(event) =>
                  onUpdateStep({
                    condition: { ...step.condition!, path: event.target.value },
                  })
                }
              />
            </Field>
            <Field label="比较方式">
              <Select
                value={step.condition.op}
                onChange={(event) =>
                  onUpdateStep({
                    condition: { ...step.condition!, op: event.target.value },
                  })
                }
              >
                <option value="eq">等于</option>
                <option value="ne">不等于</option>
                <option value="exists">存在</option>
              </Select>
            </Field>
            <JsonField
              label="比较值（JSON）"
              value={step.condition.value ?? null}
              onChange={(value) =>
                onUpdateStep({
                  condition: { ...step.condition!, value },
                })
              }
            />
          </>
        )}
      </Group>

      <div className="pt-4">
        <Button
          variant="ghost"
          size="sm"
          disabled={draft.steps.length <= 1 || busy}
          onClick={onDeleteStep}
          className="text-rose-300/80 hover:bg-rose-500/[0.08] hover:text-rose-200"
        >
          <Trash2 className="size-3.5" />
          删除步骤
        </Button>
      </div>
    </div>
  );
}

function WorkflowSettings({
  draft,
  busy,
  onChange,
  onDeleteWorkflow,
}: {
  draft: Workflow;
  busy: boolean;
  onChange: (update: Partial<Workflow>) => void;
  onDeleteWorkflow: () => void;
}) {
  return (
    <div className="space-y-1">
      <Group title="基础" defaultOpen>
        <Field
          label="工作流 ID"
          hint="字母、数字、下划线或连字符；创建后不可修改。"
        >
          <Input
            disabled={draft.version > 0}
            value={draft.id}
            onChange={(event) => onChange({ id: event.target.value })}
            className="font-mono text-[12px]"
          />
        </Field>
        <Field label="名称">
          <Input
            value={draft.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </Field>
        <Field label="描述">
          <Textarea
            rows={3}
            value={draft.description}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </Field>
        <ToggleRow
          label="启用新任务触发"
          description="停用后仍会处理已入队的实例。"
          checked={draft.enabled}
          onChange={(checked) => onChange({ enabled: checked })}
        />
      </Group>

      <Group title="并发与超时" defaultOpen>
        <div className="grid grid-cols-2 gap-3">
          <Field label="实例内并行数">
            <Input
              type="number"
              min={1}
              max={64}
              value={draft.concurrency}
              onChange={(event) =>
                onChange({ concurrency: Number(event.target.value) })
              }
            />
          </Field>
          <Field label="并发运行实例数">
            <Input
              type="number"
              min={1}
              value={draft.max_active_runs}
              onChange={(event) =>
                onChange({ max_active_runs: Number(event.target.value) })
              }
            />
          </Field>
        </div>
        <Field label="流程总超时（秒）">
          <Input
            type="number"
            min={1}
            value={draft.timeout_seconds}
            onChange={(event) =>
              onChange({ timeout_seconds: Number(event.target.value) })
            }
          />
        </Field>
      </Group>

      <Group title="定时触发" badge={draft.schedule ? "Cron" : undefined}>
        <ToggleRow
          label="Cron 定时触发"
          description="按计划自动创建实例，时区独立配置。"
          checked={!!draft.schedule}
          onChange={(checked) =>
            onChange({
              schedule: checked
                ? { cron: "0 9 * * 1-5", timezone: "Asia/Shanghai" }
                : undefined,
            })
          }
        />
        {draft.schedule && (
          <>
            <Field label="Cron 表达式" hint="分钟 小时 日期 月份 星期">
              <Input
                className="font-mono text-[12px]"
                value={draft.schedule.cron}
                onChange={(event) =>
                  onChange({
                    schedule: { ...draft.schedule!, cron: event.target.value },
                  })
                }
              />
            </Field>
            <Field label="时区">
              <Input
                value={draft.schedule.timezone}
                onChange={(event) =>
                  onChange({
                    schedule: {
                      ...draft.schedule!,
                      timezone: event.target.value,
                    },
                  })
                }
              />
            </Field>
          </>
        )}
      </Group>

      <Group title="启动时间窗口" badge={draft.window ? "已启用" : undefined}>
        <ToggleRow
          label="限制步骤启动时间窗口"
          description="窗口外只排队不启动，适合夜间批处理。"
          checked={!!draft.window}
          onChange={(checked) =>
            onChange({
              window: checked
                ? { start: "20:00", end: "08:00", timezone: "Asia/Shanghai" }
                : undefined,
            })
          }
        />
        {draft.window && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="开始时间">
                <Input
                  type="time"
                  value={draft.window.start}
                  onChange={(event) =>
                    onChange({
                      window: { ...draft.window!, start: event.target.value },
                    })
                  }
                />
              </Field>
              <Field label="结束时间">
                <Input
                  type="time"
                  value={draft.window.end}
                  onChange={(event) =>
                    onChange({
                      window: { ...draft.window!, end: event.target.value },
                    })
                  }
                />
              </Field>
            </div>
            <Field label="时区">
              <Input
                value={draft.window.timezone}
                onChange={(event) =>
                  onChange({
                    window: { ...draft.window!, timezone: event.target.value },
                  })
                }
              />
            </Field>
            <FieldGroup
              label="窗口开始日"
              hint="不选表示每天；跨午夜窗口包含次日凌晨。"
            >
              <div className="flex gap-1.5">
                {["日", "一", "二", "三", "四", "五", "六"].map(
                  (name, index) => (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={
                        draft.window?.days?.includes(index) || false
                      }
                      onClick={() =>
                        onChange({
                          window: {
                            ...draft.window!,
                            days: draft.window?.days?.includes(index)
                              ? draft.window.days.filter(
                                  (value) => value !== index,
                                )
                              : [...(draft.window?.days || []), index],
                          },
                        })
                      }
                      className={cn(
                        "h-8 flex-1 rounded-lg border text-[11px] transition-colors",
                        draft.window?.days?.includes(index)
                          ? "border-violet-400/40 bg-violet-500/[0.14] text-violet-100"
                          : "border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06]",
                      )}
                    >
                      {name}
                    </button>
                  ),
                )}
              </div>
            </FieldGroup>
          </>
        )}
      </Group>

      <p className="my-4 rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 text-[11px] leading-relaxed text-muted-foreground">
        已创建的实例使用创建时的定义快照。修改流程不会改变运行中的实例。
      </p>

      {draft.version > 0 && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={onDeleteWorkflow}
          className="text-rose-300/80 hover:bg-rose-500/[0.08] hover:text-rose-200"
        >
          <Trash2 className="size-3.5" />
          删除未使用的工作流
        </Button>
      )}
    </div>
  );
}

function JsonField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  hint?: string;
}) {
  const id = useId();
  const [text, setText] = useState(pretty(value));
  const [error, setError] = useState("");
  const serialized = pretty(value);

  useEffect(() => {
    setText(serialized);
    setError("");
  }, [serialized]);

  const validate = (next: string) => {
    try {
      JSON.parse(next);
      setError("");
      return true;
    } catch {
      setError("JSON 格式未完成，保存前请修正");
      return false;
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="text-xs font-medium text-muted-foreground"
        >
          {label}
        </label>
        <button
          type="button"
          onClick={() => {
            try {
              setText(pretty(JSON.parse(text)));
              setError("");
            } catch {
              setError("JSON 格式未完成，保存前请修正");
            }
          }}
          className="flex items-center gap-1 text-[10px] text-violet-300/80 transition-colors hover:text-violet-200"
        >
          <Sparkles className="size-3" />
          格式化
        </button>
      </div>
      <Textarea
        id={id}
        spellCheck={false}
        rows={6}
        value={text}
        data-invalid={error ? "true" : undefined}
        aria-invalid={!!error || undefined}
        onChange={(event) => {
          setText(event.target.value);
          validate(event.target.value);
        }}
        onBlur={() => {
          if (!validate(text)) return;
          const parsed = JSON.parse(text);
          if (JSON.stringify(parsed) !== JSON.stringify(value))
            onChange(parsed);
        }}
        className={cn(
          "min-h-[132px] font-mono text-[11.5px] leading-relaxed",
          error &&
            "border-rose-400/50 focus-visible:border-rose-400/60 focus-visible:ring-rose-500/20",
        )}
      />
      <div className="flex items-center justify-between gap-3">
        {error ? (
          <p className="text-[11px] text-rose-300">{error}</p>
        ) : (
          <span className="text-[10px] text-muted-foreground/50">
            {text.split("\n").length} 行
          </span>
        )}
      </div>
      {hint && (
        <small className="text-[11px] leading-relaxed text-muted-foreground/70">
          {hint}
        </small>
      )}
    </div>
  );
}

function Group({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group border-b border-white/[0.06] py-4 last:border-0"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70 transition-colors hover:text-secondary-foreground [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          {title}
          {badge && (
            <span className="rounded-full border border-violet-400/25 bg-violet-400/[0.1] px-1.5 py-px text-[9px] font-medium normal-case tracking-normal text-violet-200">
              {badge}
            </span>
          )}
        </span>
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}

function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && (
        <small className="text-[11px] leading-relaxed text-muted-foreground/70">
          {hint}
        </small>
      )}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3 transition-colors hover:bg-white/[0.035]">
      <div className="min-w-0">
        <p className="text-[12px] text-secondary-foreground">{label}</p>
        {description && (
          <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted-foreground/70">
            {description}
          </p>
        )}
      </div>
      <Switch
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </label>
  );
}
