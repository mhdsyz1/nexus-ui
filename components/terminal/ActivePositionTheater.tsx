"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Crosshair, Lock, CircleDollarSign } from "lucide-react";
import { useSignalContext } from "@/hooks/useSupabaseReads";
import { useCloseTrade } from "@/hooks/useMutations";
import { AdminAuthError } from "@/lib/quant/adminFetch";
import type { QueueItem, TradeLayer } from "@/lib/quant/types";
import { QtDialog, qtInputClass, qtInputStyle } from "./QtDialog";

/* ---------- elapsed clock ---------- */
function useElapsed(sinceIso: string): string {
  const [label, setLabel] = useState("00:00");
  useEffect(() => {
    const tick = () => {
      const sec = Math.max(0, Math.floor((Date.now() - new Date(sinceIso).getTime()) / 1000));
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      const pad = (n: number) => String(n).padStart(2, "0");
      setLabel(h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sinceIso]);
  return label;
}

/* ---------- horizontal price track: SL — entry — TP with ref cursor ---------- */
function PriceTrack({ trade, refPrice }: { trade: QueueItem; refPrice: number | null }) {
  const reduced = useReducedMotion();
  const entry = trade.entry_price ?? 0;
  const sl = trade.stop_loss ?? 0;
  const tp = trade.take_profit ?? 0;
  const isLong = trade.action.includes("BUY");
  if (!entry || !sl || !tp) return null;

  const lo = Math.min(sl, tp);
  const hi = Math.max(sl, tp);
  const pad = (hi - lo) * 0.06;
  const toPct = (p: number) =>
    Math.min(100, Math.max(0, ((p - (lo - pad)) / (hi - lo + 2 * pad)) * 100));

  const risk = Math.abs(entry - sl);
  const rProgress =
    refPrice != null && risk > 0
      ? (isLong ? refPrice - entry : entry - refPrice) / risk
      : null;
  const rTarget = risk > 0 ? Math.abs(tp - entry) / risk : 0;

  const marker = (price: number, color: string, label: string, below?: boolean) => (
    <div
      className="absolute -translate-x-1/2 flex flex-col items-center"
      style={{ left: `${toPct(price)}%`, [below ? "top" : "bottom"]: "100%" } as React.CSSProperties}
    >
      {!below && <span className="qt-num text-[8.5px] font-bold mb-0.5" style={{ color }}>{label} {price.toFixed(2)}</span>}
      <span className="w-px h-2" style={{ background: color }} />
      {below && <span className="qt-num text-[8.5px] font-bold mt-0.5" style={{ color }}>{label} {price.toFixed(2)}</span>}
    </div>
  );

  return (
    <div className="pt-5 pb-6">
      <div className="relative h-2.5 rounded-full" style={{ background: "var(--qt-surface-2)" }}>
        {/* loss / profit shading around entry */}
        <span
          className="absolute inset-y-0 rounded-l-full"
          style={{
            left: `${toPct(Math.min(entry, sl))}%`,
            width: `${Math.abs(toPct(entry) - toPct(sl))}%`,
            background: "rgb(244 63 94 / 0.22)",
          }}
        />
        <span
          className="absolute inset-y-0 rounded-r-full"
          style={{
            left: `${toPct(Math.min(entry, tp))}%`,
            width: `${Math.abs(toPct(tp) - toPct(entry))}%`,
            background: "rgb(16 185 129 / 0.18)",
          }}
        />
        {marker(sl, "var(--qt-short)", "SL", true)}
        {marker(entry, "var(--qt-text-muted)", "ENTRY")}
        {marker(tp, "var(--qt-long)", "TP", true)}
        {refPrice != null && (
          <motion.span
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2"
            style={{ background: "var(--qt-bg)", borderColor: "var(--qt-accent)" }}
            initial={false}
            animate={{ left: `${toPct(refPrice)}%` }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 100, damping: 18 }}
            title={`Engine ref ${refPrice.toFixed(2)} — last price the engine saw, not a live feed`}
          />
        )}
      </div>
      {rProgress != null && (
        <p className="qt-num text-[10px] mt-4 text-center" style={{ color: rProgress >= 0 ? "var(--qt-long)" : "var(--qt-short)" }}>
          {rProgress >= 0 ? "+" : ""}{rProgress.toFixed(2)}R of {rTarget.toFixed(1)}R target
          <span style={{ color: "var(--qt-text-faint)" }}> · engine ref basis</span>
        </p>
      )}
    </div>
  );
}

/* ---------- layer chips ---------- */
const LAYER_COLORS: Record<TradeLayer["status"], string> = {
  PENDING: "var(--qt-text-muted)",
  HIT: "var(--qt-long)",
  STOPPED_BE: "var(--qt-warn)",
  STOPPED_SL: "var(--qt-short)",
  DROPPED: "var(--qt-text-faint)",
};

function LayerChips({ layers }: { layers: TradeLayer[] }) {
  if (!layers.length) {
    return (
      <span className="qt-num text-[9.5px]" style={{ color: "var(--qt-text-faint)" }}>
        Single-layer auto-pilot position (no T1/T2/T3 split)
      </span>
    );
  }
  return (
    <div className="flex gap-2 flex-wrap">
      {layers.map((l) => (
        <span
          key={l.id}
          className="qt-num px-2 py-1 rounded text-[9.5px] font-bold"
          style={{ border: `1px solid ${LAYER_COLORS[l.status]}`, color: LAYER_COLORS[l.status] }}
          title={`${l.layer_type} → ${l.target_price} | SL ${l.stop_loss}`}
        >
          {l.layer_type} · {l.status}
          {l.realized_pnl ? ` · $${Number(l.realized_pnl).toFixed(2)}` : ""}
        </span>
      ))}
    </div>
  );
}

/* ---------- Close dialog (outcome / PnL / journal) ---------- */
function CloseTradeDialog({ trade, onClose }: { trade: QueueItem | null; onClose: () => void }) {
  const mutation = useCloseTrade();
  const [outcome, setOutcome] = useState<"WIN" | "LOSS" | "BREAKEVEN">("WIN");
  const [pnl, setPnl] = useState("15.00");
  const [journal, setJournal] = useState("");

  const pick = (o: typeof outcome, defaultPnl: string) => { setOutcome(o); setPnl(defaultPnl); };

  const submit = () => {
    if (!trade) return;
    mutation.mutate(
      { tradeId: trade.id, outcome, realizedPnl: parseFloat(pnl) || 0, journalText: journal },
      { onSuccess: () => { onClose(); setJournal(""); mutation.reset(); } },
    );
  };

  const OUTCOMES: { key: typeof outcome; label: string; color: string; pnl: string }[] = [
    { key: "WIN", label: "WIN", color: "var(--qt-long)", pnl: "15.00" },
    { key: "LOSS", label: "LOSS", color: "var(--qt-short)", pnl: "-5.00" },
    { key: "BREAKEVEN", label: "BREAKEVEN", color: "var(--qt-warn)", pnl: "0.00" },
  ];

  return (
    <QtDialog
      open={!!trade}
      title="CLOSE POSITION & UNLOCK"
      subtitle="Record the outcome — the queue lock releases on close"
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          {OUTCOMES.map((o) => (
            <button
              key={o.key}
              onClick={() => pick(o.key, o.pnl)}
              className="qt-num py-2 rounded-lg text-[10px] font-bold tracking-wider outline-none focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)]"
              style={{
                border: `1px solid ${outcome === o.key ? o.color : "var(--qt-border-strong)"}`,
                background: outcome === o.key ? `color-mix(in srgb, ${o.color} 14%, transparent)` : "transparent",
                color: outcome === o.key ? o.color : "var(--qt-text-muted)",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>

        <label className="qt-label">Realized PnL ($)</label>
        <input type="number" step="0.01" value={pnl} onChange={(e) => setPnl(e.target.value)} className={qtInputClass} style={qtInputStyle} />

        <label className="qt-label">Journal note (optional)</label>
        <textarea
          value={journal}
          onChange={(e) => setJournal(e.target.value)}
          placeholder="e.g. Target hit cleanly at M15 liquidity pool"
          className={`${qtInputClass} h-20 resize-none`}
          style={qtInputStyle}
        />

        {mutation.isError && (
          <p className="qt-num text-[10px]" style={{ color: "var(--qt-short)" }}>
            {mutation.error instanceof AdminAuthError
              ? String((mutation.error as Error).message)
              : "Close failed — engine rejected or unreachable."}
          </p>
        )}

        <button
          onClick={submit}
          disabled={mutation.isPending}
          className="qt-num w-full py-2.5 rounded-lg text-xs font-bold tracking-[0.14em] disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)]"
          style={{ background: "rgb(16 185 129 / 0.14)", border: "1px solid var(--qt-long)", color: "var(--qt-long)" }}
        >
          {mutation.isPending ? "CLOSING…" : "CONFIRM CLOSE & UNLOCK"}
        </button>
      </div>
    </QtDialog>
  );
}

/* ---------- Theater ---------- */
export function ActivePositionTheater({ trade }: { trade: QueueItem | null }) {
  const ctx = useSignalContext();
  const [closing, setClosing] = useState<QueueItem | null>(null);
  const elapsed = useElapsed(trade?.created_at ?? new Date().toISOString());

  if (!trade) {
    return (
      <section className="qt-card flex flex-col items-center justify-center gap-1.5 py-10">
        <Crosshair size={18} style={{ color: "var(--qt-text-faint)" }} />
        <span className="qt-label">No active position</span>
        <span className="qt-num text-[10px]" style={{ color: "var(--qt-text-faint)" }}>
          Queue is unlocked — the next accepted signal engages the position lock
        </span>
      </section>
    );
  }

  const isLong = trade.action.includes("BUY");
  const sideColor = isLong ? "var(--qt-long)" : "var(--qt-short)";

  return (
    <section className="qt-card p-4 flex flex-col gap-3" style={{ borderColor: sideColor }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="qt-num px-2 py-0.5 rounded text-[10px] font-bold tracking-wider" style={{ background: `color-mix(in srgb, ${sideColor} 15%, transparent)`, color: sideColor, border: `1px solid ${sideColor}` }}>
            {isLong ? "LONG" : "SHORT"} · {trade.action}
          </span>
          <span className="qt-num text-sm font-bold">{trade.ticker}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="qt-num text-[10px] tabular-nums" style={{ color: "var(--qt-text-muted)" }}>⏱ {elapsed}</span>
          <span className="qt-num flex items-center gap-1 text-[9px] font-bold" style={{ color: "var(--qt-warn)" }}>
            <Lock size={10} /> QUEUE LOCKED — 1 POSITION MAX
          </span>
        </div>
      </div>

      <PriceTrack trade={trade} refPrice={ctx.refPrice} />

      <LayerChips layers={trade.trade_layers ?? []} />

      <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--qt-border)" }}>
        <span className="qt-num text-[9.5px]" style={{ color: "var(--qt-text-faint)" }}>
          Auto-pilot resolves at SL/TP; manual close overrides
        </span>
        <button
          onClick={() => setClosing(trade)}
          className="qt-num flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold tracking-wider outline-none focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)]"
          style={{ border: "1px solid var(--qt-border-strong)", color: "var(--qt-text)" }}
        >
          <CircleDollarSign size={12} /> CLOSE POSITION
        </button>
      </div>

      <CloseTradeDialog trade={closing} onClose={() => setClosing(null)} />
    </section>
  );
}
