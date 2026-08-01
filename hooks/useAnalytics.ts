"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { POLL_SUPABASE_MS } from "@/lib/quant/constants";
import type { JournalEntry, QueueItem } from "@/lib/quant/types";
import { useRiskConfig } from "./useSupabaseReads";

// ============================================================
// ANALYTICS ENGINE — read-only projections of trade history.
//
// Two honest limitations of the persisted schema, surfaced here
// rather than papered over:
//  1. Position size per trade is NOT stored, so R-multiples use
//     PLANNED GEOMETRY: WIN → +|TP−entry|/|entry−SL|, LOSS → −1R,
//     BREAKEVEN → 0R ("geometric R"). Dollar metrics (PnL, PF,
//     expectancy, drawdown) come from realized_pnl and are exact.
//  2. The equity curve is reconstructed BACKWARDS from live equity
//     minus the realized PnL trail. Manual equity adjustments
//     (deposits/withdrawals) between trades are not in the trail,
//     so history before an adjustment shifts by that amount.
// ============================================================

export interface CurvePoint {
  i: number;
  label: string;
  dateIso: string;
  balance: number;
  pnl: number;
  r: number | null;
  action: string;
  status: string;
}

export interface PerformanceMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRatePct: number;
  /** null = undefined (no losing trades yet) */
  profitFactor: number | null;
  netPnl: number;
  avgWinUsd: number;
  avgLossUsd: number;
  /** classic expectancy in $ per trade */
  expectancyUsd: number;
  /** mean geometric R across trades with valid geometry */
  avgR: number | null;
  maxDrawdownUsd: number;
  maxDrawdownPct: number;
  peakEquity: number;
  startEquity: number;
}

const RESOLVED = ["WIN", "LOSS", "BREAKEVEN"] as const;

/** Geometric (planned) R for a resolved trade; null if geometry missing */
export function geometricR(t: QueueItem): number | null {
  const entry = t.entry_price ?? 0;
  const sl = t.stop_loss ?? 0;
  const tp = t.take_profit ?? 0;
  const risk = Math.abs(entry - sl);
  if (t.status === "BREAKEVEN") return 0;
  if (t.status === "LOSS") return risk > 0 ? -1 : null;
  if (t.status === "WIN") return risk > 0 && tp > 0 ? Math.abs(tp - entry) / risk : null;
  return null;
}

function computeMetrics(trades: QueueItem[], liveEquity: number) {
  const pnls = trades.map((t) => Number(t.realized_pnl) || 0);
  const netPnl = pnls.reduce((a, b) => a + b, 0);
  const startEquity = liveEquity - netPnl;

  // --- forward walk for curve + drawdown
  let balance = startEquity;
  let peak = startEquity;
  let maxDdUsd = 0;
  let maxDdPct = 0;

  const curve: CurvePoint[] = [
    {
      i: 0,
      label: "START",
      dateIso: trades[0]?.created_at ?? new Date().toISOString(),
      balance: startEquity,
      pnl: 0,
      r: null,
      action: "—",
      status: "START",
    },
  ];

  trades.forEach((t, idx) => {
    const pnl = Number(t.realized_pnl) || 0;
    balance += pnl;
    peak = Math.max(peak, balance);
    const dd = peak - balance;
    if (dd > maxDdUsd) {
      maxDdUsd = dd;
      maxDdPct = peak > 0 ? (dd / peak) * 100 : 0;
    }
    curve.push({
      i: idx + 1,
      label: new Date(t.created_at).toISOString().slice(5, 10),
      dateIso: t.created_at,
      balance,
      pnl,
      r: geometricR(t),
      action: t.action,
      status: t.status,
    });
  });

  // --- aggregates
  const wins = trades.filter((t) => t.status === "WIN");
  const losses = trades.filter((t) => t.status === "LOSS");
  const breakevens = trades.filter((t) => t.status === "BREAKEVEN");

  const grossWin = wins.reduce((a, t) => a + (Number(t.realized_pnl) || 0), 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + (Number(t.realized_pnl) || 0), 0));

  const decisive = wins.length + losses.length;
  const winRatePct = decisive > 0 ? (wins.length / decisive) * 100 : 0;
  const avgWinUsd = wins.length ? grossWin / wins.length : 0;
  const avgLossUsd = losses.length ? grossLoss / losses.length : 0;

  const rValues = trades.map(geometricR).filter((r): r is number => r !== null);
  const avgR = rValues.length ? rValues.reduce((a, b) => a + b, 0) / rValues.length : null;

  const p = decisive > 0 ? wins.length / decisive : 0;
  const expectancyUsd = trades.length ? p * avgWinUsd - (1 - p) * avgLossUsd : 0;

  const metrics: PerformanceMetrics = {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    breakevens: breakevens.length,
    winRatePct,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? null : 0,
    netPnl,
    avgWinUsd,
    avgLossUsd,
    expectancyUsd,
    avgR,
    maxDrawdownUsd: maxDdUsd,
    maxDrawdownPct: maxDdPct,
    peakEquity: peak,
    startEquity,
  };

  return { metrics, curve };
}

export function useAnalytics() {
  const { config } = useRiskConfig();

  const historyQuery = useQuery({
    queryKey: ["analytics-history"],
    queryFn: async (): Promise<QueueItem[]> => {
      const { data, error } = await supabase
        .from("execution_queue")
        .select(
          `id, ticker, timeframe, action, status, created_at, entry_price,
           zone_low, zone_high, stop_loss, take_profit, realized_pnl, confidence, score,
           trade_layers ( id, trade_id, layer_type, risk_pct, target_price, stop_loss, status, realized_pnl )`,
        )
        .in("status", RESOLVED as unknown as string[])
        .order("created_at", { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as QueueItem[];
    },
    refetchInterval: POLL_SUPABASE_MS,
    placeholderData: [] as QueueItem[],
  });

  const journalQuery = useQuery({
    queryKey: ["journal-entries"],
    queryFn: async (): Promise<Record<string, JournalEntry[]>> => {
      const { data, error } = await supabase
        .from("trade_journal")
        .select("id, trade_id, reason_for_entry, created_at")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const byTrade: Record<string, JournalEntry[]> = {};
      (data ?? []).forEach((e: JournalEntry) => {
        (byTrade[e.trade_id] ??= []).push(e);
      });
      return byTrade;
    },
    refetchInterval: POLL_SUPABASE_MS * 3,
    placeholderData: {} as Record<string, JournalEntry[]>,
  });

  const trades = historyQuery.data ?? [];

  const { metrics, curve } = useMemo(
    () => computeMetrics(trades, config.total_equity),
    [trades, config.total_equity],
  );

  return {
    trades,
    journalByTrade: journalQuery.data ?? {},
    metrics,
    curve,
    hasData: trades.length > 0,
    isLive: historyQuery.isSuccess,
  };
}
