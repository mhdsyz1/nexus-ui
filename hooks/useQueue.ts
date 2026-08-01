"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { POLL_QUEUE_MS } from "@/lib/quant/constants";
import type { QueueItem } from "@/lib/quant/types";

const SELECT = `
  id, ticker, action, status, created_at, score, confidence,
  entry_price, zone_low, zone_high, stop_loss, take_profit, atr_volatility,
  market_regime, volume_delta, magnet_node, structure, realized_pnl,
  trade_layers ( id, trade_id, layer_type, risk_pct, target_price, stop_loss, status, realized_pnl )
`;

/**
 * Execution queue read plane. Realtime postgres_changes push gives
 * sub-second updates when the auto-pilot resolves a trade; the poll
 * remains as fallback so a dropped websocket never blinds the UI.
 */
export function useQueue() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["queue"],
    queryFn: async (): Promise<QueueItem[]> => {
      const { data, error } = await supabase
        .from("execution_queue")
        .select(SELECT)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as QueueItem[];
    },
    refetchInterval: POLL_QUEUE_MS,
    placeholderData: [] as QueueItem[],
  });

  useEffect(() => {
    const channel = supabase
      .channel("qt-execution-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "execution_queue" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["queue"] });
          queryClient.invalidateQueries({ queryKey: ["risk-config"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const items = query.data ?? [];
  return {
    items,
    activeTrade: items.find((i) => i.status === "ACTIVE") ?? null,
    pending: items.filter((i) => i.status === "PENDING"),
    resolved: items.filter((i) =>
      ["WIN", "LOSS", "BREAKEVEN", "DROPPED"].includes(i.status),
    ),
    isLive: query.isSuccess,
  };
}
