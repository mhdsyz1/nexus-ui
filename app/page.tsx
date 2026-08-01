"use client";

import { QuantProviders } from "@/lib/quant/providers";
import { QuantTerminalShell } from "@/components/terminal/QuantTerminalShell";
import { TelemetryMatrix } from "@/components/terminal/TelemetryMatrix";
import { ActivePositionTheater } from "@/components/terminal/ActivePositionTheater";
import { SignalQueue } from "@/components/terminal/SignalQueue";
import { FailsafePanel } from "@/components/terminal/FailsafePanel";
import { TripleFusionConsole } from "@/components/terminal/TripleFusionConsole";
import { PositionSizer } from "@/components/terminal/PositionSizer";
import { PerformanceGrid } from "@/components/terminal/PerformanceGrid";
import { EquityCurveChart } from "@/components/terminal/EquityCurveChart";
import { JournalStream } from "@/components/terminal/JournalStream";
import { AdminKeyDialog } from "@/components/terminal/AdminKeyDialog";
import { useTerminalStore } from "@/lib/quant/store";
import { useQueue } from "@/hooks/useQueue";
import { useAnalytics } from "@/hooks/useAnalytics";

/**
 * PHASE 4 BUILD — Analytics & Performance Engine (ANALYTICS view).
 * Remaining: the Phase 6 AuthVault polish + Sonner sweep.
 */

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

function AnalyticsView() {
  const { trades, journalByTrade, metrics, curve, hasData } = useAnalytics();
  return (
    <div className="flex flex-col gap-3 max-w-[1400px] mx-auto">
      <PerformanceGrid metrics={metrics} hasData={hasData} />
      <EquityCurveChart curve={curve} peakEquity={metrics.peakEquity} />
      <JournalStream trades={trades} journalByTrade={journalByTrade} />
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
      return <AnalyticsView />;
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
