"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BACKEND_URL,
  DELTA_HISTORY_LEN,
  POLL_TELEMETRY_MS,
} from "@/lib/quant/constants";
import type { Telemetry } from "@/lib/quant/types";

const FALLBACK: Telemetry = {
  market_regime: "NEUTRAL",
  structure: "NEUTRAL",
  volume_delta: 0,
  magnet_node: 0,
};

async function fetchTelemetry(): Promise<Telemetry> {
  const res = await fetch(`${BACKEND_URL}/api/telemetry`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Telemetry ${res.status}`);
  const d = await res.json();
  return {
    market_regime: d.market_regime || "NEUTRAL",
    structure: d.structure || "NEUTRAL",
    volume_delta: Number(d.volume_delta) || 0,
    magnet_node: Number(d.magnet_node) || 0,
  };
}

/**
 * Live telemetry + rolling delta history for the pressure sparkline.
 * History is accumulated client-side (backend exposes only the
 * latest snapshot) and capped at DELTA_HISTORY_LEN points.
 */
export function useTelemetry() {
  const query = useQuery({
    queryKey: ["telemetry"],
    queryFn: fetchTelemetry,
    refetchInterval: POLL_TELEMETRY_MS,
    placeholderData: FALLBACK,
  });

  const [deltaHistory, setDeltaHistory] = useState<
    { t: number; delta: number }[]
  >([]);
  const lastStamp = useRef<number>(0);

  useEffect(() => {
    if (query.data === undefined || query.isPlaceholderData) return;
    const now = Date.now();
    // Guard against double-appends from re-renders within one poll tick
    if (now - lastStamp.current < POLL_TELEMETRY_MS / 2) return;
    lastStamp.current = now;
    setDeltaHistory((prev) =>
      [...prev, { t: now, delta: query.data!.volume_delta }].slice(
        -DELTA_HISTORY_LEN,
      ),
    );
  }, [query.data, query.isPlaceholderData]);

  return {
    telemetry: query.data ?? FALLBACK,
    deltaHistory,
    /** Railway backend reachability, surfaced as a health dot */
    backendOnline: !query.isError,
    isLive: query.isSuccess && !query.isPlaceholderData,
  };
}
