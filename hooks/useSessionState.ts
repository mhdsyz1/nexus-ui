"use client";

import { useEffect, useState } from "react";
import { SESSIONS_UTC, type SessionName } from "@/lib/quant/constants";

export interface SessionState {
  active: SessionName[];
  /** Primary badge shown in the status bar */
  primary: SessionName;
  /** Mirrors Pine's is_active_session gate — signals cannot fire when false */
  isActiveSession: boolean;
  utcClock: string;
}

function computeSession(now: Date): SessionState {
  const day = now.getUTCDay(); // 0 Sun … 6 Sat
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const isWeekday = day >= 1 && day <= 5;

  const active: SessionName[] = [];
  if (isWeekday) {
    const { TOKYO, LONDON, NEW_YORK } = SESSIONS_UTC;
    // Tokyo crosses midnight UTC (2200 → 0800)
    if (mins >= TOKYO.start || mins < TOKYO.end) active.push("TOKYO");
    if (mins >= LONDON.start && mins < LONDON.end) active.push("LONDON");
    if (mins >= NEW_YORK.start && mins < NEW_YORK.end) active.push("NEW_YORK");
  }

  // Overlaps resolve to the most liquid venue: NY > London > Tokyo
  const primary: SessionName = active.includes("NEW_YORK")
    ? "NEW_YORK"
    : active.includes("LONDON")
      ? "LONDON"
      : active.includes("TOKYO")
        ? "TOKYO"
        : "CLOSED";

  return {
    active,
    primary,
    isActiveSession: active.length > 0,
    utcClock: now.toISOString().slice(11, 19),
  };
}

/** Ticks every second; purely derived, never persisted. */
export function useSessionState(): SessionState {
  const [state, setState] = useState<SessionState>(() =>
    computeSession(new Date()),
  );

  useEffect(() => {
    const id = setInterval(() => setState(computeSession(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  return state;
}
