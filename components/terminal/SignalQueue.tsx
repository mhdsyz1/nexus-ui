"use client";

import { useEffect, useState } from "react";
import { Check, X as XIcon, Inbox } from "lucide-react";
import { useRiskConfig } from "@/hooks/useSupabaseReads";
import { useAcceptTrade, useDropTrade } from "@/hooks/useMutations";
import { AdminAuthError } from "@/lib/quant/adminFetch";
import { computePositionSize, riskPerLayer } from "@/lib/quant/constants";
import type { QueueItem } from "@/lib/quant/types";

/* The engine writes `lots` on the row (trading_state.compute_position_size).
   Show THAT, never a parallel calculation — the old tiered matrix computed
   0.02–0.05 while the engine sized 0.01, a 5x overtrade if followed. */
function rowLots(item: QueueItem, equity: number): { lots: number; layers: number; fromRow: boolean } {
  const written = Number(item.lots ?? 0);
  if (written > 0) {
    return { lots: written, layers: computePositionSize(equity).layers, fromRow: true };
  }
  return { ...computePositionSize(equity), fromRow: false };
}

function rrRatio(item: QueueItem): number | null {
  const entry = item.entry_price ?? (item.zone_low && item.zone_high ? (item.zone_low + item.zone_high) / 2 : null);
  if (!entry || !item.stop_loss || !item.take_profit) return null;
  const risk = Math.abs(entry - item.stop_loss);
  return risk > 0 ? Math.abs(item.take_profit - entry) / risk : null;
}

function useAge(sinceIso: string): string {
  const [label, setLabel] = useState("0s");
  useEffect(() => {
    const tick = () => {
      const sec = Math.max(0, Math.floor((Date.now() - new Date(sinceIso).getTime()) / 1000));
      setLabel(sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)}m` : `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sinceIso]);
  return label;
}

const GRADE_COLORS: Record<string, string> = {
  "A+": "var(--qt-long)",
  A: "var(--qt-long)",
  B: "var(--qt-warn)",
};

function PendingRow({
  item,
  equity,
  locked,
}: {
  item: QueueItem;
  equity: number;
  locked: boolean;
}) {
  const accept = useAcceptTrade();
  const drop = useDropTrade();
  const age = useAge(item.created_at);

  const isLong = item.action.includes("BUY");
  const sideColor = isLong ? "var(--qt-long)" : "var(--qt-short)";
  const grade = item.confidence ?? "N/A";
  const gradeColor = GRADE_COLORS[grade] ?? "var(--qt-text-muted)";
  const rr = rrRatio(item);
  const busy = accept.isPending || drop.isPending;
  const error = (accept.error ?? drop.error) as Error | null;

  return (
    <li
      className="rounded-lg p-3 flex flex-col gap-2 transition-opacity"
      style={{
        background: "var(--qt-surface-2)",
        border: "1px solid var(--qt-border)",
        opacity: busy ? 0.6 : 1,
      }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="qt-num px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ color: sideColor, border: `1px solid ${sideColor}` }}>
            {item.action}
          </span>
          <span className="qt-num text-[11px] font-bold">{item.ticker}</span>
          <span className="qt-num text-[9.5px] font-bold" style={{ color: gradeColor }} title={`Score ${item.score ?? "—"}/100`}>
            {grade}{item.score != null ? ` · ${item.score}` : ""}
          </span>
        </div>
        <span className="qt-num text-[9px]" style={{ color: "var(--qt-text-faint)" }}>{age} ago</span>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="qt-num text-[10px]" style={{ color: "var(--qt-text-muted)" }}>
          zone <span style={{ color: "var(--qt-text)" }}>{item.zone_low?.toFixed(2)}–{item.zone_high?.toFixed(2)}</span>
        </span>
        <span className="qt-num text-[10px]" style={{ color: "var(--qt-text-muted)" }}>
          SL <span style={{ color: "var(--qt-short)" }}>{item.stop_loss?.toFixed(2)}</span>
        </span>
        <span className="qt-num text-[10px]" style={{ color: "var(--qt-text-muted)" }}>
          TP <span style={{ color: "var(--qt-long)" }}>{item.take_profit?.toFixed(2)}</span>
        </span>
        {rr != null && (
          <span className="flex items-center gap-1" title={`Risk:reward 1:${rr.toFixed(1)}`}>
            <span className="relative w-12 h-1.5 rounded-full overflow-hidden" style={{ background: "rgb(244 63 94 / 0.35)" }}>
              <span className="absolute inset-y-0 right-0 rounded-full" style={{ width: `${(rr / (rr + 1)) * 100}%`, background: "var(--qt-long)" }} />
            </span>
            <span className="qt-num text-[9px]" style={{ color: "var(--qt-text-muted)" }}>1:{rr.toFixed(1)}</span>
          </span>
        )}
      </div>

      {/* Engine size — the value written to the ledger, not a re-derivation */}
      {(() => {
        const { lots, layers, fromRow } = rowLots(item, equity);
        const risk = item.entry_price && item.stop_loss ? riskPerLayer(item.entry_price, item.stop_loss, lots) : 0;
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="qt-num text-[9px] px-1.5 py-0.5 rounded" style={{ background: "var(--qt-surface-3)", color: "var(--qt-text-muted)" }}>
              <span style={{ color: "var(--qt-accent)" }}>{lots.toFixed(2)} lots</span> / layer
              {layers > 1 && <> · max {layers}</>}
            </span>
            {risk > 0 && (
              <span className="qt-num text-[9px] px-1.5 py-0.5 rounded" style={{ background: "var(--qt-surface-3)", color: "var(--qt-text-muted)" }}>
                risk <span style={{ color: "var(--qt-accent)" }}>${risk.toFixed(2)}</span> / layer
              </span>
            )}
            {!fromRow && (
              <span className="qt-num text-[9px]" style={{ color: "var(--qt-text-muted)" }}>
                (ladder estimate — engine has not written lots yet)
              </span>
            )}
          </div>
        );
      })()}

      {error && (
        <p className="qt-num text-[9.5px]" style={{ color: "var(--qt-short)" }}>
          {error instanceof AdminAuthError ? error.message : "Command failed — row restored."}
        </p>
      )}

      <div className="flex gap-2 pt-0.5">
        <button
          onClick={() => accept.mutate(item.id)}
          disabled={busy || locked}
          title={locked ? "Position lock active — close the open trade first" : "Accept and engage position lock"}
          className="qt-num flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[9.5px] font-bold tracking-wider disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)]"
          style={{ background: "rgb(16 185 129 / 0.12)", border: "1px solid var(--qt-long)", color: "var(--qt-long)" }}
        >
          <Check size={11} /> ACCEPT
        </button>
        <button
          onClick={() => drop.mutate(item.id)}
          disabled={busy}
          className="qt-num flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[9.5px] font-bold tracking-wider disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)]"
          style={{ border: "1px solid var(--qt-border-strong)", color: "var(--qt-text-muted)" }}
        >
          <XIcon size={11} /> DROP
        </button>
      </div>
    </li>
  );
}

