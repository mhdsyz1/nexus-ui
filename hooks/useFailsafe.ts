"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminFetch, AdminAuthError } from "@/lib/quant/adminFetch";
import { useTerminalStore } from "@/lib/quant/store";
import { PAROLE_HOURS, POLL_MACRO_MS } from "@/lib/quant/constants";
import { useRiskConfig } from "./useSupabaseReads";
import type { FailsafeMode, MacroEvent } from "@/lib/quant/types";

/**
 * Red Folder schedule (main.py RED_FOLDER_SCHEDULE). The endpoint is
 * admin-authed; the query only runs once a token is in the vault, so
 * opening CONTROLS never force-prompts — the timeline shows an unlock
 * hint instead, and any authed action elsewhere unlocks it. The vault
 * cache is reactive (Zustand), so no storage polling is needed.
 */
export function useMacroSchedule() {
  const hasKey = useTerminalStore((s) => Boolean(s.cachedToken));

  const query = useQuery({
    queryKey: ["macro-schedule"],
    queryFn: async (): Promise<MacroEvent[]> => {
      const res = await adminFetch("/api/macro-schedule", null, "GET");
      const j = await res.json();
      return (j.schedule ?? []) as MacroEvent[];
    },
    enabled: hasKey,
    refetchInterval: POLL_MACRO_MS,
    retry: (count: number, err: unknown) =>
      err instanceof AdminAuthError ? false : count < 2,
  });

  return { schedule: query.data ?? [], hasKey, isError: query.isError };
}

/** 1 Hz now-ticker shared by parole + embargo countdowns */
function useNowSeconds(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export interface ParoleClock {
  active: boolean;
  remainingSec: number;
  /** 1 → just killed, 0 → restoration due */
  fraction: number;
  label: string; // hh:mm:ss
}

/** Mirrors automated_parole_worker: restoration at killed_at + 12h */
export function useParoleClock(killedAt: string | null): ParoleClock {
  const now = useNowSeconds();
  if (!killedAt) return { active: false, remainingSec: 0, fraction: 0, label: "00:00:00" };

  const killedSec = Math.floor(new Date(killedAt).getTime() / 1000);
  const endSec = killedSec + PAROLE_HOURS * 3600;
  const remainingSec = Math.max(0, endSec - now);
  const fraction = remainingSec / (PAROLE_HOURS * 3600);
  const h = Math.floor(remainingSec / 3600);
  const m = Math.floor((remainingSec % 3600) / 60);
  const s = remainingSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return {
    active: true,
    remainingSec,
    fraction,
    label: `${pad(h)}:${pad(m)}:${pad(s)}`,
  };
}

export interface FailsafeState {
  mode: FailsafeMode;
  killed: boolean;
  parole: ParoleClock;
  embargoEvent: MacroEvent | null;
  embargoRemainingSec: number;
  nextEvent: MacroEvent | null;
  schedule: MacroEvent[];
  scheduleUnlocked: boolean;
  nowSec: number;
}

/**
 * Master failsafe derivation. Priority KILLED > EMBARGO > ARMED:
 * the kill switch blocks everything, the embargo shield only blocks
 * new entries during its window (is_macro_embargo_active in main.py).
 */
export function useFailsafeState(): FailsafeState {
  const { config } = useRiskConfig();
  const { schedule, hasKey } = useMacroSchedule();
  const nowSec = useNowSeconds();
  const parole = useParoleClock(config.system_is_killed ? config.killed_at : null);

  const embargoEvent =
    schedule.find((e) => e.embargo_start <= nowSec && nowSec <= e.embargo_end) ??
    null;
  const upcoming = schedule
    .filter((e) => e.timestamp_utc > nowSec)
    .sort((a, b) => a.timestamp_utc - b.timestamp_utc);

  const mode: FailsafeMode = config.system_is_killed
    ? "KILLED"
    : embargoEvent
      ? "EMBARGO"
      : "ARMED";

  return {
    mode,
    killed: config.system_is_killed,
    parole,
    embargoEvent,
    embargoRemainingSec: embargoEvent
      ? Math.max(0, embargoEvent.embargo_end - nowSec)
      : 0,
    nextEvent: upcoming[0] ?? null,
    schedule,
    scheduleUnlocked: hasKey,
    nowSec,
  };
}
