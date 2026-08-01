"use client";

import { TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";
import type { PerformanceMetrics } from "@/hooks/useAnalytics";

type Trend = "up" | "down" | "flat";

function MetricCard({
  label,
  value,
  sub,
  trend,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  trend?: Trend;
  accent?: string;
}) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor =
    trend === "up" ? "var(--qt-long)" : trend === "down" ? "var(--qt-short)" : "var(--qt-text-faint)";

  return (
    <div className="qt-card p-3 flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between gap-1">
        <span className="qt-label truncate">{label}</span>
        {trend && <TrendIcon size={12} className="shrink-0" style={{ color: trendColor }} />}
      </div>
      <span className="qt-num text-lg font-bold leading-tight truncate" style={{ color: accent ?? "var(--qt-text)" }}>
        {value}
      </span>
      {sub && (
        <span className="qt-num text-[9px] truncate" style={{ color: "var(--qt-text-faint)" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

export function PerformanceGrid({ metrics, hasData }: { metrics: PerformanceMetrics; hasData: boolean }) {
  if (!hasData) {
    return (
      <section className="qt-card flex flex-col items-center gap-1.5 py-8">
        <BarChart3 size={16} style={{ color: "var(--qt-text-faint)" }} />
        <span className="qt-label">Performance engine</span>
        <span className="qt-num text-[10px]" style={{ color: "var(--qt-text-faint)" }}>
          Metrics populate after the first resolved trade — fresh ledger detected
        </span>
      </section>
    );
  }

  const m = metrics;
  const pnlPos = m.netPnl >= 0;
  const pf = m.profitFactor;

  return (
    <section aria-label="Performance metrics" className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-2">
      <MetricCard
        label="Net PnL"
        value={`${pnlPos ? "+" : "−"}$${Math.abs(m.netPnl).toFixed(2)}`}
        accent={pnlPos ? "var(--qt-long)" : "var(--qt-short)"}
        trend={pnlPos ? "up" : "down"}
        sub={`from $${m.startEquity.toFixed(2)} start`}
      />
      <MetricCard
        label="Win rate"
        value={`${m.winRatePct.toFixed(1)}%`}
        accent={m.winRatePct >= 50 ? "var(--qt-long)" : "var(--qt-warn)"}
        trend={m.winRatePct >= 50 ? "up" : "down"}
        sub={`${m.wins}W · ${m.losses}L · ${m.breakevens}BE`}
      />
      <MetricCard
        label="Profit factor"
        value={pf === null ? "∞" : pf.toFixed(2)}
        accent={pf === null || pf >= 1.5 ? "var(--qt-long)" : pf >= 1 ? "var(--qt-warn)" : "var(--qt-short)"}
        trend={pf === null || pf >= 1 ? "up" : "down"}
        sub={pf === null ? "no losing trades yet" : "gross win ÷ gross loss"}
      />
      <MetricCard
        label="Expectancy"
        value={`${m.expectancyUsd >= 0 ? "+" : "−"}$${Math.abs(m.expectancyUsd).toFixed(2)}`}
        accent={m.expectancyUsd >= 0 ? "var(--qt-long)" : "var(--qt-short)"}
        trend={m.expectancyUsd >= 0 ? "up" : "down"}
        sub="per trade, dollar basis"
      />
      <MetricCard
        label="Avg R"
        value={m.avgR === null ? "—" : `${m.avgR >= 0 ? "+" : ""}${m.avgR.toFixed(2)}R`}
        accent={m.avgR !== null && m.avgR >= 0 ? "var(--qt-long)" : "var(--qt-short)"}
        trend={m.avgR === null ? "flat" : m.avgR >= 0 ? "up" : "down"}
        sub="geometric R · planned SL/TP basis"
      />
      <MetricCard
        label="Max drawdown"
        value={`−$${m.maxDrawdownUsd.toFixed(2)}`}
        accent={m.maxDrawdownUsd > 0 ? "var(--qt-short)" : "var(--qt-text)"}
        trend={m.maxDrawdownUsd > 0 ? "down" : "flat"}
        sub={`${m.maxDrawdownPct.toFixed(1)}% off peak $${m.peakEquity.toFixed(2)}`}
      />
      <MetricCard
        label="Total trades"
        value={String(m.totalTrades)}
        trend="flat"
        sub={`avg win $${m.avgWinUsd.toFixed(2)} · avg loss $${m.avgLossUsd.toFixed(2)}`}
      />
    </section>
  );
}