const RESOLVED_COLORS: Record<string, string> = {
  WIN: "var(--qt-long)",
  LOSS: "var(--qt-short)",
  BREAKEVEN: "var(--qt-warn)",
  DROPPED: "var(--qt-text-faint)",
};

export function SignalQueue({
  pending,
  resolved,
  locked,
}: {
  pending: QueueItem[];
  resolved: QueueItem[];
  locked: boolean;
}) {
  const { config } = useRiskConfig();

  return (
    <section className="qt-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="qt-label" style={{ color: "var(--qt-text)" }}>Signal Queue</span>
        <span className="qt-num text-[9px]" style={{ color: "var(--qt-text-muted)" }}>
          {pending.length} pending
        </span>
      </div>

      {pending.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-6">
          <Inbox size={16} style={{ color: "var(--qt-text-faint)" }} />
          <span className="qt-num text-[10px]" style={{ color: "var(--qt-text-faint)" }}>
            No pending signals — the engine posts here when a setup clears the filter gauntlet
          </span>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {pending.map((item) => (
            <PendingRow key={item.id} item={item} equity={config.total_equity} locked={locked} />
          ))}
        </ul>
      )}

      {resolved.length > 0 && (
        <div className="pt-2" style={{ borderTop: "1px solid var(--qt-border)" }}>
          <span className="qt-label">Recent resolutions</span>
          <ul className="mt-1.5 flex flex-col gap-1">
            {resolved.slice(0, 5).map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <span className="qt-num text-[9.5px]" style={{ color: "var(--qt-text-muted)" }}>
                  {r.action} · {new Date(r.created_at).toISOString().slice(5, 16).replace("T", " ")}
                </span>
                <span className="qt-num text-[9.5px] font-bold" style={{ color: RESOLVED_COLORS[r.status] ?? "var(--qt-text-muted)" }}>
                  {r.status}
                  {r.realized_pnl ? ` ${Number(r.realized_pnl) >= 0 ? "+" : ""}$${Number(r.realized_pnl).toFixed(2)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
