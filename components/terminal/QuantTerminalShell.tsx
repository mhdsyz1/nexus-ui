"use client";

import type { ReactNode } from "react";
import {
  Activity,
  Flame,
  LineChart,
  Calculator,
  ShieldAlert,
  GraduationCap,
} from "lucide-react";
import { useTerminalStore } from "@/lib/quant/store";
import type { TerminalView } from "@/lib/quant/types";
import { SystemStatusBar } from "./SystemStatusBar";

const NAV: { view: TerminalView; label: string; icon: typeof Activity }[] = [
  { view: "TERMINAL", label: "Terminal", icon: Activity },
  { view: "BURNER", label: "Burner", icon: Flame },
  { view: "MENTOR", label: "Mentor", icon: GraduationCap },
  { view: "ANALYTICS", label: "Analytics", icon: LineChart },
  { view: "SIZER", label: "Sizer", icon: Calculator },
  { view: "CONTROLS", label: "Controls", icon: ShieldAlert },
];

function RailButton({
  view,
  label,
  icon: Icon,
  horizontal,
}: {
  view: TerminalView;
  label: string;
  icon: typeof Activity;
  horizontal?: boolean;
}) {
  const activeView = useTerminalStore((s) => s.activeView);
  const setActiveView = useTerminalStore((s) => s.setActiveView);
  const isActive = activeView === view;
  const isBurner = view === "BURNER";

  return (
    <button
      onClick={() => setActiveView(view)}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      className={[
        "group relative flex items-center justify-center gap-1 outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)] rounded-lg",
        horizontal ? "flex-col flex-1 py-2" : "flex-col w-full py-3",
        "transition-colors duration-150",
      ].join(" ")}
      style={{
        color: isActive
          ? isBurner
            ? "var(--qt-warn)"
            : "var(--qt-accent)"
          : "var(--qt-text-faint)",
      }}
    >
      {/* Active indicator: left edge on rail, top edge on mobile nav */}
      <span
        aria-hidden
        className={[
          "absolute rounded-full transition-opacity duration-200",
          horizontal
            ? "top-0 left-1/2 -translate-x-1/2 h-[2px] w-6"
            : "left-0 top-1/2 -translate-y-1/2 w-[2px] h-6",
        ].join(" ")}
        style={{
          background: isBurner ? "var(--qt-warn)" : "var(--qt-accent)",
          opacity: isActive ? 1 : 0,
        }}
      />
      <Icon size={19} strokeWidth={isActive ? 2.2 : 1.8} />
      <span className="text-[9px] font-semibold uppercase tracking-[0.1em]">
        {label}
      </span>
    </button>
  );
}

/**
 * Structural frame:
 *   StatusBar (fixed top) → CommandRail (left on md+, bottom on mobile)
 *   → scrollable viewport.
 */
export function QuantTerminalShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex flex-col h-dvh overflow-hidden"
      style={{
        background: "var(--qt-bg)",
        color: "var(--qt-text)",
        fontFamily: "var(--qt-font-ui)",
      }}
    >
      <SystemStatusBar />

      <div className="flex flex-1 min-h-0">
        {/* Desktop command rail */}
        <nav
          aria-label="Terminal sections"
          className="hidden md:flex flex-col items-center pt-2 shrink-0"
          style={{
            width: "var(--qt-rail-w)",
            background: "var(--qt-surface)",
            borderRight: "1px solid var(--qt-border)",
          }}
        >
          {NAV.map((n) => (
            <RailButton key={n.view} {...n} />
          ))}
        </nav>

        {/* Main viewport */}
        <main className="flex-1 min-w-0 overflow-y-auto p-3 md:p-5 pb-[calc(var(--qt-nav-h)+12px)] md:pb-5">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Terminal sections"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 flex"
        style={{
          height: "var(--qt-nav-h)",
          background: "var(--qt-surface)",
          borderTop: "1px solid var(--qt-border)",
        }}
      >
        {NAV.map((n) => (
          <RailButton key={n.view} {...n} horizontal />
        ))}
      </nav>
    </div>
  );
}
