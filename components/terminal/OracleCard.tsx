"use client";

import { Target, Rocket, Shield, MapPin, Zap } from "lucide-react";
import type { QueueItem } from "@/lib/quant/types";

/**
 * OracleCard — premium TP1/TP2 signal presentation.
 * REQUIRED WIRING (3 one-liners elsewhere):
 *   1. lib/quant/types.ts  → add `take_profit_1?: number;` to QueueItem
 *   2. hooks/useQueue.ts   → add `take_profit_1` to the SELECT string
 *   3. hooks/useAnalytics.ts → add `take_profit_1` to the SELECT string
 * Pure presentation; all numbers come from the engine's geometry.
 */
export function OracleCard({ trade }: { trade: QueueItem }) {
  const isLong = trade.action.includes("BUY");
  const sideColor = isLong ? "var(--qt-long)" : "var(--qt-short)";
  const entry = trade.entry_price ?? 0;
  const sl = trade.stop_loss ?? 0;
  const tp1 = trade.take_profit_1 ?? 0;
  const tp2 = trade.take_profit ?? 0;
  const risk = Math.abs(entry - sl);
  const r1 = risk > 0 && tp1 > 0 ? Math.abs(tp1 - entry) / risk : 0;
  const r2 = risk > 0 ? Math.abs(tp2 - entry) / risk : 0;
  const grade = trade.confidence ?? "N/A";

  const Level = ({
    icon: Icon, label, price, note, color,
  }: { icon: typeof Target; label: string; price: number; note: string; color: string }) => (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--qt-border)" }}>
      <span className="qt-num flex items-center gap-2 text-[10px] font-bold" style={{ color }}>
        <Icon size={13} /> {label}
      </span>
      <span className="text-right">
        <span className="qt-num text-[13px] font-bold block" style={{ color: "var(--qt-text)" }}>
          ${price.toFixed(2)}
        </span>
        <span className="qt-num text-[8.5px]" style={{ color: "var(--qt-text-faint)" }}>{note}</span>
      </span>
    </div>
  );

  return (
    <article
      className="qt-card overflow-hidden max-w-sm w-full"
      style={{ borderColor: sideColor }}
      aria-label={`${isLong ? "Long" : "Short"} signal ${trade.ticker}`}
    >
      {/* Header band */}
      <header
        className="flex items-center justify-between px-4 py-3"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${sideColor} 16%, var(--qt-surface)) 0%, var(--qt-surface) 70%)`,
          borderBottom: `1px solid ${sideColor}`,
        }}
      >
        <div className="flex flex-col">
          <span className="qt-num text-[13px] font-bold tracking-wide">{trade.ticker}</span>
          <span className="qt-num text-[9px]" style={{ color: "var(--qt-text-muted)" }}>
            {trade.timeframe ?? "—"} · {trade.structure ?? "—"}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className="qt-num px-2.5 py-1 rounded-md text-[11px] font-bold tracking-[0.14em]"
            style={{
              background: `color-mix(in srgb, ${sideColor} 15%, transparent)`,
              color: sideColor,
              border: `1px solid ${sideColor}`,
            }}
          >
            {isLong ? "🟢 LONG" : "🔴 SHORT"}
          </span>
          <span
            className="qt-num text-[9px] font-bold"
            style={{ color: grade.startsWith("A") ? "var(--qt-long)" : "var(--qt-warn)" }}
          >
            {grade}{trade.score != null ? ` · ${trade.score}/100` : ""}
          </span>
        </div>
      </header>

      {/* Level ladder */}
      <div className="px-4 py-1">
        <Level icon={MapPin} label="ENTRY" price={entry} note="engine zone" color="var(--qt-accent)" />
        {tp1 > 0 && (
          <Level icon={Target} label="TP1" price={tp1} note={`${r1.toFixed(1)}R · bank 50% · SL → BE`} color="var(--qt-long)" />
        )}
        <Level icon={Rocket} label="TP2" price={tp2} note={`${r2.toFixed(1)}R · runner`} color="var(--qt-long)" />
        <Level icon={Shield} label="STOP" price={sl} note="spread-compensated" color="var(--qt-short)" />
      </div>

      {/* Risk distribution strip */}
      {risk > 0 && tp1 > 0 && (
        <div className="px-4 pb-2">
          <div className="flex h-1.5 rounded-full overflow-hidden">
            <span style={{ flexGrow: 1, background: "rgb(244 63 94 / 0.55)" }} />
            <span style={{ flexGrow: r1, background: "rgb(16 185 129 / 0.35)" }} />
            <span style={{ flexGrow: Math.max(r2 - r1, 0.1), background: "rgb(16 185 129 / 0.6)" }} />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="qt-num text-[8px]" style={{ color: "var(--qt-short)" }}>−1R</span>
            <span className="qt-num text-[8px]" style={{ color: "var(--qt-long)" }}>TP1 {r1.toFixed(1)}R</span>
            <span className="qt-num text-[8px]" style={{ color: "var(--qt-long)" }}>TP2 {r2.toFixed(1)}R</span>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer
        className="flex items-center justify-center gap-1.5 py-2"
        style={{ background: "var(--qt-surface-2)", borderTop: "1px solid var(--qt-border)" }}
      >
        <Zap size={10} style={{ color: "var(--qt-accent)" }} />
        <span className="qt-num text-[8.5px] font-bold tracking-[0.18em]" style={{ color: "var(--qt-text-muted)" }}>
          POWERED BY NEXUS A.I.
        </span>
      </footer>
    </article>
  );
}
