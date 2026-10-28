import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ArrowDownLeft,
  Braces,
  Clock3,
  GitBranch,
  Globe2,
  Maximize2,
  Minus,
  Plus,
} from "lucide-react";
import type { Run, Step, Workflow } from "@/types";
import { labels, modeOf, typeNames } from "@/types";
import { cn } from "@/lib/utils";

const icons: Record<string, typeof Globe2> = {
  http: Globe2,
  transform: Braces,
  delay: Clock3,
  callback: ArrowDownLeft,
};

export function FlowGraph({
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
  const pan = useRef({ x: 0, y: 0, left: 0, top: 0, active: false });
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);
  const [hovered, setHovered] = useState("");
  const [vertical, setVertical] = useState(
    () =>
      workflow.steps.length > 5 ||
      (typeof window !== "undefined" && window.innerWidth < 768),
  );
  const markerID = "arrow" + useId().replace(/[:]/g, "");

  const depths = new Map<string, number>();
  const pending = new Set<string>();
  const depth = (id: string): number => {
    if (depths.has(id)) return depths.get(id)!;
    if (pending.has(id)) return 0;
    pending.add(id);
    const node = workflow.steps.find((step) => step.id === id);
    const value = node?.depends_on.length
      ? Math.min(127, Math.max(...node.depends_on.map((dep) => depth(dep) + 1)))
      : 0;
    depths.set(id, value);
    pending.delete(id);
    return value;
  };
  workflow.steps.forEach((step) => depth(step.id));
  const columns: Record<number, Step[]> = {};
  workflow.steps.forEach((step) => {
    const level = depths.get(step.id)!;
    (columns[level] ||= []).push(step);
  });
  const height = vertical
    ? Object.keys(columns).length * 150 + 20
    : Math.max(
        360,
        ...Object.values(columns).map((column) => column.length * 128 + 70),
      );
  const width = vertical
    ? Math.max(
        650,
        ...Object.values(columns).map((column) => column.length * 272 + 90),
      )
    : Math.max(650, Object.keys(columns).length * 272 + 80);

  const fit = useCallback(() => {
    if (!viewportRef.current) return;
    const viewport = viewportRef.current;
    const floor = viewport.clientWidth < 640 ? 0.55 : 0.3;
    setZoom(Math.max(floor, Math.min(1, (viewport.clientWidth - 24) / width)));
  }, [width]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    fit();
    return () => observer.disconnect();
  }, [fit]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      setZoom((value) =>
        Math.max(0.3, Math.min(1.5, value - event.deltaY * 0.0015)),
      );
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const positions = new Map(
    workflow.steps.map((step) => {
      const level = depths.get(step.id)!;
      const group = columns[level];
      return [
        step.id,
        {
          x: vertical
            ? (width - group.length * 272) / 2 + group.indexOf(step) * 272 + 27
            : 42 + level * 272,
          y: vertical
            ? 42 + level * 150
            : (height - group.length * 128) / 2 +
              group.indexOf(step) * 128 +
              16,
        },
      ];
    }),
  );

  const isHot = (a: string, b: string) =>
    hovered === a || hovered === b || selected === a || selected === b;

  return (
    <div className="graph-shell">
      <div className="graph-tools">
        <button
          type="button"
          aria-label="缩小画布"
          onClick={() => setZoom((value) => Math.max(0.3, value - 0.1))}
        >
          <Minus className="size-3" />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          aria-label="放大画布"
          onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))}
        >
          <Plus className="size-3" />
        </button>
        <i className="mx-1 h-4 w-px bg-white/10" aria-hidden="true" />
        <button type="button" aria-label="适应画布" onClick={fit}>
          <Maximize2 className="size-3" />
        </button>
        <button
          type="button"
          aria-label={vertical ? "切换为横向布局" : "切换为纵向布局"}
          onClick={() => setVertical((value) => !value)}
        >
          <GitBranch
            className="size-3"
            style={{ transform: vertical ? "rotate(90deg)" : undefined }}
          />
        </button>
      </div>

      <div
        ref={viewportRef}
        className={cn("graph-scroll dot-grid", panning && "panning")}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          if ((event.target as HTMLElement).closest(".flow-node")) return;
          const element = viewportRef.current;
          if (!element) return;
          pan.current = {
            x: event.clientX,
            y: event.clientY,
            left: element.scrollLeft,
            top: element.scrollTop,
            active: true,
          };
          element.setPointerCapture(event.pointerId);
          setPanning(true);
        }}
        onPointerMove={(event) => {
          if (!pan.current.active) return;
          const element = viewportRef.current;
          if (!element) return;
          element.scrollLeft =
            pan.current.left - (event.clientX - pan.current.x);
          element.scrollTop = pan.current.top - (event.clientY - pan.current.y);
        }}
        onPointerUp={() => {
          pan.current.active = false;
          setPanning(false);
        }}
        onPointerCancel={() => {
          pan.current.active = false;
          setPanning(false);
        }}
      >
        <div
          className="graph-stage"
          style={{ width: width * zoom, height: height * zoom }}
        >
          <div
            className={cn("graph", vertical ? "vertical" : "horizontal")}
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
                  id={markerID}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 0 0 L 10 5 L 0 10 z"
                    fill="rgba(148,163,184,.45)"
                  />
                </marker>
                <marker
                  id={markerID + "hot"}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(167,139,250,.9)" />
                </marker>
              </defs>
              {workflow.steps.flatMap((step) =>
                step.depends_on.map((dependency, edgeIndex) => {
                  const from = positions.get(dependency);
                  const to = positions.get(step.id);
                  if (!from || !to) return null;
                  const x1 = vertical ? from.x + 109 : from.x + 218;
                  const y1 = vertical ? from.y + 82 : from.y + 41;
                  const x2 = vertical ? to.x + 109 : to.x;
                  const y2 = vertical ? to.y : to.y + 41;
                  const skip =
                    depths.get(step.id)! - depths.get(dependency)! > 1;
                  const lane = 16 + (edgeIndex % 3) * 10;
                  // 跨层依赖走外侧通道，避免穿过中间节点。
                  const curve = vertical
                    ? skip
                      ? `M${x1},${y1} L${x1},${y1 + 24} L${lane},${y1 + 24} L${lane},${y2 - 20} L${x2},${y2 - 20} L${x2},${y2}`
                      : `M${x1},${y1} C${x1},${y1 + 32} ${x2},${y2 - 32} ${x2},${y2}`
                    : skip
                      ? `M${x1},${y1} L${x1 + 24},${y1} L${x1 + 24},${lane} L${x2 - 20},${lane} L${x2 - 20},${y2} L${x2},${y2}`
                      : `M${x1},${y1} C${x1 + 32},${y1} ${x2 - 32},${y2} ${x2},${y2}`;
                  const hot = isHot(dependency, step.id);
                  return (
                    <path
                      key={`${dependency}-${step.id}`}
                      d={curve}
                      className={cn("edge", hot && "hot")}
                      markerEnd={`url(#${markerID}${hot ? "hot" : ""})`}
                    />
                  );
                }),
              )}
            </svg>

            {workflow.steps.map((step, index) => {
              const Icon = icons[step.type] || Braces;
              const position = positions.get(step.id)!;
              const status = states?.[step.id]?.status;
              return (
                <button
                  key={step.id}
                  type="button"
                  data-step-id={step.id}
                  className={cn(
                    "flow-node",
                    selected === step.id && "selected",
                    status || "",
                  )}
                  style={{ left: position.x, top: position.y }}
                  onClick={() => onSelect(step.id)}
                  onDoubleClick={fit}
                  onMouseEnter={() => setHovered(step.id)}
                  onMouseLeave={() => setHovered("")}
                  title={step.id}
                >
                  <span className="node-icon" data-type={step.type}>
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="node-content">
                    <strong>{step.name}</strong>
                    <small>
                      {status ? (
                        <i className={cn("node-status", status)} />
                      ) : null}
                      {status ? labels[status] : typeNames[step.type]}
                    </small>
                  </span>
                  <span className="node-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className={cn("execution-mode", modeOf(step))}>
                    {modeOf(step) === "async" ? "异步" : "同步"}
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
