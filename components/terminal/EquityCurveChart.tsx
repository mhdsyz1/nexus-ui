"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CurvePoint } from "@/hooks/useAnalytics";

function CurveTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: CurvePoint }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const isStart = p.status === "START";
  const pnlColor = p.pnl >= 0 ? "var(--qt-long)" : "var(--qt-short)";

  return (
    <div
      className="qt-card p-2.5 flex flex-col gap-1"
      style={{ background: "var(--qt-surface-2)", borderColor: "var(--qt-border-strong)" }}
    >
      <span className="qt-num text-[9px]" style={{ color: "var(--qt-text-faint)" }}>
        {isStart ? "Ledger start (reconstructed)" : new Date(p.dateIso).toISOString().slice(0, 16).replace("T", " ") + " UTC"}
      </span>
      <span className="qt-num text-[12px] font-bold">${p.balance.toFixed(2)}</span>
      {!isStart && (
        <>
          <span className="qt-num text-[10px]" style={{ color: pnlColor }}>
            {p.action} · {p.status} · {p.pnl >= 0 ? "+" : "−"}${Math.abs(p.pnl).toFixed(2)}
          </span>
          <span className="qt-num text-[9px]" style={{ color: "var(--qt-text-muted)" }}>
            {p.r !== null ? `${p.r >= 0 ? "+" : ""}${p.r.toFixed(2)}R geometric` : "R unavailable (no geometry)"}
          </span>
        </>
      )}
    </div>
  );
}

export function EquityCurveChart({ curve, peakEquity }: { curve: CurvePoint[]; peakEquity: number }) {
  if (curve.length < 2) {
    return (
      <section className="qt-card flex flex-col items-center gap-1.5 py-10">
        <span className="qt-label">Equity curve</span>
        <span className="qt-num text-[10px]" style={{ color: "var(--qt-text-faint)" }}>
          The curve draws from the first resolved trade onward
        </span>
      </section>
    );
  }

  return (
    <section className="qt-card p-4 flex flex-col gap-2" aria-label="Equity curve">
      <div className="flex items-center justify-between">
        <span className="qt-label" style={{ color: "var(--qt-text)" }}>Equity curve</span>
        <span className="qt-num text-[9px]" style={{ color: "var(--qt-text-faint)" }}>
          reconstructed from realized PnL · manual equity adjustments shift pre-adjustment history
        </span>
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={curve} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="qtEquityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--qt-accent)" stopOpacity={0.32} />
                <stop offset="100%" stopColor="var(--qt-accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--qt-border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--qt-text-faint)", fontSize: 9, fontFamily: "var(--qt-font-data)" }}
              axisLine={{ stroke: "var(--qt-border)" }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: "var(--qt-text-faint)", fontSize: 9, fontFamily: "var(--qt-font-data)" }}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            />
            <Tooltip content={<CurveTooltip />} cursor={{ stroke: "var(--qt-border-strong)" }} />
            <ReferenceLine
              y={peakEquity}
              stroke="var(--qt-long)"
              strokeDasharray="5 4"
              strokeOpacity={0.7}
              label={{
                value: `PEAK $${peakEquity.toFixed(2)}`,
                position: "insideTopRight",
                fill: "var(--qt-long)",
                fontSize: 9,
                fontFamily: "var(--qt-font-data)",
              }}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="var(--qt-accent)"
              strokeWidth={1.75}
              fill="url(#qtEquityFill)"
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 3.5, fill: "var(--qt-accent)", stroke: "var(--qt-bg)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
