"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { adminFetch, AdminAuthError } from "@/lib/quant/adminFetch";
import { PAROLE_HOURS } from "@/lib/quant/constants";
import type { QueueItem } from "@/lib/quant/types";

/** Uniform error surfacing: auth cancellations stay quiet-ish, real failures shout */
function toastError(e: unknown, fallback: string) {
  const msg =
    e instanceof AdminAuthError ? (e as Error).message : (e as Error)?.message || fallback;
  toast.error(msg);
}

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
    onSuccess: () => toast.success("Signal accepted — position lock engaged, auto-pilot monitoring"),
    onError: (e: unknown, _v: string, ctx: any) => {
      opt.rollback(ctx);
      toastError(e, "Accept failed — row restored");
    },
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
    onSuccess: () => toast.success("Signal dropped"),
    onError: (e: unknown, _v: string, ctx: any) => {
      opt.rollback(ctx);
      toastError(e, "Drop failed — row restored");
    },
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
      return { outcome, realizedPnl };
    },
    onSuccess: ({ outcome, realizedPnl }: { outcome: string; realizedPnl: number }) =>
      toast.success(
        `Position closed ${outcome} · ${realizedPnl >= 0 ? "+" : "−"}$${Math.abs(realizedPnl).toFixed(2)} — ledger updated, queue unlocked`,
      ),
    onError: (e: unknown) => toastError(e, "Close failed — position remains active"),
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
      return action;
    },
    onSuccess: (action: "ACTIVATE" | "DEACTIVATE") =>
      action === "ACTIVATE"
        ? toast.error(`KILL SWITCH ACTIVE — ${PAROLE_HOURS}h parole started`, { duration: 6000 })
        : toast.success("System restored — engine armed"),
    onError: (e: unknown) => toastError(e, "Kill-switch command failed"),
    onSettled: () => qc.invalidateQueries({ queryKey: ["risk-config"] }),
  });
}
