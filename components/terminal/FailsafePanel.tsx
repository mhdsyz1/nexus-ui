"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck, ShieldOff, TimerReset, CalendarClock, Edit3, Lock } from "lucide-react";
import { useFailsafeState } from "@/hooks/useFailsafe";
import { useKillSwitch } from "@/hooks/useMutations";
import { useRiskConfig } from "@/hooks/useSupabaseReads";
import { adminFetch, AdminAuthError } from "@/lib/quant/adminFetch";
import { PAROLE_HOURS } from "@/lib/quant/constants";
import type { MacroEvent } from "@/lib/quant/types";
import { QtDialog, qtInputClass, qtInputStyle } from "./QtDialog";

/* ---------- 12-hour Parole Ring ---------- */
function ParoleRing({ fraction, label }: { fraction: number; label: string }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative w-[132px] h-[132px]">
      <svg viewBox="0 0 132 132" className="w-full h-full -rotate-90">
        <circle cx="66" cy="66" r={R} fill="none" stroke="var(--qt-surface-3)" strokeWidth="7" />
        <motion.circle
          cx="66" cy="66" r={R} fill="none"
          stroke="var(--qt-short)" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={C}
          initial={false}
          animate={{ strokeDashoffset: C * (1 - fraction) }}
          transition={{ duration: 0.6 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="qt-num text-base font-bold" style={{ color: "var(--qt-short)" }}>{label}</span>
        <span className="qt-label">to auto-restore</span>
      </div>
    </div>
  );
}

/* ---------- Red Folder Timeline (next 48h) ---------- */
function RedFolderTimeline({ schedule, nowSec }: { schedule: MacroEvent[]; nowSec: number }) {
  const WINDOW = 48 * 3600;
  const start = nowSec - 2 * 3600; // small look-back so "now" isn't at the hard edge
  const span = WINDOW + 2 * 3600;
  const toX = (t: number) => Math.min(100, Math.max(0, ((t - start) / span) * 100));

  const visible = useMemo(
    () => schedule.filter((e) => e.timestamp_utc >= start && e.timestamp_utc <= start + span),
    [schedule, start, span],
  );

  return (
    <div>
      <div className="relative h-9 rounded-lg overflow-hidden" style={{ background: "var(--qt-surface-2)" }}>
        {/* embargo bands */}
        {visible.map((e) => (
          <span
            key={`band-${e.event_id}`}
            className="absolute inset-y-0"
            style={{
              left: `${toX(e.embargo_start)}%`,
              width: `${Math.max(0.6, toX(e.embargo_end) - toX(e.embargo_start))}%`,
              background: "rgb(245 158 11 / 0.18)",
              borderLeft: "1px solid rgb(245 158 11 / 0.5)",
              borderRight: "1px solid rgb(245 158 11 / 0.5)",
            }}
          />
        ))}
        {/* event dots */}
        {visible.map((e) => (
          <span
            key={e.event_id}
            title={`${e.event_name} — ${e.time_str} (${e.impact})`}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
            style={{
              left: `${toX(e.timestamp_utc)}%`,
              background: e.impact === "HIGH" ? "var(--qt-short)" : "var(--qt-warn)",
              boxShadow: "0 0 5px rgb(244 63 94 / 0.4)",
            }}
          />
        ))}
        {/* now cursor */}
        <span
          className="absolute inset-y-0 w-px"
          style={{ left: `${toX(nowSec)}%`, background: "var(--qt-accent)", boxShadow: "0 0 6px var(--qt-accent)" }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="qt-num text-[8.5px]" style={{ color: "var(--qt-accent)" }}>NOW</span>
        <span className="qt-num text-[8.5px]" style={{ color: "var(--qt-text-faint)" }}>+24H</span>
        <span className="qt-num text-[8.5px]" style={{ color: "var(--qt-text-faint)" }}>+48H</span>
      </div>
      {visible.length === 0 && (
        <p className="qt-num text-[10px] mt-1.5" style={{ color: "var(--qt-text-faint)" }}>
          No high or medium USD events in the next 48 hours.
        </p>
      )}
    </div>
  );
}

/* ---------- Kill Switch confirmation (typed HALT / RESTORE) ---------- */
function KillConfirmDialog({
  open, killed, busy, error, onClose, onConfirm,
}: {
  open: boolean; killed: boolean; busy: boolean; error: string | null;
  onClose: () => void; onConfirm: () => void;
}) {
  const word = killed ? "RESTORE" : "HALT";
  const [typed, setTyped] = useState("");
  const match = typed.trim().toUpperCase() === word;

  return (
    <QtDialog
      open={open}
      title={killed ? "RESTORE SYSTEM" : "ACTIVATE KILL SWITCH"}
      subtitle={
        killed
          ? "Ends parole early and re-arms the engine"
          : `Halts all execution. Auto-restores after ${PAROLE_HOURS}h parole.`
      }
      onClose={() => { setTyped(""); onClose(); }}
    >
      <div className="flex flex-col gap-3">
        <label className="qt-label">Type {word} to confirm</label>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && match && onConfirm()}
          placeholder={word}
          className={qtInputClass}
          style={qtInputStyle}
        />
        {error && (
          <p className="qt-num text-[10px]" style={{ color: "var(--qt-short)" }}>{error}</p>
        )}
        <button
          onClick={onConfirm}
          disabled={!match || busy}
          className="qt-num w-full py-2.5 rounded-lg text-xs font-bold tracking-[0.14em] disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)]"
          style={{
            background: killed ? "rgb(16 185 129 / 0.15)" : "rgb(244 63 94 / 0.15)",
            border: `1px solid ${killed ? "var(--qt-long)" : "var(--qt-short)"}`,
            color: killed ? "var(--qt-long)" : "var(--qt-short)",
          }}
        >
          {busy ? "SENDING…" : `CONFIRM ${word}`}
        </button>
      </div>
    </QtDialog>
  );
}

/* ---------- Panel ---------- */
export function FailsafePanel() {
  const fs = useFailsafeState();
  const { config } = useRiskConfig();
  const killMutation = useKillSwitch();
  const reduced = useReducedMotion();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [equityOpen, setEquityOpen] = useState(false);
  const [equityValue, setEquityValue] = useState("");
  const [equityBusy, setEquityBusy] = useState(false);
  const [equityError, setEquityError] = useState<string | null>(null);

  const stateColor =
    fs.mode === "KILLED" ? "var(--qt-short)" : fs.mode === "EMBARGO" ? "var(--qt-warn)" : "var(--qt-long)";

  const submitEquity = async () => {
    const v = parseFloat(equityValue);
    if (isNaN(v) || v <= 0) { setEquityError("Enter a positive amount."); return; }
    setEquityBusy(true); setEquityError(null);
    try {
      await adminFetch("/api/update-equity", { total_equity: v });
      setEquityOpen(false); setEquityValue("");
      toast.success(`Equity ledger set to $${v.toFixed(2)}`);
    } catch (e) {
      const msg = e instanceof AdminAuthError ? e.message : "Update failed — engine unreachable or rejected.";
      setEquityError(msg);
      toast.error(msg);
    } finally {
      setEquityBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 max-w-2xl mx-auto w-full">
      {/* ===== Master state card ===== */}
      <section
        className={`qt-card p-5 flex flex-col items-center gap-4 ${fs.mode === "ARMED" ? "qt-armed-ring" : ""}`}
        style={{ borderColor: stateColor }}
        aria-live="polite"
      >
        <div className="flex items-center gap-2.5">
          {fs.mode === "KILLED" ? (
            <ShieldOff size={20} style={{ color: stateColor }} />
          ) : (
            <ShieldCheck size={20} style={{ color: stateColor }} />
          )}
          <motion.span
            key={fs.mode}
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="qt-num text-xl font-bold tracking-[0.2em]"
            style={{ color: stateColor }}
          >
            {fs.mode === "KILLED" ? "KILLED — PAROLE ACTIVE" : fs.mode === "EMBARGO" ? "EMBARGO LOCKDOWN" : "SYSTEM ARMED"}
          </motion.span>
        </div>

        {fs.mode === "KILLED" && fs.parole.active && (
          <>
            <ParoleRing fraction={fs.parole.fraction} label={fs.parole.label} />
            <p className="qt-num text-[10px] text-center" style={{ color: "var(--qt-text-muted)" }}>
              Discipline protocol running. The engine restores itself automatically —
              or restore early below.
            </p>
          </>
        )}

        {fs.mode === "EMBARGO" && fs.embargoEvent && (
          <div className="flex flex-col items-center gap-1">
            <span className="qt-num text-sm font-bold" style={{ color: "var(--qt-warn)" }}>
              {fs.embargoEvent.event_name}
            </span>
            <span className="qt-num text-lg font-bold tabular-nums" style={{ color: "var(--qt-warn)" }}>
              {Math.floor(fs.embargoRemainingSec / 60)}:{String(fs.embargoRemainingSec % 60).padStart(2, "0")}
            </span>
            <span className="qt-label">until entries unlock</span>
          </div>
        )}

        {fs.mode === "ARMED" && (
          <p className="qt-num text-[10px]" style={{ color: "var(--qt-text-muted)" }}>
            All failsafes clear. New signals pass to the filter gauntlet.
          </p>
        )}

        <button
          onClick={() => { killMutation.reset(); setConfirmOpen(true); }}
          className="qt-num w-full py-3 rounded-lg text-xs font-bold tracking-[0.16em] outline-none focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)]"
          style={{
            background: fs.killed ? "rgb(16 185 129 / 0.12)" : "rgb(244 63 94 / 0.12)",
            border: `1px solid ${fs.killed ? "var(--qt-long)" : "var(--qt-short)"}`,
            color: fs.killed ? "var(--qt-long)" : "var(--qt-short)",
          }}
        >
          {fs.killed ? "RESTORE SYSTEM EARLY" : "ACTIVATE KILL SWITCH"}
        </button>
      </section>

      {/* ===== Red Folder ===== */}
      <section className="qt-card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="qt-label flex items-center gap-1.5" style={{ color: "var(--qt-text)" }}>
            <CalendarClock size={12} /> Red Folder — next 48h USD events
          </span>
          {fs.nextEvent && fs.scheduleUnlocked && (
            <span className="qt-num text-[9.5px]" style={{ color: "var(--qt-text-muted)" }}>
              next: {fs.nextEvent.event_name} · {fs.nextEvent.time_str}
            </span>
          )}
        </div>

        {fs.scheduleUnlocked ? (
          <RedFolderTimeline schedule={fs.schedule} nowSec={fs.nowSec} />
        ) : (
          <div className="flex items-center gap-2 py-3 justify-center">
            <Lock size={12} style={{ color: "var(--qt-text-faint)" }} />
            <span className="qt-num text-[10px]" style={{ color: "var(--qt-text-faint)" }}>
              Schedule unlocks after your first authorized action (it is an admin-keyed feed).
            </span>
          </div>
        )}
      </section>

      {/* ===== Equity adjust ===== */}
      <section className="qt-card p-4 flex items-center justify-between">
        <div>
          <p className="qt-label" style={{ color: "var(--qt-text)" }}>Live account equity</p>
          <p className="qt-num text-sm font-bold mt-0.5">${config.total_equity.toFixed(2)}</p>
        </div>
        <button
          onClick={() => { setEquityValue(config.total_equity.toFixed(2)); setEquityError(null); setEquityOpen(true); }}
          className="qt-num flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold tracking-wider outline-none focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)]"
          style={{ border: "1px solid var(--qt-border-strong)", color: "var(--qt-text-muted)" }}
        >
          <Edit3 size={11} /> ADJUST
        </button>
      </section>

      <KillConfirmDialog
        open={confirmOpen}
        killed={fs.killed}
        busy={killMutation.isPending}
        error={killMutation.error ? String((killMutation.error as Error).message) : null}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() =>
          killMutation.mutate(fs.killed ? "DEACTIVATE" : "ACTIVATE", {
            onSuccess: () => setConfirmOpen(false),
          })
        }
      />

      <QtDialog
        open={equityOpen}
        title="ADJUST EQUITY"
        subtitle="Deposit / withdrawal correction to the live ledger"
        onClose={() => setEquityOpen(false)}
      >
        <div className="flex flex-col gap-3">
          <label className="qt-label flex items-center gap-1.5">
            <TimerReset size={11} /> New total equity ($)
          </label>
          <input
            type="number" step="0.01" autoFocus
            value={equityValue}
            onChange={(e) => setEquityValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitEquity()}
            className={qtInputClass} style={qtInputStyle}
          />
          {equityError && <p className="qt-num text-[10px]" style={{ color: "var(--qt-short)" }}>{equityError}</p>}
          <button
            onClick={submitEquity}
            disabled={equityBusy}
            className="qt-num w-full py-2.5 rounded-lg text-xs font-bold tracking-[0.12em] disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)]"
            style={{ background: "var(--qt-accent-dim)", border: "1px solid var(--qt-accent)", color: "var(--qt-text)" }}
          >
            {equityBusy ? "SAVING…" : "SAVE EQUITY"}
          </button>
        </div>
      </QtDialog>
    </div>
  );
}
