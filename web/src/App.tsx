import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import type { Event, Run, Section, Step, Workflow } from "@/types";
import { makeStep, makeWorkflow } from "@/types";
import { ApiClient } from "@/lib/api";
import { clone, downloadJSON, parseDraft, pretty } from "@/lib/workflow";
import { useHotkeys } from "@/hooks/use-hotkeys";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { CommandPalette } from "@/components/command-palette";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LoginScreen } from "@/features/auth/login-screen";
import { WorkflowList } from "@/features/workflows/workflow-list";
import { Designer } from "@/features/designer/designer";
import { RunList } from "@/features/runs/run-list";
import { RunDialog } from "@/features/runs/run-dialog";
import { RunDetailSheet } from "@/features/runs/run-detail-sheet";
import { Integrations } from "@/features/integrations/integrations";

type ConfirmState = {
  title: string;
  description: string;
  action: string;
  destructive?: boolean;
  onConfirm: () => void;
};

export default function App() {
  const [token, setToken] = useState(
    () => sessionStorage.getItem("flowforge-token") || "",
  );
  const api = useMemo(() => new ApiClient(token), [token]);

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [section, setSection] = useState<Section>("workflows");

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [workers, setWorkers] = useState(0);
  const [page, setPage] = useState(0);
  const [runFilter, setRunFilter] = useState("");

  const [draft, setDraft] = useState<Workflow | null>(null);
  const [selected, setSelected] = useState("");
  const [tab, setTabState] = useState<"canvas" | "json">("canvas");
  const [jsonText, setJsonText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const [runTarget, setRunTarget] = useState<Workflow | null>(null);
  const [inputText, setInputText] = useState(
    '{\n  "topic": "AI 工作流自动化"\n}',
  );
  const [runAt, setRunAt] = useState("");

  const [detailID, setDetailID] = useState("");
  const [detail, setDetail] = useState<Run | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [detailStep, setDetailStep] = useState("");

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("flowforge-sidebar") === "1",
  );
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [nextWorkflows, nextRuns, nextStats] = await Promise.all([
      api.workflows(),
      api.runs(page, runFilter),
      api.stats(),
    ]);
    setWorkflows(nextWorkflows);
    setRuns(nextRuns);
    setStats(nextStats);
  }, [api, page, runFilter]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError("");
    try {
      const system = await api.system();
      await refresh();
      setWorkers(system.workers);
      sessionStorage.setItem("flowforge-token", token);
      setConnected(true);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setConnecting(false);
      setLoading(false);
    }
  }, [api, refresh, token]);

  useEffect(() => {
    if (sessionStorage.getItem("flowforge-token")) void connect();
  }, []); // 仅在刷新页面时恢复当前会话令牌。

  useEffect(() => {
    if (!connected) return;
    const tick = () => {
      if (document.hidden) return;
      void refresh().catch((cause) => setError((cause as Error).message));
    };
    tick();
    const timer = setInterval(tick, 4000);
    return () => clearInterval(timer);
  }, [connected, refresh]);

  useEffect(() => {
    if (!detailID || !connected) return;
    let active = true;
    const load = async () => {
      try {
        const [nextRun, nextEvents] = await Promise.all([
          api.run(detailID),
          api.events(detailID),
        ]);
        if (active) {
          setDetail(nextRun);
          setEvents(nextEvents);
        }
      } catch (cause) {
        if (active) setError((cause as Error).message);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 1200);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [detailID, api, connected]);

  const act = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const step = draft?.steps.find((candidate) => candidate.id === selected);

  const openDraft = (workflow: Workflow) => {
    setDraft(clone(workflow));
    setSelected(workflow.steps[0]?.id || "");
    setTabState("canvas");
    setJsonText(pretty(workflow));
    setDirty(false);
    setSection("workflows");
  };

  const openWorkflow = (workflow: Workflow) => {
    if (dirty) {
      setConfirmState({
        title: "放弃尚未保存的修改？",
        description: "打开另一个工作流会丢失当前草稿中的修改。",
        action: "放弃并打开",
        destructive: true,
        onConfirm: () => openDraft(workflow),
      });
      return;
    }
    openDraft(workflow);
  };

  const backToList = () => {
    if (!dirty) {
      setDraft(null);
      setSelected("");
      return;
    }
    setConfirmState({
      title: "放弃尚未保存的修改？",
      description: "当前草稿尚未保存，返回列表后修改将丢失。",
      action: "放弃修改",
      destructive: true,
      onConfirm: () => {
        setDraft(null);
        setDirty(false);
        setSelected("");
      },
    });
  };

  const change = (update: Partial<Workflow>) => {
    setDraft((current) => current && { ...current, ...update });
    setDirty(true);
  };

  const updateStep = (update: Partial<Step>) => {
    if (!draft) return;
    change({
      steps: draft.steps.map((candidate) =>
        candidate.id === selected ? { ...candidate, ...update } : candidate,
      ),
    });
  };

  const save = useCallback(
    () =>
      act(async () => {
        if (!draft) return;
        if (document.querySelector('[data-invalid="true"]'))
          throw new Error("请先修正步骤配置中的 JSON");
        let value = draft;
        if (tab === "json") {
          try {
            value = parseDraft(JSON.parse(jsonText));
          } catch {
            throw new Error("请先修正流程 JSON");
          }
        }
        const saved = await api.saveWorkflow(value);
        setDraft(saved);
        setJsonText(pretty(saved));
        setDirty(false);
        setSelected((current) =>
          saved.steps.some((candidate) => candidate.id === current)
            ? current
            : saved.steps[0]?.id || "",
        );
        toast.success("工作流已保存，后续实例使用新版本");
        await refresh();
      }),
    [act, api, draft, jsonText, tab, refresh],
  );

  const switchTab = (next: "canvas" | "json") => {
    if (!draft) return;
    if (next === "canvas" && tab === "json") {
      try {
        setDraft(parseDraft(JSON.parse(jsonText)));
      } catch {
        setError("请先修正流程 JSON");
        return;
      }
    }
    if (next === "json") setJsonText(pretty(draft));
    setTabState(next);
  };

  const openRun = (workflow: Workflow) => {
    const cached = sessionStorage.getItem(`flowforge-input:${workflow.id}`);
    const fallback =
      workflow.input_example ||
      (workflow.id === "hello-workflow" ? { topic: "AI 工作流自动化" } : {});
    setInputText(cached || pretty(fallback));
    setRunAt("");
    setRunTarget(workflow);
  };

  const startRun = () =>
    act(async () => {
      if (!runTarget) return;
      let input: unknown;
      try {
        input = JSON.parse(inputText);
      } catch {
        throw new Error("输入必须是 JSON 对象");
      }
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("输入必须是 JSON 对象");
      const value = await api.start(runTarget.id, {
        input,
        ...(runAt ? { scheduled_at: new Date(runAt).toISOString() } : {}),
      });
      sessionStorage.setItem(`flowforge-input:${runTarget.id}`, inputText);
      setRunTarget(null);
      setDetail(null);
      setDetailID(value.id);
      setDetailStep("");
      toast.success("执行已入队");
      await refresh();
    });

  const exportWorkflow = (target?: Workflow) => {
    const value = target || draft;
    if (!value) return;
    const content = !target && tab === "json" ? jsonText : pretty(value);
    downloadJSON(value.id + ".json", content);
    toast.success("已导出工作流定义");
  };

  const importWorkflow = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = parseDraft(JSON.parse(await file.text()));
      openWorkflow({ ...parsed, version: 0 });
    } catch (cause) {
      setError((cause as Error).message);
    }
  };

  const create = () => openWorkflow(makeWorkflow());

  const addStep = (type: string) => {
    if (!draft) return;
    let index = draft.steps.length + 1;
    while (draft.steps.some((candidate) => candidate.id === "step_" + index))
      index++;
    const next = makeStep(type, "step_" + index);
    if (selected) next.depends_on = [selected];
    change({ steps: [...draft.steps, next] });
    setSelected(next.id);
  };

  const deleteStep = () => {
    if (!draft || !step) return;
    const target = step;
    setConfirmState({
      title: "删除这个步骤？",
      description: `「${target.name}」及其依赖引用会被移除，此操作不可撤销。`,
      action: "删除步骤",
      destructive: true,
      onConfirm: () => {
        change({
          steps: draft.steps
            .filter((candidate) => candidate.id !== target.id)
            .map((candidate) => ({
              ...candidate,
              depends_on: candidate.depends_on.filter((id) => id !== target.id),
            })),
        });
        setSelected("");
      },
    });
  };

  const deleteWorkflow = () => {
    if (!draft) return;
    const id = draft.id;
    setConfirmState({
      title: "删除这个未使用的工作流？",
      description: "有执行历史的工作流只能停用。删除后无法恢复。",
      action: "确认删除",
      destructive: true,
      onConfirm: () =>
        void act(async () => {
          await api.deleteWorkflow(id);
          setDraft(null);
          setDirty(false);
          setSelected("");
          toast.success("工作流已删除");
          await refresh();
        }),
    });
  };

  const replay = () =>
    act(async () => {
      if (!detail) return;
      const next = await api.replay(detail.id);
      setDetail(null);
      setDetailID(next.id);
      setDetailStep("");
      toast.success("已按原定义重跑");
      await refresh();
    });

  const cancel = () =>
    act(async () => {
      if (!detail) return;
      await api.cancel(detail.id);
      toast.success("已取消执行");
      await refresh();
    });

  const disconnect = () => {
    sessionStorage.removeItem("flowforge-token");
    setConnected(false);
    setToken("");
    setDraft(null);
    setDirty(false);
    setSelected("");
    setDetailID("");
    setDetail(null);
    setEvents([]);
    setWorkflows([]);
    setRuns([]);
    setStats({});
    setWorkers(0);
    setSection("workflows");
    setLoading(true);
    setError("");
  };

  const goHome = () => {
    setSection("workflows");
    if (draft) backToList();
  };

  const copyWorkflowID = (workflow: Workflow) => {
    void navigator.clipboard.writeText(workflow.id);
    toast.success("工作流 ID 已复制");
  };

  useHotkeys({
    palette: () => setPaletteOpen(true),
    save: () => {
      if (draft) void save();
    },
  });

  const activeRuns =
    (stats.running || 0) + (stats.waiting || 0) + (stats.queued || 0);

  if (!connected) {
    return (
      <>
        <LoginScreen
          token={token}
          onTokenChange={setToken}
          onConnect={() => void connect()}
          connecting={connecting}
          error={error}
        />
        <Toaster />
      </>
    );
  }

  return (
    <div className="app-aurora flex min-h-dvh">
      <TooltipProvider>
        <div
          className={
            "sticky top-0 hidden h-dvh shrink-0 p-3 pr-0 transition-[width] duration-200 lg:block " +
            (collapsed ? "w-[80px]" : "w-[252px]")
          }
        >
          <AppSidebar
            section={section}
            onSection={setSection}
            collapsed={collapsed}
            onToggleCollapse={() =>
              setCollapsed((value) => {
                localStorage.setItem("flowforge-sidebar", value ? "0" : "1");
                return !value;
              })
            }
            workflowCount={workflows.length}
            activeRuns={activeRuns}
            workers={workers}
            onHome={goHome}
            onDisconnect={disconnect}
          />
        </div>

        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent
            side="left"
            aria-label="导航菜单"
            showCloseButton
            className="w-[280px] max-w-[86vw] p-0"
          >
            <SheetTitle className="sr-only">导航菜单</SheetTitle>
            <SheetDescription className="sr-only">控制台导航</SheetDescription>
            <AppSidebar
              mobile
              section={section}
              onSection={setSection}
              collapsed={false}
              onToggleCollapse={() => undefined}
              workflowCount={workflows.length}
              activeRuns={activeRuns}
              workers={workers}
              onHome={goHome}
              onDisconnect={disconnect}
              onNavigate={() => setNavOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            section={section}
            workers={workers}
            busy={busy}
            onRefresh={() => void act(refresh)}
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenNav={() => setNavOpen(true)}
            onDisconnect={disconnect}
          />

          {error && (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 border-b border-rose-400/20 bg-rose-500/[0.08] px-4 py-2.5 text-[11.5px] leading-relaxed text-rose-200 sm:px-6"
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">{error}</span>
              <button
                type="button"
                aria-label="关闭错误"
                onClick={() => setError("")}
                className="rounded p-0.5 text-rose-300/70 transition-colors hover:bg-white/[0.06] hover:text-rose-200"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          <main className="min-w-0 flex-1">
            {section === "workflows" &&
              (draft ? (
                <Designer
                  draft={draft}
                  step={step}
                  tab={tab}
                  jsonText={jsonText}
                  dirty={dirty}
                  busy={busy}
                  onBack={backToList}
                  onSave={() => void save()}
                  onRun={() => openRun(draft)}
                  onExport={() => exportWorkflow()}
                  onSelectStep={setSelected}
                  onTabChange={switchTab}
                  onJsonChange={(value) => {
                    setJsonText(value);
                    setDirty(true);
                  }}
                  onChange={change}
                  onUpdateStep={updateStep}
                  onAddStep={addStep}
                  onDeleteStep={deleteStep}
                  onDeleteWorkflow={deleteWorkflow}
                />
              ) : (
                <WorkflowList
                  workflows={workflows}
                  stats={stats}
                  loading={loading}
                  onOpen={openWorkflow}
                  onRun={openRun}
                  onCreate={create}
                  onImport={() => fileRef.current?.click()}
                  onExport={(workflow) => exportWorkflow(workflow)}
                  onCopyId={copyWorkflowID}
                  onIntegrations={() => setSection("integrations")}
                />
              ))}
            {section === "runs" && (
              <RunList
                runs={runs}
                page={page}
                filter={runFilter}
                loading={loading}
                onFilter={(value) => {
                  setRunFilter(value);
                  setPage(0);
                }}
                onPage={setPage}
                onOpen={(id) => {
                  setDetail(null);
                  setDetailID(id);
                  setDetailStep("");
                }}
                onRefresh={() => void act(refresh)}
                onBackToWorkflows={() => setSection("workflows")}
              />
            )}
            {section === "integrations" && <Integrations />}
          </main>
        </div>
      </TooltipProvider>

      <Toaster />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        section={section}
        onSection={setSection}
        workflows={workflows}
        onOpenWorkflow={openWorkflow}
        onCreate={create}
        onRefresh={() => void act(refresh)}
        onDisconnect={disconnect}
      />

      {runTarget && (
        <RunDialog
          workflow={runTarget}
          inputText={inputText}
          runAt={runAt}
          busy={busy}
          onInputChange={setInputText}
          onRunAtChange={setRunAt}
          onClose={() => setRunTarget(null)}
          onStart={() => void startRun()}
        />
      )}

      {detailID && (
        <RunDetailSheet
          detail={detail}
          events={events}
          selectedStep={detailStep}
          busy={busy}
          onSelectStep={setDetailStep}
          onClose={() => {
            setDetailID("");
            setDetail(null);
            setEvents([]);
            setDetailStep("");
          }}
          onReplay={() => void replay()}
          onCancel={() => void cancel()}
        />
      )}

      {confirmState && (
        <AlertDialog
          open
          onOpenChange={(open) => !open && setConfirmState(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmState.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmState.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                destructive={confirmState.destructive}
                onClick={() => {
                  const action = confirmState.onConfirm;
                  setConfirmState(null);
                  action();
                }}
              >
                {confirmState.action}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          void importWorkflow(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}
