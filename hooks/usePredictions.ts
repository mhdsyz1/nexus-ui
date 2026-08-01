"use client";

import { useQuery } from "@tanstack/react-query";
import { BACKEND_URL, POLL_PREDICTIONS_MS } from "@/lib/quant/constants";
import type { NewsPrediction } from "@/lib/quant/types";

/**
 * Triple-Fusion feed (public endpoint — no admin key). The backend
 * only populates it inside each event's −15m/+5m window, so an
 * empty array means "standby", not an error.
 */
export function usePredictions() {
  const query = useQuery({
    queryKey: ["burner-predictions"],
    queryFn: async (): Promise<NewsPrediction[]> => {
      const res = await fetch(`${BACKEND_URL}/api/burner/predictions`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Predictions ${res.status}`);
      const j = await res.json();
      return (j.predictions ?? []) as NewsPrediction[];
    },
    refetchInterval: POLL_PREDICTIONS_MS,
    placeholderData: [] as NewsPrediction[],
  });

  return {
    predictions: query.data ?? [],
    isLive: query.isSuccess,
    isError: query.isError,
  };
}
