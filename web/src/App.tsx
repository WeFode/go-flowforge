import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Braces,
  Check,
  ChevronDown,
  ChevronLeft,
  Clock3,
  Code2,
  Copy,
  Download,
  GitBranch,
  Globe2,
  Layers3,
  Loader2,
  LogOut,
  Maximize2,
  Minus,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Terminal,
  Trash2,
  Upload,
  Workflow as WorkflowIcon,
  X,
  Zap,
} from "lucide-react";
import type { Event, Run, Step, Workflow } from "./types";
import {
  formatTime,
  labels,
  makeStep,
  makeWorkflow,
  modeOf,
  terminal,
  typeNames,
} from "./types";

const icons: Record<string, typeof Globe2> = {
  http: Globe2,
  transform: Braces,
  delay: Clock3,
  callback: ArrowDownLeft,
};
const clone = <T,>(v: T): T => structuredClone(v);
const pretty = (v: unknown) => JSON.stringify(v, null, 2);
function parseDraft(raw: unknown): Workflow {
  if (!raw || typeof raw !== "object") throw new Error("流程必须是 JSON 对象");
  const d = raw as Workflow;
  if (!d.id || !d.name || !Array.isArray(d.steps) || !d.steps.length)
    throw new Error("流程需要 id、name 和非空 steps");
  const steps = d.steps.map((s) => {
    if (!s || typeof s.id !== "string" || !s.id || !typeNames[s.type])
      throw new Error("每个步骤需要有效的 id 和 type");
    if (
      s.depends_on &&
      (!Array.isArray(s.depends_on) ||
        s.depends_on.some((v) => typeof v !== "string"))
    )
      throw new Error("depends_on 必须是步骤 ID 数组");
    if (s.config && (typeof s.config !== "object" || Array.isArray(s.config)))
      throw new Error("config 必须是 JSON 对象");
    const defaults = makeStep(s.type, s.id);
    return {
      ...defaults,
      ...s,
      retry: { ...defaults.retry, ...s.retry },
      depends_on: s.depends_on || [],
      config: s.config || defaults.config,
    };
  });
  return { ...makeWorkflow(), ...d, steps };
}
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {labels[status] || status}
    </span>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
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
  onChange: (v: unknown) => void;
  hint?: string;
}) {
  const [text, setText] = useState(pretty(value));
  const [error, setError] = useState("");
  const serialized = pretty(value);
  useEffect(() => {
    setText(serialized);
    setError("");
  }, [serialized]);
  return (
    <Field label={label} hint={hint}>
      <textarea
        className={`code ${error ? "invalid" : ""}`}
        spellCheck={false}
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            JSON.parse(e.target.value);
            setError("");
          } catch {
            setError("JSON 格式未完成，保存前请修正");
          }
        }}
        onBlur={() => {
          try {
            onChange(JSON.parse(text));
            setError("");
          } catch {
            setError("JSON 格式未完成，保存前请修正");
          }
        }}
      />
      {error && <small className="text-red-600">{error}</small>}
    </Field>
  );
}
function Graph({
  workflow,
  selected,
  onSelect,
  states,
}: {
  workflow: Workflow;
  selected?: string;
  onSelect: (id: string) => void;
  states?: Run["steps"];
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [vertical, setVertical] = useState(workflow.steps.length > 5);
  const depths = new Map<string, number>();
  const pending = new Set<string>();
  const depth = (id: string): number => {
    if (depths.has(id)) return depths.get(id)!;
    if (pending.has(id)) return 0;
    pending.add(id);
    const node = workflow.steps.find((s) => s.id === id);
    const value = node?.depends_on.length
      ? Math.min(127, Math.max(...node.depends_on.map((d) => depth(d) + 1)))
      : 0;
    depths.set(id, value);
    pending.delete(id);
    return value;
  };
  workflow.steps.forEach((s) => depth(s.id));
  const columns: Record<number, Step[]> = {};
  workflow.steps.forEach((s) => {
    const d = depths.get(s.id)!;
    (columns[d] ||= []).push(s);
  });
  const height = vertical
    ? Object.keys(columns).length * 150 + 20
    : Math.max(360, ...Object.values(columns).map((c) => c.length * 128 + 70));
  const width = vertical
    ? Math.max(650, ...Object.values(columns).map((c) => c.length * 272 + 90))
    : Math.max(650, Object.keys(columns).length * 272 + 80);
  const fit = useCallback(() => {
    if (viewportRef.current)
      setZoom(
        Math.max(
          0.3,
          Math.min(1, (viewportRef.current.clientWidth - 24) / width),
        ),
      );
  }, [width]);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    fit();
    return () => observer.disconnect();
  }, [fit]);
  const positions = new Map(
    workflow.steps.map((s) => {
      const d = depths.get(s.id)!;
      const group = columns[d];
      return [
        s.id,
        {
          x: vertical
            ? (width - group.length * 272) / 2 + group.indexOf(s) * 272 + 27
            : 42 + d * 272,
          y: vertical
            ? 42 + d * 150
            : (height - group.length * 128) / 2 + group.indexOf(s) * 128 + 16,
        },
      ];
    }),
  );
  return (
    <div className="graph-shell">
      <div className="graph-tools">
        <button
          aria-label="缩小画布"
          onClick={() => setZoom((v) => Math.max(0.3, v - 0.1))}
        >
          <Minus size={13} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          aria-label="放大画布"
          onClick={() => setZoom((v) => Math.min(1.5, v + 0.1))}
        >
          <Plus size={13} />
        </button>
        <button aria-label="适应画布" onClick={fit}>
          <Maximize2 size={13} />
        </button>
        <button
          aria-label={vertical ? "切换为横向布局" : "切换为纵向布局"}
          onClick={() => setVertical((v) => !v)}
        >
          <GitBranch
            size={13}
            style={{ transform: vertical ? "rotate(90deg)" : undefined }}
          />
        </button>
      </div>
      <div className="graph-scroll" ref={viewportRef}>
        <div
          className="graph-stage"
          style={{ width: width * zoom, height: height * zoom }}
        >
          <div
            className={`graph ${vertical ? "vertical" : "horizontal"}`}
            style={{
              width,
              minHeight: height,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            <svg width={width} height={height} aria-hidden="true">
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#b8c6c1" />
                </marker>
              </defs>
              {workflow.steps.flatMap((s) =>
                s.depends_on.map((dep, edgeIndex) => {
                  const a = positions.get(dep),
                    b = positions.get(s.id);
                  if (!a || !b) return null;
                  const x1 = vertical ? a.x + 109 : a.x + 218,
                    y1 = vertical ? a.y + 82 : a.y + 41,
                    x2 = vertical ? b.x + 109 : b.x,
                    y2 = vertical ? b.y : b.y + 41;
                  const skip = depths.get(s.id)! - depths.get(dep)! > 1;
                  const lane = 16 + (edgeIndex % 3) * 10;
                  // Long dependency edges use the outer gutter rather than crossing intermediate nodes.
                  const curve = vertical
                    ? skip
                      ? `M${x1},${y1} L${x1},${y1 + 24} L${lane},${y1 + 24} L${lane},${y2 - 20} L${x2},${y2 - 20} L${x2},${y2}`
                      : `M${x1},${y1} C${x1},${y1 + 32} ${x2},${y2 - 32} ${x2},${y2}`
                    : skip
                      ? `M${x1},${y1} L${x1 + 24},${y1} L${x1 + 24},${lane} L${x2 - 20},${lane} L${x2 - 20},${y2} L${x2},${y2}`
                      : `M${x1},${y1} C${x1 + 32},${y1} ${x2 - 32},${y2} ${x2},${y2}`;
                  return (
                    <path
                      key={`${dep}-${s.id}`}
                      d={curve}
                      fill="none"
                      stroke="#b8c6c1"
                      strokeWidth="1.6"
                      markerEnd="url(#arrow)"
                    />
                  );
                }),
              )}
            </svg>
            {workflow.steps.map((s, index) => {
              const Icon = icons[s.type] || Braces;
              const position = positions.get(s.id)!;
              return (
                <button
                  key={s.id}
                  className={`flow-node ${selected === s.id ? "selected" : ""} ${states?.[s.id]?.status || ""}`}
                  style={{ left: position.x, top: position.y }}
                  onClick={() => onSelect(s.id)}
                >
                  <span className={`node-icon ${s.type}`}>
                    <Icon size={19} />
                  </span>
                  <span className="node-content">
                    <strong>{s.name}</strong>
                    <small>
                      {states
                        ? labels[states[s.id]?.status]
                        : typeNames[s.type]}
                    </small>
                  </span>
                  <span className="node-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={`execution-mode ${modeOf(s)}`}>
                    {modeOf(s) === "async" ? "异步" : "同步"}
                  </span>
                  <i className="port in" />
                  <i className="port out" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(
    () => sessionStorage.getItem("flowforge-token") || "",
  );
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState("workflows");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Workflow | null>(null);
  const [selected, setSelected] = useState("");
  const [tab, setTab] = useState("canvas");
  const [jsonText, setJsonText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [runDialog, setRunDialog] = useState<Workflow | null>(null);
  const [inputText, setInputText] = useState(
    '{\n  "topic": "AI 工作流自动化"\n}',
  );
  const [runAt, setRunAt] = useState("");
  const [detailID, setDetailID] = useState("");
  const [detail, setDetail] = useState<Run | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [detailStep, setDetailStep] = useState("");
  const [busy, setBusy] = useState(false);
  const [runFilter, setRunFilter] = useState("");
  const [page, setPage] = useState(0);
  const [workers, setWorkers] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const api = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch("/api/v1" + path, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          ...init?.headers,
        },
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "请求失败");
      return value;
    },
    [token],
  );
  const refresh = useCallback(async () => {
    const [w, r, s] = await Promise.all([
      api<Workflow[]>("/workflows"),
      api<Run[]>(`/runs?limit=30&offset=${page * 30}&status=${runFilter}`),
      api<Record<string, number>>("/stats"),
    ]);
    setWorkflows(w);
    setRuns(r);
    setStats(s);
  }, [api, page, runFilter]);
  const connect = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const system = await api<{ workers: number }>("/system");
      await refresh();
      setWorkers(system.workers);
      sessionStorage.setItem("flowforge-token", token);
      setConnected(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api, refresh, token]);
  useEffect(() => {
    if (sessionStorage.getItem("flowforge-token")) void connect();
  }, []); // Restore only the current browser session.
  useEffect(() => {
    if (!connected) return;
    void refresh().catch((e) => setError(e.message));
    const timer = setInterval(
      () => void refresh().catch((e) => setError(e.message)),
      4000,
    );
    return () => clearInterval(timer);
  }, [connected, refresh]);
  useEffect(() => {
    if (!detailID || !connected) return;
    let active = true;
    const load = async () => {
      try {
        const [r, e] = await Promise.all([
          api<Run>("/runs/" + detailID),
          api<Event[]>("/runs/" + detailID + "/events"),
        ]);
        if (active) {
          setDetail(r);
          setEvents(e);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      }
    };
    void load();
    const timer = setInterval(load, 1200);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [detailID, api, connected]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const openWorkflow = (w: Workflow) => {
    if (dirty && !confirm("放弃尚未保存的修改？")) return;
    setDraft(clone(w));
    setSelected(w.steps[0]?.id || "");
    setTab("canvas");
    setJsonText(pretty(w));
    setDirty(false);
  };
  const change = (update: Partial<Workflow>) => {
    setDraft((d) => d && { ...d, ...update });
    setDirty(true);
  };
  const step = draft?.steps.find((s) => s.id === selected);
  const updateStep = (update: Partial<Step>) => {
    if (draft)
      change({
        steps: draft.steps.map((s) =>
          s.id === selected ? { ...s, ...update } : s,
        ),
      });
  };
  const save = () =>
    act(async () => {
      if (document.querySelector(".invalid"))
        throw new Error("请先修正步骤配置中的 JSON");
      let value = draft!;
      if (tab === "json") value = JSON.parse(jsonText);
      const saved = await api<Workflow>(
        value.version ? "/workflows/" + value.id : "/workflows",
        { method: value.version ? "PUT" : "POST", body: pretty(value) },
      );
      setDraft(saved);
      setJsonText(pretty(saved));
      setDirty(false);
      setToast("工作流已保存，后续实例使用新版本");
      await refresh();
    });
  const create = () => openWorkflow(makeWorkflow());
  const openRun = (workflow: Workflow) => {
    setInputText(
      pretty(
        workflow.input_example ||
          (workflow.id === "hello-workflow"
            ? { topic: "AI 工作流自动化" }
            : {}),
      ),
    );
    setRunAt("");
    setRunDialog(workflow);
  };
  const addStep = (type: string) => {
    if (!draft) return;
    let n = draft.steps.length + 1;
    while (draft.steps.some((s) => s.id === "step_" + n)) n++;
    const next = makeStep(type, "step_" + n);
    if (selected) next.depends_on = [selected];
    change({ steps: [...draft.steps, next] });
    setSelected(next.id);
    setAddOpen(false);
  };
  const run = () =>
    act(async () => {
      const input = JSON.parse(inputText);
      if (!input || typeof input !== "object" || Array.isArray(input))
        throw new Error("输入必须是 JSON 对象");
      const value = await api<Run>(`/workflows/${runDialog!.id}/runs`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: pretty({
          input,
          ...(runAt ? { scheduled_at: new Date(runAt).toISOString() } : {}),
        }),
      });
      setRunDialog(null);
      setDetail(null);
      setDetailID(value.id);
      setDetailStep("");
      setToast("执行已入队");
      await refresh();
    });
  const exportWorkflow = () => {
    const value = tab === "json" ? jsonText : pretty(draft);
    const url = URL.createObjectURL(
      new Blob([value], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = draft!.id + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };
  const importWorkflow = async (file?: File) => {
    if (!file) return;
    try {
      const d = parseDraft(JSON.parse(await file.text()));
      openWorkflow({ ...d, version: 0 });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  const active =
    (stats.running || 0) + (stats.waiting || 0) + (stats.queued || 0);

  if (!connected)
    return (
      <div className="login-screen">
        <div className="login-art">
          <div className="brand">
            <span className="brand-mark">
              <WorkflowIcon size={26} />
            </span>
            FlowForge
          </div>
          <div>
            <span className="eyebrow">BUILD FLOWS. SHIP POSSIBILITIES.</span>
            <h1>
              让每个想法，
              <br />
              有序发生。
            </h1>
            <p>
              从一次 API 调用到完整 AI 流水线。
              <br />
              把任务交给可靠的工作流引擎。
            </p>
            <div className="login-flow">
              <span>
                <Globe2 />
                触发
              </span>
              <ArrowRight />
              <span>
                <GitBranch />
                编排
              </span>
              <ArrowRight />
              <span>
                <Check />
                完成
              </span>
            </div>
          </div>
          <small>POSTGRESQL · GO · REACT</small>
        </div>
        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            void connect();
          }}
        >
          <span className="eyebrow text-emerald-700">WORKSPACE ACCESS</span>
          <h2>连接你的工作空间</h2>
          <p>输入部署时配置的 API Token，即可管理工作流。</p>
          <Field
            label="API Token"
            hint="本地开发令牌见 flowforge/.env 的 FLOWFORGE_API_TOKEN。"
          >
            <input
              autoFocus
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="输入访问令牌"
              required
              minLength={24}
              autoComplete="off"
            />
          </Field>
          {error && <div className="error-inline">{error}</div>}
          <button className="primary justify-center" disabled={loading}>
            {loading ? (
              <Loader2 className="animate-spin" size={17} />
            ) : (
              <ArrowRight size={17} />
            )}
            连接工作空间
          </button>
          <small className="login-note">
            <ShieldCheck size={15} />
            令牌仅保存在当前浏览器会话中
          </small>
        </form>
      </div>
    );

  return (
    <div className="shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => {
            if (dirty && !confirm("放弃尚未保存的修改？")) return;
            setSection("workflows");
            setDraft(null);
            setDirty(false);
          }}
        >
          <span className="brand-mark">
            <WorkflowIcon size={23} />
          </span>
          FlowForge<span className="version">BETA</span>
        </button>
        <div className="workspace-label">
          <span className="workspace-avatar">F</span>
          <span>
            默认工作空间<small>独立部署 · v0.1</small>
          </span>
          <ChevronDown size={14} />
        </div>
        <small className="nav-caption">工作空间</small>
        <nav>
          <button
            className={section === "workflows" ? "active" : ""}
            onClick={() => setSection("workflows")}
          >
            <Layers3 size={18} />
            工作流<span>{workflows.length}</span>
          </button>
          <button
            className={section === "runs" ? "active" : ""}
            onClick={() => setSection("runs")}
          >
            <Activity size={18} />
            执行记录{active > 0 && <i className="green-dot" />}
          </button>
          <button
            className={section === "integrations" ? "active" : ""}
            onClick={() => setSection("integrations")}
          >
            <Code2 size={18} />
            开发者接入
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="engine-status">
            <span className="green-dot" />
            <div>
              引擎已连接<small>PostgreSQL 持久化队列</small>
            </div>
            <Activity size={17} />
          </div>
          <button
            onClick={() => {
              sessionStorage.removeItem("flowforge-token");
              setConnected(false);
              setToken("");
            }}
          >
            <LogOut size={16} />
            断开连接
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            工作空间<span>/</span>
            <strong>
              {section === "workflows"
                ? "工作流"
                : section === "runs"
                  ? "执行记录"
                  : "开发者接入"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="worker-tag">
              <span className="green-dot" />
              {workers} 个 Worker
            </span>
            <button
              className="icon-button"
              aria-label="刷新数据"
              onClick={() => void act(refresh)}
            >
              <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
            </button>
            <span className="user-avatar">FF</span>
          </div>
        </header>
        {error && (
          <div role="alert" className="error-banner">
            <span>{error}</span>
            <button aria-label="关闭错误" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {section === "workflows" && !draft && (
          <div className="page">
            <div className="page-title">
              <div>
                <span className="eyebrow">ORCHESTRATE YOUR IDEAS</span>
                <h1>工作流</h1>
                <p>连接服务、编排任务，让复杂流程自动运转。</p>
              </div>
              <div className="flex gap-2">
                <button
                  className="secondary"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={16} />
                  导入
                </button>
                <button className="primary" onClick={create}>
                  <Plus size={17} />
                  新建工作流
                </button>
              </div>
            </div>
            <div className="stats-grid">
              <Stat
                label="工作流"
                value={workflows.length}
                note={`${workflows.filter((w) => w.enabled).length} 个已启用`}
                icon={<Layers3 />}
              />
              <Stat
                label="累计执行"
                value={total}
                note="所有触发方式"
                icon={<Zap />}
              />
              <Stat
                label="进行中"
                value={active}
                note="运行、排队及等待"
                icon={<Activity />}
              />
              <Stat
                label="执行成功率"
                value={
                  total
                    ? Math.round(((stats.succeeded || 0) / total) * 100) + "%"
                    : "—"
                }
                note={`${stats.succeeded || 0} 次成功完成`}
                icon={<Check />}
              />
            </div>
            <div className="section-title">
              <h2>
                全部工作流 <span>{workflows.length}</span>
              </h2>
              <div className="search">
                <Search size={15} />
                <input
                  placeholder="搜索工作流…"
                  aria-label="搜索工作流"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="workflow-grid">
              {workflows
                .filter((w) =>
                  (w.name + w.id).toLowerCase().includes(search.toLowerCase()),
                )
                .map((w) => (
                  <article className="workflow-card" key={w.id}>
                    <div className="card-heading">
                      <span className="card-icon">
                        <GitBranch size={21} />
                      </span>
                      <span className={`enabled-tag ${w.enabled ? "on" : ""}`}>
                        <i />
                        {w.enabled ? "已启用" : "已停用"}
                      </span>
                    </div>
                    <button
                      className="card-name"
                      onClick={() => openWorkflow(w)}
                    >
                      {w.name}
                      <ArrowUpRight size={17} />
                    </button>
                    <p>{w.description || "添加描述，记录这个工作流的用途。"}</p>
                    <div className="mini-flow">
                      {w.steps.slice(0, 5).map((s, i) => {
                        const Icon = icons[s.type] || Braces;
                        return (
                          <span className="contents" key={s.id}>
                            {i > 0 && <span className="mini-line" />}
                            <span
                              className={`mini-node ${s.type}`}
                              title={s.name}
                            >
                              <Icon size={16} />
                            </span>
                          </span>
                        );
                      })}
                      {w.steps.length > 5 && (
                        <small>+{w.steps.length - 5}</small>
                      )}
                    </div>
                    <div className="card-footer">
                      <span>
                        {w.steps.length} 个步骤<span>·</span>v{w.version}
                      </span>
                      <button
                        onClick={() => {
                          openRun(w);
                        }}
                        disabled={!w.enabled}
                      >
                        <Play size={13} />
                        运行
                      </button>
                    </div>
                  </article>
                ))}
              <button className="new-card" onClick={create}>
                <span>
                  <Plus size={23} />
                </span>
                <strong>从一个想法开始</strong>
                <small>创建你的下一个工作流</small>
              </button>
            </div>
            <div className="getting-started">
              <div>
                <span className="guide-icon">
                  <Terminal size={24} />
                </span>
                <div>
                  <h3>为开发者与 AI 应用而生</h3>
                  <p>
                    通过 API、Webhook 或 Cron 触发，使用同一套可靠的执行机制。
                  </p>
                </div>
              </div>
              <button onClick={() => setSection("integrations")}>
                查看接入方式
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
        {section === "workflows" && draft && (
          <div className="designer">
            <div className="designer-toolbar">
              <div className="flex items-center gap-3">
                <button
                  className="icon-button"
                  aria-label="返回工作流列表"
                  onClick={() => {
                    if (!dirty || confirm("放弃尚未保存的修改？")) {
                      setDraft(null);
                      setDirty(false);
                    }
                  }}
                >
                  <ChevronLeft size={20} />
                </button>
                <div>
                  <strong>{draft.name}</strong>
                  <small>
                    {draft.id} <span>·</span>{" "}
                    {dirty ? "有未保存的修改" : "v" + draft.version}
                  </small>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="secondary" onClick={exportWorkflow}>
                  <Download size={15} />
                  <span className="hide-small">导出</span>
                </button>
                <button
                  className="secondary"
                  disabled={busy || dirty || !draft.version || !draft.enabled}
                  onClick={() => {
                    openRun(draft);
                  }}
                >
                  <Play size={15} />
                  运行
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  <Save size={15} />
                  保存
                </button>
              </div>
            </div>
            <div className="designer-body">
              <div className="canvas-area">
                <div className="canvas-toolbar">
                  <div className="segmented">
                    <button
                      className={tab === "canvas" ? "active" : ""}
                      onClick={() => {
                        if (tab === "json") {
                          try {
                            const value = parseDraft(JSON.parse(jsonText));
                            setDraft(value);
                          } catch {
                            setError("请先修正流程 JSON");
                            return;
                          }
                        }
                        setTab("canvas");
                      }}
                    >
                      <WorkflowIcon size={15} />
                      可视化
                    </button>
                    <button
                      className={tab === "json" ? "active" : ""}
                      onClick={() => {
                        setJsonText(pretty(draft));
                        setTab("json");
                      }}
                    >
                      <Braces size={15} />
                      JSON
                    </button>
                  </div>
                  <div className="relative">
                    <button
                      className="secondary small"
                      onClick={() => setAddOpen(!addOpen)}
                    >
                      <Plus size={15} />
                      添加步骤
                    </button>
                    {addOpen && (
                      <div className="add-menu">
                        {Object.entries(typeNames)
                          .filter(([type]) => type !== "callback")
                          .map(([type, name]) => {
                            const Icon = icons[type];
                            return (
                              <button key={type} onClick={() => addStep(type)}>
                                <Icon size={17} />
                                <span>
                                  {name}
                                  <small>
                                    {type === "http"
                                      ? "调用任意 HTTP 服务"
                                      : type === "callback"
                                        ? "分发任务，等待外部回调"
                                        : type === "delay"
                                          ? "释放 Worker，持久化等待"
                                          : "映射输入与步骤输出"}
                                  </small>
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </div>
                {tab === "canvas" ? (
                  <Graph
                    workflow={draft}
                    selected={selected}
                    onSelect={setSelected}
                  />
                ) : (
                  <textarea
                    aria-label="工作流 JSON"
                    className="json-editor"
                    spellCheck={false}
                    value={jsonText}
                    onChange={(e) => {
                      setJsonText(e.target.value);
                      setDirty(true);
                    }}
                  />
                )}
                <div className="canvas-footer">
                  <span>
                    <span className="green-dot" />
                    DAG 依赖编排
                  </span>
                  <span>
                    {draft.steps.length} 个步骤 · 最大并行 {draft.concurrency}
                  </span>
                  <button onClick={() => setSelected("")}>
                    流程设置
                    <Settings2 size={13} />
                  </button>
                </div>
              </div>
              <aside className="inspector">
                <div className="inspector-title">
                  <Settings2 size={17} />
                  <strong>{step ? "步骤配置" : "流程设置"}</strong>
                  {step && (
                    <button onClick={() => setSelected("")}>流程设置</button>
                  )}
                </div>
                <div className="inspector-content">
                  {step ? (
                    <>
                      <div className="step-type-label">
                        {typeNames[step.type]}
                        <code>{step.id}</code>
                      </div>
                      <Field label="步骤名称">
                        <input
                          value={step.name}
                          onChange={(e) => updateStep({ name: e.target.value })}
                        />
                      </Field>
                      <Field
                        label="执行模式"
                        hint={
                          step.type === "delay"
                            ? "由引擎持久化等待，到期后自动完成，无需上报。"
                            : modeOf(step) === "async"
                              ? "HTTP 2xx 仅确认接收，业务完成后调用统一上报方法。"
                              : "等待服务返回结果后完成此步骤。"
                        }
                      >
                        <select
                          value={modeOf(step)}
                          disabled={
                            step.type !== "http" && step.type !== "callback"
                          }
                          onChange={(e) =>
                            updateStep({
                              type: "http",
                              execution_mode: e.target.value as
                                | "sync"
                                | "async",
                              timeout_seconds:
                                e.target.value === "async"
                                  ? Math.max(step.timeout_seconds, 300)
                                  : step.timeout_seconds,
                            })
                          }
                        >
                          <option value="sync">同步 · 等待结果</option>
                          <option value="async">异步 · 完成后上报</option>
                        </select>
                      </Field>
                      <Field
                        label="前置步骤"
                        hint="无依赖的步骤并行执行。依赖修改后会自动重新排列。"
                      >
                        <div className="dependencies">
                          {draft.steps
                            .filter((s) => s.id !== step.id)
                            .map((s) => (
                              <label key={s.id}>
                                <input
                                  type="checkbox"
                                  checked={step.depends_on.includes(s.id)}
                                  onChange={(e) =>
                                    updateStep({
                                      depends_on: e.target.checked
                                        ? [...step.depends_on, s.id]
                                        : step.depends_on.filter(
                                            (id) => id !== s.id,
                                          ),
                                    })
                                  }
                                />
                                {s.name}
                              </label>
                            ))}
                          {draft.steps.length === 1 && (
                            <small>添加步骤后可设置依赖</small>
                          )}
                        </div>
                      </Field>
                      <Field label="前置步骤完成规则">
                        <select
                          value={step.join}
                          onChange={(e) => updateStep({ join: e.target.value })}
                        >
                          <option value="all_success">
                            全部成功（含允许继续的失败）
                          </option>
                          <option value="all_done">全部结束即可</option>
                          <option value="any_success">至少一个成功</option>
                        </select>
                      </Field>
                      <hr />
                      {(step.type === "http" || step.type === "callback") && (
                        <>
                          <Field label="请求地址">
                            <input
                              value={String(step.config.url || "")}
                              onChange={(e) =>
                                updateStep({
                                  config: {
                                    ...step.config,
                                    url: e.target.value,
                                  },
                                })
                              }
                              placeholder="https://api.example.com/jobs"
                            />
                          </Field>
                          <Field label="请求方法">
                            <select
                              value={String(step.config.method || "POST")}
                              onChange={(e) =>
                                updateStep({
                                  config: {
                                    ...step.config,
                                    method: e.target.value,
                                  },
                                })
                              }
                            >
                              {[
                                "GET",
                                "POST",
                                "PUT",
                                "PATCH",
                                "DELETE",
                                "HEAD",
                              ].map((v) => (
                                <option key={v}>{v}</option>
                              ))}
                            </select>
                          </Field>
                          <JsonField
                            key={step.id + "-body"}
                            label="JSON 请求体"
                            value={step.config.body ?? {}}
                            onChange={(v) =>
                              updateStep({
                                config: { ...step.config, body: v },
                              })
                            }
                            hint={"可使用 {{input}}、{{steps.步骤ID.output}}"}
                          />
                          <JsonField
                            key={step.id + "-headers"}
                            label="请求头"
                            value={step.config.headers ?? {}}
                            onChange={(v) =>
                              updateStep({
                                config: { ...step.config, headers: v },
                              })
                            }
                            hint={
                              '密钥引用：{"Authorization":"Bearer {{secrets.API_KEY}}"}'
                            }
                          />
                          {modeOf(step) === "async" && (
                            <p className="info-note">
                              执行引擎将回调地址放在 X-FlowForge-Callback-URL
                              请求头中。开发者可在内部处理完成后调用
                              worker.Reporter.Succeed / Fail 上报，或直接 POST
                              此地址。
                            </p>
                          )}
                        </>
                      )}
                      {step.type === "transform" && (
                        <JsonField
                          key={step.id + "-value"}
                          label="输出映射"
                          value={step.config.value ?? {}}
                          onChange={(v) => updateStep({ config: { value: v } })}
                          hint={
                            '整段表达式保留 JSON 类型，例如 "{{steps.start.output}}"'
                          }
                        />
                      )}
                      {step.type === "delay" && (
                        <Field label="等待时长（秒）">
                          <input
                            type="number"
                            min="0"
                            max="2592000"
                            value={Number(step.config.seconds || 0)}
                            onChange={(e) =>
                              updateStep({
                                config: { seconds: +e.target.value },
                              })
                            }
                          />
                        </Field>
                      )}
                      <hr />
                      <div className="field-grid">
                        <Field label="超时（秒）">
                          <input
                            type="number"
                            min="1"
                            value={step.timeout_seconds}
                            onChange={(e) =>
                              updateStep({ timeout_seconds: +e.target.value })
                            }
                          />
                        </Field>
                        <Field label="最大尝试次数">
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={step.retry.max_attempts}
                            onChange={(e) =>
                              updateStep({
                                retry: {
                                  ...step.retry,
                                  max_attempts: +e.target.value,
                                },
                              })
                            }
                          />
                        </Field>
                      </div>
                      <div className="field-grid">
                        <Field label="重试间隔（秒）">
                          <input
                            type="number"
                            min="1"
                            value={step.retry.initial_seconds}
                            onChange={(e) =>
                              updateStep({
                                retry: {
                                  ...step.retry,
                                  initial_seconds: +e.target.value,
                                },
                              })
                            }
                          />
                        </Field>
                        <Field label="间隔上限（秒）">
                          <input
                            type="number"
                            min="1"
                            value={step.retry.max_seconds}
                            onChange={(e) =>
                              updateStep({
                                retry: {
                                  ...step.retry,
                                  max_seconds: +e.target.value,
                                },
                              })
                            }
                          />
                        </Field>
                      </div>
                      <Field label="重试耗尽后的行为">
                        <select
                          value={step.on_error}
                          onChange={(e) =>
                            updateStep({ on_error: e.target.value })
                          }
                        >
                          <option value="stop">停止流程中尚未结束的步骤</option>
                          <option value="continue">允许后续步骤继续</option>
                          <option value="skip_dependents">
                            阻断依赖分支，其他分支继续
                          </option>
                        </select>
                      </Field>
                      <label className="check-field">
                        <input
                          type="checkbox"
                          checked={step.affects_run !== false}
                          onChange={(e) =>
                            updateStep({ affects_run: e.target.checked })
                          }
                        />
                        失败计入流程最终结果
                      </label>
                      <details>
                        <summary>条件执行</summary>
                        <label className="check-field">
                          <input
                            type="checkbox"
                            checked={!!step.condition}
                            onChange={(e) =>
                              updateStep({
                                condition: e.target.checked
                                  ? {
                                      path: "input.enabled",
                                      op: "eq",
                                      value: true,
                                    }
                                  : undefined,
                              })
                            }
                          />
                          启用条件判断
                        </label>
                        {step.condition && (
                          <>
                            <Field label="数据路径">
                              <input
                                value={step.condition.path}
                                onChange={(e) =>
                                  updateStep({
                                    condition: {
                                      ...step.condition!,
                                      path: e.target.value,
                                    },
                                  })
                                }
                              />
                            </Field>
                            <Field label="比较方式">
                              <select
                                value={step.condition.op}
                                onChange={(e) =>
                                  updateStep({
                                    condition: {
                                      ...step.condition!,
                                      op: e.target.value,
                                    },
                                  })
                                }
                              >
                                <option value="eq">等于</option>
                                <option value="ne">不等于</option>
                                <option value="exists">存在</option>
                              </select>
                            </Field>
                            <JsonField
                              label="比较值（JSON）"
                              value={step.condition.value ?? null}
                              onChange={(v) =>
                                updateStep({
                                  condition: { ...step.condition!, value: v },
                                })
                              }
                            />
                          </>
                        )}
                      </details>
                      <button
                        className="danger-text"
                        disabled={draft.steps.length <= 1}
                        onClick={() => {
                          const id = step.id;
                          change({
                            steps: draft.steps
                              .filter((s) => s.id !== id)
                              .map((s) => ({
                                ...s,
                                depends_on: s.depends_on.filter(
                                  (d) => d !== id,
                                ),
                              })),
                          });
                          setSelected("");
                        }}
                      >
                        <Trash2 size={14} />
                        删除步骤
                      </button>
                    </>
                  ) : (
                    <>
                      <Field
                        label="工作流 ID"
                        hint="字母、数字、下划线或连字符；创建后不可修改。"
                      >
                        <input
                          disabled={draft.version > 0}
                          value={draft.id}
                          onChange={(e) => change({ id: e.target.value })}
                        />
                      </Field>
                      <Field label="名称">
                        <input
                          value={draft.name}
                          onChange={(e) => change({ name: e.target.value })}
                        />
                      </Field>
                      <Field label="描述">
                        <textarea
                          rows={3}
                          value={draft.description}
                          onChange={(e) =>
                            change({ description: e.target.value })
                          }
                        />
                      </Field>
                      <label className="check-field">
                        <input
                          type="checkbox"
                          checked={draft.enabled}
                          onChange={(e) =>
                            change({ enabled: e.target.checked })
                          }
                        />
                        启用新任务触发
                      </label>
                      <div className="field-grid">
                        <Field label="实例内并行数">
                          <input
                            type="number"
                            min="1"
                            max="64"
                            value={draft.concurrency}
                            onChange={(e) =>
                              change({ concurrency: +e.target.value })
                            }
                          />
                        </Field>
                        <Field label="并发运行实例数">
                          <input
                            type="number"
                            min="1"
                            value={draft.max_active_runs}
                            onChange={(e) =>
                              change({ max_active_runs: +e.target.value })
                            }
                          />
                        </Field>
                      </div>
                      <Field label="流程总超时（秒）">
                        <input
                          type="number"
                          min="1"
                          value={draft.timeout_seconds}
                          onChange={(e) =>
                            change({ timeout_seconds: +e.target.value })
                          }
                        />
                      </Field>
                      <hr />
                      <label className="check-field">
                        <input
                          type="checkbox"
                          checked={!!draft.schedule}
                          onChange={(e) =>
                            change({
                              schedule: e.target.checked
                                ? {
                                    cron: "0 9 * * 1-5",
                                    timezone: "Asia/Shanghai",
                                  }
                                : undefined,
                            })
                          }
                        />
                        Cron 定时触发
                      </label>
                      {draft.schedule && (
                        <>
                          <Field
                            label="Cron 表达式"
                            hint="分钟 小时 日期 月份 星期"
                          >
                            <input
                              className="mono"
                              value={draft.schedule.cron}
                              onChange={(e) =>
                                change({
                                  schedule: {
                                    ...draft.schedule!,
                                    cron: e.target.value,
                                  },
                                })
                              }
                            />
                          </Field>
                          <Field label="时区">
                            <input
                              value={draft.schedule.timezone}
                              onChange={(e) =>
                                change({
                                  schedule: {
                                    ...draft.schedule!,
                                    timezone: e.target.value,
                                  },
                                })
                              }
                            />
                          </Field>
                        </>
                      )}
                      <hr />
                      <label className="check-field">
                        <input
                          type="checkbox"
                          checked={!!draft.window}
                          onChange={(e) =>
                            change({
                              window: e.target.checked
                                ? {
                                    start: "20:00",
                                    end: "08:00",
                                    timezone: "Asia/Shanghai",
                                  }
                                : undefined,
                            })
                          }
                        />
                        限制步骤启动时间窗口
                      </label>
                      {draft.window && (
                        <>
                          <div className="field-grid">
                            <Field label="开始时间">
                              <input
                                type="time"
                                value={draft.window.start}
                                onChange={(e) =>
                                  change({
                                    window: {
                                      ...draft.window!,
                                      start: e.target.value,
                                    },
                                  })
                                }
                              />
                            </Field>
                            <Field label="结束时间">
                              <input
                                type="time"
                                value={draft.window.end}
                                onChange={(e) =>
                                  change({
                                    window: {
                                      ...draft.window!,
                                      end: e.target.value,
                                    },
                                  })
                                }
                              />
                            </Field>
                          </div>
                          <Field label="时区">
                            <input
                              value={draft.window.timezone}
                              onChange={(e) =>
                                change({
                                  window: {
                                    ...draft.window!,
                                    timezone: e.target.value,
                                  },
                                })
                              }
                            />
                          </Field>
                          <Field
                            label="窗口开始日"
                            hint="不选表示每天；跨午夜窗口包含次日凌晨。"
                          >
                            <div className="days">
                              {["日", "一", "二", "三", "四", "五", "六"].map(
                                (name, i) => (
                                  <button
                                    key={i}
                                    className={
                                      draft.window?.days?.includes(i)
                                        ? "active"
                                        : ""
                                    }
                                    onClick={() =>
                                      change({
                                        window: {
                                          ...draft.window!,
                                          days: draft.window?.days?.includes(i)
                                            ? draft.window.days.filter(
                                                (v) => v !== i,
                                              )
                                            : [
                                                ...(draft.window?.days || []),
                                                i,
                                              ],
                                        },
                                      })
                                    }
                                  >
                                    {name}
                                  </button>
                                ),
                              )}
                            </div>
                          </Field>
                        </>
                      )}
                      <p className="info-note">
                        已创建的实例使用创建时的定义快照。修改流程不会改变运行中的实例。
                      </p>
                      {draft.version > 0 && (
                        <button
                          className="danger-text"
                          disabled={busy}
                          onClick={() => {
                            if (
                              !confirm(
                                "删除这个未使用的工作流？有执行历史的工作流只能停用。",
                              )
                            )
                              return;
                            void act(async () => {
                              await api("/workflows/" + draft.id, {
                                method: "DELETE",
                              });
                              setDraft(null);
                              setDirty(false);
                              setToast("工作流已删除");
                              await refresh();
                            });
                          }}
                        >
                          <Trash2 size={14} />
                          删除未使用的工作流
                        </button>
                      )}
                    </>
                  )}
                </div>
              </aside>
            </div>
          </div>
        )}
        {section === "runs" && (
          <div className="page">
            <div className="page-title">
              <div>
                <span className="eyebrow">EVERY EXECUTION, VISIBLE</span>
                <h1>执行记录</h1>
                <p>追踪每一次触发、重试与完成，随时掌握流程状态。</p>
              </div>
              <button className="secondary" onClick={() => void act(refresh)}>
                <RefreshCw size={15} />
                刷新
              </button>
            </div>
            <div className="section-title">
              <h2>实例列表</h2>
              <select
                aria-label="筛选执行状态"
                value={runFilter}
                onChange={(e) => {
                  setRunFilter(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">全部状态</option>
                {[
                  "queued",
                  "running",
                  "waiting",
                  "succeeded",
                  "failed",
                  "cancelled",
                ].map((v) => (
                  <option key={v} value={v}>
                    {labels[v]}
                  </option>
                ))}
              </select>
            </div>
            <div className="run-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>工作流 / 实例 ID</th>
                    <th>状态</th>
                    <th>触发来源</th>
                    <th>步骤进度</th>
                    <th>创建时间</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => {
                        setDetail(null);
                        setDetailID(r.id);
                        setDetailStep("");
                      }}
                    >
                      <td>
                        <strong>{r.definition.name}</strong>
                        <small className="mono">{r.id.slice(0, 16)}</small>
                      </td>
                      <td>
                        <Badge status={r.status} />
                      </td>
                      <td>
                        <span className="source-tag">
                          {r.source.startsWith("replay:") ? "replay" : r.source}
                        </span>
                      </td>
                      <td>
                        {
                          Object.values(r.steps).filter((s) =>
                            [
                              "succeeded",
                              "failed",
                              "skipped",
                              "cancelled",
                            ].includes(s.status),
                          ).length
                        }
                        <span className="text-slate-400">
                          {" "}
                          / {r.definition.steps.length}
                        </span>
                      </td>
                      <td className="text-xs text-slate-500">
                        {formatTime(r.created_at)}
                      </td>
                      <td>
                        <ArrowUpRight size={16} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!runs.length && (
                <div className="empty-state">
                  <Activity size={32} />
                  <h3>还没有执行记录</h3>
                  <p>运行一个工作流，执行过程将在这里实时呈现。</p>
                </div>
              )}
            </div>
            <div className="pagination">
              <span>第 {page + 1} 页 · 每页 30 条</span>
              <div className="flex gap-2">
                <button
                  className="secondary small"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  上一页
                </button>
                <button
                  className="secondary small"
                  disabled={runs.length < 30}
                  onClick={() => setPage(page + 1)}
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
        )}
        {section === "integrations" && (
          <div className="page integrations">
            <div className="page-title">
              <div>
                <span className="eyebrow">ONE ENGINE. MANY POSSIBILITIES.</span>
                <h1>连接你的应用</h1>
                <p>让工作流成为产品、服务与 AI Agent 的执行层。</p>
              </div>
            </div>
            <div className="integration-grid">
              {[
                {
                  icon: Globe2,
                  title: "API / Webhook",
                  description: "从应用、CI/CD 或第三方平台触发流程。",
                  tag: "HTTP + JSON",
                },
                {
                  icon: Clock3,
                  title: "定时与延迟",
                  description: "配置带时区的 Cron，或指定单次执行时间。",
                  tag: "CRON + SCHEDULED_AT",
                },
                {
                  icon: ArrowDownLeft,
                  title: "异步任务回调",
                  description: "分发长耗时任务，由外部服务报告完成状态。",
                  tag: "CALLBACK",
                },
              ].map(({ icon: Icon, title, description, tag }) => (
                <article className="integration-card" key={title}>
                  <Icon size={25} />
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <code>{tag}</code>
                </article>
              ))}
            </div>
            <div className="code-panel">
              <div>
                <Terminal size={17} />
                触发工作流<span>cURL</span>
                <button
                  aria-label="复制调用示例"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      `curl -X POST ${location.origin}/api/v1/workflows/hello-workflow/runs -H 'Authorization: Bearer YOUR_TOKEN' -H 'Content-Type: application/json' -H 'Idempotency-Key: unique-business-key' -d '{"input":{"topic":"AI 工作流"}}'`,
                    );
                    setToast("调用示例已复制");
                  }}
                >
                  <Copy size={15} />
                </button>
              </div>
              <pre>{`curl -X POST ${location.origin}/api/v1/workflows/hello-workflow/runs \\\n  -H 'Authorization: Bearer YOUR_TOKEN' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Idempotency-Key: unique-business-key' \\\n  -d '{"input": {"topic": "AI 工作流"}}'`}</pre>
            </div>
            <div className="api-list">
              <h2>核心接口</h2>
              {[
                [
                  "POST",
                  "/api/v1/workflows/{id}/runs",
                  "创建执行实例，支持 input、priority、scheduled_at",
                ],
                [
                  "POST",
                  "/api/v1/hooks/{id}",
                  "Webhook 触发，同样使用 Bearer 鉴权与 input 包装",
                ],
                ["GET", "/api/v1/runs/{id}", "查询状态、步骤输出及错误"],
                [
                  "GET",
                  "/api/v1/runs/{id}/events?after=0",
                  "按游标读取事件日志",
                ],
                ["POST", "/api/v1/runs/{id}/cancel", "取消实例"],
                ["POST", "/api/v1/runs/{id}/replay", "按原定义快照重跑"],
                [
                  "POST",
                  "/api/v1/callbacks/{token}",
                  "提交异步结果：status、output、error",
                ],
              ].map(([method, path, desc]) => (
                <div key={path}>
                  <code className={method === "POST" ? "post" : "get"}>
                    {method}
                  </code>
                  <code>{path}</code>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
            <p className="info-note">
              <ShieldCheck size={16} />
              每次部署是一个独立工作空间。API 使用共享 Bearer
              Token；回调使用按尝试生成的限时令牌。环境密钥通过
              FLOWFORGE_SECRET_ 前缀注入。
            </p>
          </div>
        )}
      </main>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          void importWorkflow(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {runDialog && (
        <div className="modal-backdrop" onClick={() => setRunDialog(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="运行工作流"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">NEW EXECUTION</span>
                <h2>运行工作流</h2>
              </div>
              <button
                aria-label="关闭运行对话框"
                onClick={() => setRunDialog(null)}
              >
                <X size={20} />
              </button>
            </div>
            <p>
              {runDialog.name}{" "}
              <span className="text-slate-400">· v{runDialog.version}</span>
            </p>
            <Field
              label="输入数据（JSON）"
              hint="步骤通过 {{input.字段名}} 引用这些数据。"
            >
              <textarea
                className="code"
                rows={8}
                spellCheck={false}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
            </Field>
            <Field
              label="计划执行时间（可选）"
              hint="留空立即入队；时间使用当前浏览器时区。"
            >
              <input
                type="datetime-local"
                value={runAt}
                onChange={(e) => setRunAt(e.target.value)}
              />
            </Field>
            <div className="modal-footer">
              <button className="secondary" onClick={() => setRunDialog(null)}>
                取消
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void run()}
              >
                {busy ? (
                  <Loader2 className="animate-spin" size={15} />
                ) : (
                  <Play size={15} />
                )}
                开始执行
              </button>
            </div>
          </div>
        </div>
      )}
      {detailID && (
        <div className="drawer-backdrop" onClick={() => setDetailID("")}>
          <section
            className="run-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="执行详情"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <span className="eyebrow">EXECUTION DETAIL</span>
                <h2>{detail?.definition.name || "加载执行实例…"}</h2>
              </div>
              <button aria-label="关闭执行详情" onClick={() => setDetailID("")}>
                <X size={20} />
              </button>
            </div>
            {detail ? (
              <>
                <div className="run-summary">
                  <Badge status={detail.status} />
                  <code>{detail.id.slice(0, 16)}</code>
                  <span>v{detail.definition.version}</span>
                  <div className="ml-auto flex gap-2">
                    {terminal(detail.status) ? (
                      <button
                        className="secondary small"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            const r = await api<Run>(
                              `/runs/${detail.id}/replay`,
                              {
                                method: "POST",
                                headers: {
                                  "Idempotency-Key": crypto.randomUUID(),
                                },
                              },
                            );
                            setDetail(null);
                            setDetailID(r.id);
                            setDetailStep("");
                            await refresh();
                          })
                        }
                      >
                        <RefreshCw size={13} />
                        重跑
                      </button>
                    ) : (
                      <button
                        className="secondary small"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await api(`/runs/${detail.id}/cancel`, {
                              method: "POST",
                            });
                            setToast("已取消执行");
                            await refresh();
                          })
                        }
                      >
                        <X size={13} />
                        取消执行
                      </button>
                    )}
                  </div>
                </div>
                <div className="run-times">
                  <span>
                    创建时间<strong>{formatTime(detail.created_at)}</strong>
                  </span>
                  <span>
                    完成时间<strong>{formatTime(detail.finished_at)}</strong>
                  </span>
                  <span>
                    来源<strong>{detail.source.split(":")[0]}</strong>
                  </span>
                </div>
                {detail.error && (
                  <div className="error-inline mx-6">{detail.error}</div>
                )}
                <Graph
                  workflow={detail.definition}
                  selected={detailStep}
                  onSelect={setDetailStep}
                  states={detail.steps}
                />
                <div className="drawer-content">
                  {detailStep && detail.steps[detailStep] && (
                    <div className="output-panel">
                      <h3>
                        {
                          detail.definition.steps.find(
                            (s) => s.id === detailStep,
                          )?.name
                        }
                        <Badge status={detail.steps[detailStep].status} />
                      </h3>
                      <small>
                        尝试次数：{detail.steps[detailStep].attempts}
                      </small>
                      {detail.steps[detailStep].error && (
                        <p className="text-red-600 text-xs">
                          {detail.steps[detailStep].error}
                        </p>
                      )}
                      <pre>
                        {pretty(detail.steps[detailStep].output ?? null)}
                      </pre>
                    </div>
                  )}
                  <details>
                    <summary>输入数据</summary>
                    <pre className="input-preview">{pretty(detail.input)}</pre>
                  </details>
                  <h3 className="events-title">
                    执行时间线 <span>{events.length}</span>
                  </h3>
                  <div className="timeline">
                    {events.map((e) => (
                      <div
                        key={e.id}
                        className={
                          e.type.includes("failed") ? "event-failed" : ""
                        }
                      >
                        <i />
                        <div>
                          <strong>
                            {e.step_id || "流程"}
                            <span>{e.type}</span>
                          </strong>
                          <p>{e.message || "完成"}</p>
                        </div>
                        <time>
                          {new Date(e.created_at).toLocaleTimeString("zh-CN", {
                            hour12: false,
                          })}
                        </time>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <Loader2 className="animate-spin" />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: number | string;
  note: string;
  icon: ReactNode;
}) {
  return (
    <div className="stat-card">
      <div>
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
