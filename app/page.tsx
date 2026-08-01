"use client";

import { QuantProviders } from "@/lib/quant/providers";
import { QuantTerminalShell } from "@/components/terminal/QuantTerminalShell";
import { TelemetryMatrix } from "@/components/terminal/TelemetryMatrix";
import { useTerminalStore } from "@/lib/quant/store";

/**
 * PHASE 1 BUILD — Foundation, Shell, Telemetry.
 *
 * Phases still to land in their approved order:
 *   3. FailsafePanel      → CONTROLS view + embargo state in status chip
 *   4. PositionTheater +
 *      SignalQueue        → TERMINAL view, below telemetry
 *   5. TripleFusionConsole→ BURNER view
 *   6. AuthVault + Sonner → global
 *
 * Keep the legacy page as app/page-legacy.tsx until Phase 6 completes,
 * so accept/drop/close/kill actions remain reachable during the migration.
 */

function ReservedSlot({ title, phase }: { title: string; phase: number }) {
  return (
    <div
      className="qt-card flex flex-col items-center justify-center gap-1 py-10 border-dashed"
      style={{ borderStyle: "dashed", borderColor: "var(--qt-border-strong)" }}
    >
      <span className="qt-label">{title}</span>
      <span className="qt-num text-[10px]" style={{ color: "var(--qt-text-faint)" }}>
        Arrives in Phase {phase}
      </span>
    </div>
  );
}

function MainViewport() {
  const activeView = useTerminalStore((s) => s.activeView);

  switch (activeView) {
    case "TERMINAL":
      return (
        <div className="flex flex-col gap-4 max-w-[1400px] mx-auto">
          <TelemetryMatrix />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            <ReservedSlot title="Active Position Theater" phase={4} />
            <ReservedSlot title="Signal Queue" phase={4} />
          </div>
        </div>
      );
    case "BURNER":
      return <ReservedSlot title="Triple-Fusion Console" phase={5} />;
    case "ANALYTICS":
      return <ReservedSlot title="Equity Curve · Performance · Journal" phase={4} />;
    case "SIZER":
      return <ReservedSlot title="Position Sizer" phase={4} />;
    case "CONTROLS":
      return <ReservedSlot title="Failsafe Panel" phase={3} />;
  }
}

export default function QuantTerminal() {
  return (
    <QuantProviders>
      <QuantTerminalShell>
        <MainViewport />
      </QuantTerminalShell>
    </QuantProviders>
  );
}
