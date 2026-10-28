import * as React from "react";
import { Toaster as SonnerToaster } from "sonner";

const toastStyle = {
  "--normal-bg": "rgba(13, 19, 34, 0.96)",
  "--normal-text": "#e9edf7",
  "--normal-border": "rgba(255, 255, 255, 0.1)",
  "--success-bg": "rgba(9, 32, 26, 0.96)",
  "--success-text": "#a7f3d0",
  "--success-border": "rgba(52, 211, 153, 0.28)",
  "--error-bg": "rgba(38, 12, 18, 0.96)",
  "--error-text": "#fecdd3",
  "--error-border": "rgba(251, 113, 133, 0.3)",
  "--border-radius": "12px",
} as unknown as React.CSSProperties;

function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="bottom-right"
      closeButton
      gap={10}
      offset={20}
      style={toastStyle}
      toastOptions={{
        classNames: {
          toast: "font-sans text-[13px] backdrop-blur-xl shadow-2xl",
          description: "text-[12px]",
          actionButton: "bg-white/10",
          closeButton: "border-white/10 bg-[#0d1322] text-muted-foreground",
        },
      }}
    />
  );
}

export { Toaster };
