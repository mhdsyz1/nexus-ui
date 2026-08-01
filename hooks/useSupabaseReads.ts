"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { POLL_SUPABASE_MS } from "@/lib/quant/constants";
import type { RiskConfig, SignalContext } from "@/lib/quant/types";

const CONFIG_FALLBACK: RiskConfig = {
  total_equity: 250,
  max_allowed_layers: 4,
  system_is_killed: false,
  killed_at: null,
};

/** risk_configuration — equity, kill switch, parole timestamp */
export function useRiskConfig() {
  const query = useQuery({
    queryKey: ["risk-config"],
    queryFn: async (): Promise<RiskConfig> => {
      const { data, error } = await supabase
        .from("risk_configuration")
        .select("total_equity, max_allowed_layers, system_is_killed, killed_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (error) throw error;
      return {
        total_equity: Number(data.total_equity) || 250,
        max_allowed_layers: data.max_allowed_layers ?? 4,
        system_is_killed: Boolean(data.system_is_killed),
        killed_at: data.killed_at ?? null,
      };
    },
    refetchInterval: POLL_SUPABASE_MS,
    placeholderData: CONFIG_FALLBACK,
  });

  return {
    config: query.data ?? CONFIG_FALLBACK,
    supabaseOnline: !query.isError,
  };
}

/**
 * Latest execution_queue row → price/ATR reference for the Magnet
 * Radar. This is the last price the ENGINE saw, not a market feed;
 * the UI labels it "last signal ref" accordingly.
 */
export function useSignalContext() {
  const query = useQuery({
    queryKey: ["signal-context"],
    queryFn: async (): Promise<SignalContext> => {
      const { data, error } = await supabase
        .from("execution_queue")
        .select("entry_price, atr_volatility, structure, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (error) throw error;
      return {
        refPrice: data.entry_price != null ? Number(data.entry_price) : null,
        atr:
          data.atr_volatility != null ? Number(data.atr_volatility) : null,
        structure: data.structure ?? null,
        asOf: data.created_at ?? null,
      };
    },
    refetchInterval: POLL_SUPABASE_MS,
    placeholderData: { refPrice: null, atr: null, structure: null, asOf: null },
  });

  return query.data ?? { refPrice: null, atr: null, structure: null, asOf: null };
}
