import { useEffect, useRef } from "react";

type HotkeyHandlers = {
  palette?: () => void;
  save?: () => void;
};

/** 全局快捷键：⌘K / Ctrl+K 打开命令面板，⌘S / Ctrl+S 保存当前草稿。 */
export function useHotkeys(handlers: HotkeyHandlers) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  }, [handlers]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        latest.current.palette?.();
      } else if (key === "s") {
        event.preventDefault();
        latest.current.save?.();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
