import {
  Activity,
  Code2,
  GitBranch,
  Layers3,
  LogOut,
  Plus,
  RefreshCw,
} from "lucide-react";
import type { Section, Workflow } from "@/types";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

export function CommandPalette({
  open,
  onOpenChange,
  section,
  onSection,
  workflows,
  onOpenWorkflow,
  onCreate,
  onRefresh,
  onDisconnect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: Section;
  onSection: (section: Section) => void;
  workflows: Workflow[];
  onOpenWorkflow: (workflow: Workflow) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onDisconnect: () => void;
}) {
  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="搜索工作流、页面或操作…" />
      <CommandList>
        <CommandEmpty>没有找到匹配的结果。</CommandEmpty>
        <CommandGroup heading="导航">
          <CommandItem
            value="工作流 workflows"
            data-active={section === "workflows"}
            onSelect={() => run(() => onSection("workflows"))}
          >
            <Layers3 />
            工作流
          </CommandItem>
          <CommandItem
            value="执行记录 runs"
            onSelect={() => run(() => onSection("runs"))}
          >
            <Activity />
            执行记录
          </CommandItem>
          <CommandItem
            value="开发者接入 integrations api"
            onSelect={() => run(() => onSection("integrations"))}
          >
            <Code2 />
            开发者接入
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="操作">
          <CommandItem value="新建工作流 create" onSelect={() => run(onCreate)}>
            <Plus />
            新建工作流
          </CommandItem>
          <CommandItem value="刷新数据 refresh" onSelect={() => run(onRefresh)}>
            <RefreshCw />
            刷新数据
          </CommandItem>
          <CommandItem
            value="断开连接 disconnect logout"
            onSelect={() => run(onDisconnect)}
          >
            <LogOut />
            断开连接
          </CommandItem>
        </CommandGroup>
        {workflows.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="工作流">
              {workflows.map((workflow) => (
                <CommandItem
                  key={workflow.id}
                  value={`${workflow.name} ${workflow.id}`}
                  onSelect={() => run(() => onOpenWorkflow(workflow))}
                >
                  <GitBranch />
                  <span className="min-w-0 flex-1 truncate">
                    {workflow.name}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground/60">
                    v{workflow.version}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
      <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-2 text-[10px] text-muted-foreground/60">
        <span>↑↓ 选择 · ↵ 打开 · Esc 关闭</span>
        <span>FlowForge 控制台</span>
      </div>
    </CommandDialog>
  );
}
