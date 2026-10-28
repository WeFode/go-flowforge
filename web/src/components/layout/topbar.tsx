import { Menu, RefreshCw, Search } from "lucide-react";
import type { Section } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const sectionNames: Record<Section, string> = {
  workflows: "工作流",
  runs: "执行记录",
  integrations: "开发者接入",
};

export function Topbar({
  section,
  workers,
  busy,
  onRefresh,
  onOpenPalette,
  onOpenNav,
  onDisconnect,
}: {
  section: Section;
  workers: number;
  busy: boolean;
  onRefresh: () => void;
  onOpenPalette: () => void;
  onOpenNav: () => void;
  onDisconnect: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] bg-[#06080f]/70 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          aria-label="打开导航"
          onClick={onOpenNav}
        >
          <Menu className="size-4" />
        </Button>
        <div className="flex min-w-0 items-center gap-2.5 text-[11px] text-muted-foreground/70">
          <span className="hidden shrink-0 sm:inline">工作空间</span>
          <span className="hidden text-white/20 sm:inline">/</span>
          <strong className="truncate text-[12px] font-medium text-secondary-foreground">
            {sectionNames[section]}
          </strong>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2.5">
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="搜索或跳转"
          className="hidden h-8 items-center gap-2 rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 text-[11px] text-muted-foreground transition-colors hover:border-white/15 hover:bg-white/[0.06] hover:text-secondary-foreground md:flex"
        >
          <Search className="size-3.5" />
          <span>搜索或跳转</span>
          <kbd className="ml-6 rounded border border-white/10 bg-white/[0.05] px-1.5 py-px font-mono text-[9px] text-muted-foreground">
            Ctrl K
          </kbd>
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="搜索或跳转"
          className="md:hidden"
          onClick={onOpenPalette}
        >
          <Search className="size-4" />
        </Button>

        <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-2.5 py-1 text-[10px] text-emerald-200 sm:flex">
          <i className="size-1.5 rounded-full bg-emerald-400 animate-pulse-soft" />
          {workers} 个 Worker
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="刷新数据"
              onClick={onRefresh}
            >
              <RefreshCw className={cn("size-4", busy && "animate-spin")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>刷新数据</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="账户菜单"
              className="grid size-8 place-items-center rounded-full border border-white/10 bg-[image:var(--gradient-primary)] text-[10px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
            >
              FF
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>默认工作空间</DropdownMenuLabel>
            <div className="px-2.5 pb-2 text-[11px] text-muted-foreground">
              独立部署 · 共享 Bearer Token
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDisconnect}
              className="text-rose-200 focus:text-rose-100"
            >
              断开连接
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
