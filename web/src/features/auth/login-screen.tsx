import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  GitBranch,
  Globe2,
  Loader2,
  ShieldCheck,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginScreen({
  token,
  onTokenChange,
  onConnect,
  connecting,
  error,
}: {
  token: string;
  onTokenChange: (value: string) => void;
  onConnect: () => void;
  connecting: boolean;
  error: string;
}) {
  const tokenID = useId();
  const [showToken, setShowToken] = useState(false);
  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.08fr_1fr]">
      <section className="login-hero relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14">
        <span className="aurora-orb -left-20 top-10 size-72 bg-violet-600/40" />
        <span className="aurora-orb right-0 top-1/3 size-64 bg-cyan-400/25" />
        <span className="aurora-orb bottom-0 left-1/3 size-80 bg-indigo-600/30" />

        <div className="relative flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-white/10 text-violet-200 backdrop-blur">
            <WorkflowIcon className="size-5" />
          </span>
          <span className="text-[17px] font-semibold tracking-tight text-white">
            FlowForge
          </span>
          <span className="rounded border border-white/20 px-1 py-px text-[9px] tracking-[0.12em] text-white/60">
            内测
          </span>
        </div>

        <div className="relative max-w-[540px] py-16">
          <span className="inline-flex items-center gap-2 text-[10px] font-semibold tracking-[0.16em] text-violet-300/80">
            <i className="h-px w-7 bg-gradient-to-r from-violet-400 to-cyan-300" />
            把不可控的流程，变成可控的执行
          </span>
          <h1 className="mt-5 text-[clamp(34px,4vw,54px)] font-semibold leading-[1.18] tracking-[-0.035em] text-white">
            让每个想法，
            <br />
            <span className="gradient-text">有序发生。</span>
          </h1>
          <p className="mt-5 max-w-md text-[13px] leading-[1.9] text-white/55">
            从一次 API 调用到完整的 AI 流水线。
            <br />
            把任务交给可靠的工作流引擎，把注意力留给真正重要的事。
          </p>

          <div className="mt-12 flex items-center gap-2.5">
            <FlowChip icon={<Globe2 className="size-4" />} label="触发" />
            <span className="flow-connector" />
            <FlowChip icon={<GitBranch className="size-4" />} label="编排" />
            <span className="flow-connector" />
            <FlowChip icon={<Check className="size-4" />} label="完成" />
          </div>
        </div>

        <div className="relative flex items-center justify-between text-[9px] tracking-[0.14em] text-white/35">
          <span>PostgreSQL 队列 · Go 引擎 · React 控制台</span>
          <span>确定性执行</span>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-9 place-items-center rounded-xl bg-[image:var(--gradient-primary)] text-white">
              <WorkflowIcon className="size-5" />
            </span>
            <span className="text-[17px] font-semibold tracking-tight">
              FlowForge
            </span>
          </div>

          <div className="rounded-2xl border border-white/[0.09] bg-white/[0.035] p-6 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:p-7">
            <span className="text-[10px] font-semibold tracking-[0.16em] text-violet-300/80">
              工作空间访问
            </span>
            <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.03em] text-foreground">
              连接你的工作空间
            </h2>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              输入部署时配置的 API Token，即可管理工作流、编排步骤并追踪执行。
            </p>

            <form
              className="mt-7 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                onConnect();
              }}
            >
              <div className="flex flex-col gap-2">
                <label
                  htmlFor={tokenID}
                  className="text-xs font-medium text-muted-foreground"
                >
                  API 访问令牌
                </label>
                <div className="relative">
                  <Input
                    id={tokenID}
                    autoFocus
                    type={showToken ? "text" : "password"}
                    value={token}
                    onChange={(event) => onTokenChange(event.target.value)}
                    placeholder="输入访问令牌"
                    required
                    minLength={24}
                    autoComplete="off"
                    className="h-11 pr-11"
                  />
                  <button
                    type="button"
                    aria-label={showToken ? "隐藏令牌" : "显示令牌"}
                    onClick={() => setShowToken((value) => !value)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                  >
                    {showToken ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                <small className="text-[11px] leading-relaxed text-muted-foreground/70">
                  本地开发令牌见 flowforge/.env 的 FLOWFORGE_API_TOKEN。
                </small>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-400/25 bg-rose-500/[0.08] px-3 py-2.5 text-[11px] leading-relaxed text-rose-200"
                >
                  {error}
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={connecting}
              >
                {connecting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowRight className="size-4" />
                )}
                连接工作空间
              </Button>

              <p className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/70">
                <ShieldCheck className="size-3.5" />
                令牌仅保存在当前浏览器会话中
              </p>
            </form>
          </div>

          <p className="mt-6 text-center text-[10px] leading-relaxed text-muted-foreground/50">
            每次部署是一个独立工作空间 · API 使用共享 Bearer Token
          </p>
        </div>
      </section>
    </div>
  );
}

function FlowChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.06] px-3.5 py-2.5 text-[11px] text-white/75 backdrop-blur">
      <span className="text-violet-200">{icon}</span>
      {label}
    </span>
  );
}
