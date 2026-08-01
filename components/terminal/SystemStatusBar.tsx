"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTelemetry } from "@/hooks/useTelemetry";
import { useRiskConfig } from "@/hooks/useSupabaseReads";
import { useSessionState } from "@/hooks/useSessionState";
import type { SessionName } from "@/lib/quant/constants";

const SESSION_LABEL: Record<SessionName, string> = {
  TOKYO: "TOKYO",
  LONDON: "LONDON",
  NEW_YORK: "NEW YORK",
  CLOSED: "MARKET CLOSED",
};

function HealthDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5" title={`${label}: ${ok ? "connected" : "unreachable"}`}>
      <span className={`qt-dot ${ok ? "qt-dot--ok" : "qt-dot--down"}`} />
      <span className="qt-label hidden lg:inline">{label}</span>
    </span>
  );
}

/** Equity readout that flashes green/red on change and eases the number. */
function EquityTicker({ equity }: { equity: number }) {
  const prev = useRef(equity);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (equity === prev.current) return;
    setFlash(equity > prev.current ? "up" : "down");
    prev.current = equity;
    const id = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(id);
  }, [equity]);

  return (
    <motion.span
      key={equity}
      initial={reduced ? false : { opacity: 0.4, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="qt-num text-[13px] font-bold transition-colors duration-500"
      style={{
        color:
          flash === "up"
            ? "var(--qt-long)"
            : flash === "down"
              ? "var(--qt-short)"
              : "var(--qt-text)",
      }}
    >
      ${equity.toFixed(2)}
    </motion.span>
  );
}

/**
 * Master system state chip. Phase 1 renders ARMED / KILLED from
 * risk_configuration; the EMBARGO state joins in Phase 3 when the
 * FailsafePanel wires /api/macro-schedule into this chip.
 */
function SystemStateChip({ killed }: { killed: boolean }) {
  return (
    <span
      className={[
        "qt-num flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold tracking-[0.14em]",
        killed ? "" : "qt-armed-ring",
      ].join(" ")}
      style={{
        color: killed ? "var(--qt-short)" : "var(--qt-long)",
        background: killed ? "rgb(244 63 94 / 0.10)" : "rgb(16 185 129 / 0.08)",
        border: `1px solid ${killed ? "rgb(244 63 94 / 0.4)" : "rgb(16 185 129 / 0.35)"}`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: killed ? "var(--qt-short)" : "var(--qt-long)" }}
      />
      {killed ? "KILLED" : "ARMED"}
    </span>
  );
}

export function SystemStatusBar() {
  const { backendOnline } = useTelemetry();
  const { config, supabaseOnline } = useRiskConfig();
  const session = useSessionState();

  const sessionActive = session.primary !== "CLOSED";

  return (
    <header
      className="flex items-center justify-between px-3 md:px-4 shrink-0 z-50"
      style={{
        height: "var(--qt-statusbar-h)",
        background: "var(--qt-surface)",
        borderBottom: "1px solid var(--qt-border)",
      }}
    >
      {/* Identity + link health */}
      <div className="flex items-center gap-3 md:gap-4 min-w-0">
        <span className="qt-num text-[12px] font-bold tracking-tight whitespace-nowrap">
          <span style={{ color: "var(--qt-accent)" }}>NEXUS</span>
          <span style={{ color: "var(--qt-text-faint)" }}> // </span>
          <span>XAUUSD</span>
        </span>
        <div className="flex items-center gap-3 pl-3 md:pl-4" style={{ borderLeft: "1px solid var(--qt-border)" }}>
          <HealthDot ok={backendOnline} label="Engine" />
          <HealthDot ok={supabaseOnline} label="Database" />
        </div>
      </div>

      {/* Session + UTC clock */}
      <div className="hidden sm:flex items-center gap-3">
        <span
          className="qt-num px-2 py-0.5 rounded text-[10px] font-bold tracking-[0.12em]"
          style={{
            color: sessionActive ? "var(--qt-accent)" : "var(--qt-text-faint)",
            border: `1px solid ${sessionActive ? "var(--qt-accent-dim)" : "var(--qt-border)"}`,
            background: sessionActive ? "rgb(34 211 238 / 0.06)" : "transparent",
          }}
          title={
            sessionActive
              ? `Active sessions: ${session.active.join(" + ")}`
              : "Outside all AMD sessions — the engine will not fire signals"
          }
        >
          {SESSION_LABEL[session.primary]}
        </span>
        <span
          className="qt-num text-[12px] tabular-nums"
          style={{ color: "var(--qt-text-muted)" }}
          suppressHydrationWarning
        >
          {session.utcClock} UTC
        </span>
      </div>

      {/* Equity + master state */}
      <div className="flex items-center gap-3 md:gap-4">
        <div className="flex flex-col items-end leading-none gap-0.5">
          <span className="qt-label">Equity</span>
          <EquityTicker equity={config.total_equity} />
        </div>
        <SystemStateChip killed={config.system_is_killed} />
      </div>
    </header>
  );
}
