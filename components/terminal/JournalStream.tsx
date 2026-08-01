"use client";

import { useMemo, useState } from "react";
import { Search, NotebookPen } from "lucide-react";
import { geometricR } from "@/hooks/useAnalytics";
import type { JournalEntry, QueueItem, TradeLayer } from "@/lib/quant/types";
import { qtInputClass, qtInputStyle } from "./QtDialog";

type Filter = "ALL" | "WIN" | "LOSS" | "BREAKEVEN";

const STATUS_COLORS: Record<string, string> = {
  WIN: "var(--qt-long)",
  LOSS: "var(--qt-short)",
  BREAKEVEN: "var(--qt-warn)",
};

const LAYER_COLORS: Record<TradeLayer["status"], string> = {
  PENDING: "var(--qt-text-muted)",
  HIT: "var(--qt-long)",
  STOPPED_BE: "var(--qt-warn)",
  STOPPED_SL: "var(--qt-short)",
  DROPPED: "var(--qt-text-faint)",
};

/** Outcome tag mirrors how the engine actually resolved the trade */
function outcomeTag(t: QueueItem): string {
  if (t.status === "WIN") return "3R TP";
  if (t.status === "LOSS") return "SL";
  return "BE";
}

function TradeRow({ trade, notes }: { trade: QueueItem; notes: JournalEntry[] }) {
  const isLong = trade.action.includes("BUY");
  const sideColor = isLong ? "var(--qt-long)" : "var(--qt-short)";
  const statusColor = STATUS_COLORS[trade.status] ?? "var(--qt-text-muted)";
  const pnl = Number(trade.realized_pnl) || 0;
  const r = geometricR(trade);
  const isManual = trade.timeframe === "MANUAL";
  const layers = trade.trade_layers ?? [];

  return (
    <li className="rounded-lg p-3 flex flex-col gap-2" style={{ background: "var(--qt-surface-2)", border: "1px solid var(--qt-border)" }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="qt-num px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ color: sideColor, border: `1px solid ${sideColor}` }}>
            {isLong ? "LONG" : "SHORT"}
          </span>
          <span className="qt-num text-[10px]" style={{ color: "var(--qt-text-muted)" }}>
            {new Date(trade.created_at).toISOString().slice(0, 16).replace("T", " ")} UTC
          </span>
          {isManual && (
            <span className="qt-num px-1.5 py-0.5 rounded text-[8.5px] font-bold" style={{ color: "var(--qt-accent)", border: "1px solid var(--qt-accent-dim)" }}>
              MANUAL
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="qt-num px-1.5 py-0.5 rounded text-[8.5px] font-bold" style={{ color: statusColor, border: `1px solid ${statusColor}` }}>
            {outcomeTag(trade)}
          </span>
          <span className="qt-num text-[11px] font-bold" style={{ color: pnl >= 0 ? "var(--qt-long)" : "var(--qt-short)" }}>
            {pnl >= 0 ? "+" : "−"}${Math.abs(pnl).toFixed(2)}
            {r !== null && (
              <span style={{ color: "var(--qt-text-faint)" }}> · {r >= 0 ? "+" : ""}{r.toFixed(1)}R</span>
            )}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="qt-num text-[9.5px]" style={{ color: "var(--qt-text-muted)" }}>
          entry <span style={{ color: "var(--qt-text)" }}>{trade.entry_price?.toFixed(2) ?? "—"}</span>
        </span>
        <span className="qt-num text-[9.5px]" style={{ color: "var(--qt-text-muted)" }}>
          SL <span style={{ color: "var(--qt-short)" }}>{trade.stop_loss?.toFixed(2) ?? "—"}</span>
        </span>
        <span className="qt-num text-[9.5px]" style={{ color: "var(--qt-text-muted)" }}>
          TP <span style={{ color: "var(--qt-long)" }}>{trade.take_profit?.toFixed(2) ?? "—"}</span>
        </span>
        {trade.confidence && (
          <span className="qt-num text-[9.5px]" style={{ color: "var(--qt-text-faint)" }}>
            grade {trade.confidence}{trade.score != null ? ` · ${trade.score}` : ""}
          </span>
        )}
      </div>

      {layers.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {layers.map((l) => (
            <span key={l.id} className="qt-num px-1.5 py-0.5 rounded text-[8.5px] font-bold" style={{ border: `1px solid ${LAYER_COLORS[l.status]}`, color: LAYER_COLORS[l.status] }}>
              {l.layer_type} {l.status}{l.realized_pnl ? ` $${Number(l.realized_pnl).toFixed(2)}` : ""}
            </span>
          ))}
        </div>
      )}

      {notes.length > 0 && (
        <div className="flex flex-col gap-1 pt-1.5" style={{ borderTop: "1px solid var(--qt-border)" }}>
          {notes.map((n) => (
            <p key={n.id} className="qt-num text-[9.5px] flex items-start gap-1.5" style={{ color: "var(--qt-text-muted)" }}>
              <NotebookPen size={10} className="shrink-0 mt-px" style={{ color: "var(--qt-accent)" }} />
              {n.reason_for_entry}
            </p>
          ))}
        </div>
      )}
    </li>
  );
}

export function JournalStream({
  trades,
  journalByTrade,
}: {
  trades: QueueItem[];
  journalByTrade: Record<string, JournalEntry[]>;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...trades]
      .reverse() // newest first for the stream
      .filter((t) => filter === "ALL" || t.status === filter)
      .filter((t) => {
        if (!q) return true;
        const notes = (journalByTrade[t.id] ?? []).map((n) => n.reason_for_entry).join(" ");
        const hay = `${t.action} ${t.status} ${t.timeframe} ${t.confidence ?? ""} ${t.created_at} ${notes}`.toLowerCase();
        return hay.includes(q);
      });
  }, [trades, filter, search, journalByTrade]);

  return (
    <section className="qt-card p-4 flex flex-col gap-3" aria-label="Trade journal">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="qt-label" style={{ color: "var(--qt-text)" }}>Journal stream</span>
        <div className="flex gap-1.5">
          {(["ALL", "WIN", "LOSS", "BREAKEVEN"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="qt-num px-2 py-1 rounded text-[8.5px] font-bold tracking-wider outline-none focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)]"
              style={{
                border: `1px solid ${filter === f ? "var(--qt-accent)" : "var(--qt-border-strong)"}`,
                color: filter === f ? "var(--qt-accent)" : "var(--qt-text-muted)",
              }}
            >
              {f === "BREAKEVEN" ? "BE" : f}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--qt-text-faint)" }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search action, outcome, note text, date…"
          className={`${qtInputClass} pl-8`}
          style={qtInputStyle}
        />
      </div>

      {visible.length === 0 ? (
        <p className="qt-num text-[10px] text-center py-6" style={{ color: "var(--qt-text-faint)" }}>
          {trades.length === 0 ? "No resolved trades yet — the stream begins with your first close." : "No trades match the current filter."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2 max-h-[520px] overflow-y-auto pr-1">
          {visible.map((t) => (
            <TradeRow key={t.id} trade={t} notes={journalByTrade[t.id] ?? []} />
          ))}
        </ul>
      )}
    </section>
  );
}
