"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { adminFetch } from "@/lib/quant/adminFetch";
import type { QueueItem } from "@/lib/quant/types";

/** Optimistically rewrite one queue row's status, with rollback token */
function useOptimisticStatus() {
  const qc = useQueryClient();
  return {
    apply: async (tradeId: string, status: string) => {
      await qc.cancelQueries({ queryKey: ["queue"] });
      const prev = qc.getQueryData<QueueItem[]>(["queue"]);
      qc.setQueryData<QueueItem[]>(["queue"], (old) =>
        (old ?? []).map((i) => (i.id === tradeId ? { ...i, status } : i)),
      );
      return { prev };
    },
    rollback: (ctx?: { prev?: QueueItem[] }) => {
      if (ctx?.prev) qc.setQueryData(["queue"], ctx.prev);
    },
    settle: () => {
      qc.invalidateQueries({ queryKey: ["queue"] });
      qc.invalidateQueries({ queryKey: ["risk-config"] });
    },
  };
}

export function useAcceptTrade() {
  const opt = useOptimisticStatus();
  return useMutation({
    mutationFn: async (tradeId: string) => {
      await adminFetch("/api/accept-trade", { trade_id: tradeId });
    },
    onMutate: (tradeId: string) => opt.apply(tradeId, "ACTIVE"),
    onError: (_e: unknown, _v: string, ctx: any) => opt.rollback(ctx),
    onSettled: () => opt.settle(),
  });
}

export function useDropTrade() {
  const opt = useOptimisticStatus();
  return useMutation({
    mutationFn: async (tradeId: string) => {
      await adminFetch("/api/drop-trade", { trade_id: tradeId });
    },
    onMutate: (tradeId: string) => opt.apply(tradeId, "DROPPED"),
    onError: (_e: unknown, _v: string, ctx: any) => opt.rollback(ctx),
    onSettled: () => opt.settle(),
  });
}

export interface CloseTradeInput {
  tradeId: string;
  outcome: "WIN" | "LOSS" | "BREAKEVEN";
  realizedPnl: number;
  journalText: string;
}

export function useCloseTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tradeId, outcome, realizedPnl, journalText }: CloseTradeInput) => {
      if (journalText.trim()) {
        // Journal insert stays on the Supabase plane, as in the legacy flow
        await supabase
          .from("trade_journal")
          .insert({ trade_id: tradeId, reason_for_entry: journalText.trim() });
      }
      await adminFetch("/api/close-trade", {
        trade_id: tradeId,
        outcome,
        realized_pnl: realizedPnl,
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["queue"] });
      qc.invalidateQueries({ queryKey: ["risk-config"] });
    },
  });
}

export function useKillSwitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: "ACTIVATE" | "DEACTIVATE") => {
      await adminFetch("/kill-switch", { action });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["risk-config"] }),
  });
}
