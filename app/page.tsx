"use client";

import { QuantProviders } from "@/lib/quant/providers";
import { QuantTerminalShell } from "@/components/terminal/QuantTerminalShell";
import { TelemetryMatrix } from "@/components/terminal/TelemetryMatrix";
import { ActivePositionTheater } from "@/components/terminal/ActivePositionTheater";
import { SignalQueue } from "@/components/terminal/SignalQueue";
import { FailsafePanel } from "@/components/terminal/FailsafePanel";
import { TripleFusionConsole } from "@/components/terminal/TripleFusionConsole";
import { PositionSizer } from "@/components/terminal/PositionSizer";
import { AdminKeyDialog } from "@/components/terminal/AdminKeyDialog";
import { useTerminalStore } from "@/lib/quant/store";
import { useQueue } from "@/hooks/useQueue";

/**
 * PHASE 3 BUILD — TripleFusionConsole (BURNER) + PositionSizer (SIZER).
 * Remaining: Analytics view (equity curve / journal stream) and the
 * Phase 6 AuthVault polish + Sonner sweep.
 */

function ReservedSlot({ title, phase }: { title: string; phase: number }) {
  return (
    <div
      className="qt-card flex flex-col items-center justify-center gap-1 py-10"
      style={{ borderStyle: "dashed", borderColor: "var(--qt-border-strong)" }}
    >
      <span className="qt-label">{title}</span>
      <span className="qt-num text-[10px]" style={{ color: "var(--qt-text-faint)" }}>
        Arrives in Phase {phase}
      </span>
    </div>
  );
}

function TerminalView() {
  const { activeTrade, pending, resolved } = useQueue();
  return (
    <div className="flex flex-col gap-4 max-w-[1400px] mx-auto">
      <TelemetryMatrix />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 items-start">
        <ActivePositionTheater trade={activeTrade} />
        <SignalQueue pending={pending} resolved={resolved} locked={!!activeTrade} />
      </div>
    </div>
  );
}

function MainViewport() {
  const activeView = useTerminalStore((s) => s.activeView);

  switch (activeView) {
    case "TERMINAL":
      return <TerminalView />;
    case "BURNER":
      return <TripleFusionConsole />;
    case "ANALYTICS":
      return <ReservedSlot title="Equity Curve · Performance · Journal" phase={5} />;
    case "SIZER":
      return <PositionSizer />;
    case "CONTROLS":
      return <FailsafePanel />;
  }
}

export default function QuantTerminal() {
  return (
    <QuantProviders>
      <QuantTerminalShell>
        <MainViewport />
      </QuantTerminalShell>
      <AdminKeyDialog />
    </QuantProviders>
  );
}
