"use client";

import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Bot, Flame, Radar, CheckCircle2, XCircle, AlertTriangle, HelpCircle, CalendarClock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTelemetry } from "@/hooks/useTelemetry";
import { useSignalContext } from "@/hooks/useSupabaseReads";
import { useRiskConfig } from "@/hooks/useSupabaseReads";
import { useSessionState } from "@/hooks/useSessionState";
import { useFailsafeState } from "@/hooks/useFailsafe";
import { useQueue } from "@/hooks/useQueue";
import { usePredictions } from "@/hooks/usePredictions";
import { adminFetch, AdminAuthError } from "@/lib/quant/adminFetch";
import { buildManualPayload, evaluatePreflight, type Direction, type PreflightCheck } from "@/lib/quant/preflight";
import { ENGINE_RR, PIP_VALUE_PER_LOT, RISK_TIERS } from "@/lib/quant/constants";
import type { NewsPrediction } from "@/lib/quant/types";
import { qtInputClass, qtInputStyle } from "./QtDialog";

/* ================= Fusion Intel strip ================= */
function FusionIntel({ onAdopt }: { onAdopt: (p: NewsPrediction) => void }) {
  const { predictions } = usePredictions();
  const fs = useFailsafeState();

  if (predictions.length === 0) {
    return (
      <div className="qt-card p-3 flex items-center justify-between gap-3">
        <span className="qt-label flex items-center gap-1.5" style={{ color: "var(--qt-text)" }}>
          <CalendarClock size={12} /> Fusion engine · standby
        </span>
        <span className="qt-num text-[9.5px]" style={{ color: "var(--qt-text-faint)" }}>
          {fs.scheduleUnlocked && fs.nextEvent
            ? `Arms T−15:00 before ${fs.nextEvent.event_name} (${fs.nextEvent.time_str})`
            : "Arms T−15:00 before each Red Folder event"}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {predictions.map((p) => {
        const isBuy = p.predicted_action === "BUY NOW";
        const sideColor = isBuy ? "var(--qt-long)" : "var(--qt-short)";
        return (
          <div key={p.event_id} className="qt-card p-3 flex flex-col gap-2" style={{ borderColor: "var(--qt-warn)" }}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="qt-num text-[11px] font-bold" style={{ color: "var(--qt-warn)" }}>
                ⚡ {p.event_name} · {p.time_str}
              </span>
              <span className="qt-num text-[10px] font-bold" style={{ color: sideColor }}>
                {p.predicted_action} · {p.confidence_pct}% · {p.confluence_grade}
              </span>
            </div>
            <p className="qt-num text-[9.5px] flex items-start gap-1" style={{ color: "var(--qt-accent)" }}>
              <Bot size={11} className="shrink-0 mt-px" /> {p.gemini_ai_rationale}
            </p>
            <button
              onClick={() => onAdopt(p)}
              className="qt-num self-start px-2.5 py-1 rounded text-[9px] font-bold tracking-wider outline-none focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)]"
              style={{ border: `1px solid ${sideColor}`, color: sideColor }}
            >
              ADOPT INTO CONSOLE ↓
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ================= Radar check row ================= */
const CHECK_ICONS = {
  PASS: { icon: CheckCircle2, color: "var(--qt-long)" },
  BLOCK: { icon: XCircle, color: "var(--qt-short)" },
  WARN: { icon: AlertTriangle, color: "var(--qt-warn)" },
  UNKNOWN: { icon: HelpCircle, color: "var(--qt-text-faint)" },
} as const;

function CheckRow({ check }: { check: PreflightCheck }) {
  const { icon: Icon, color } = CHECK_ICONS[check.status];
  return (
    <li className="flex items-start gap-2 py-1.5" style={{ borderBottom: "1px solid var(--qt-border)" }}>
      <Icon size={13} className="shrink-0 mt-px" style={{ color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="qt-num text-[10px] font-bold">{check.label}</span>
          <span className="qt-num text-[9px] font-bold" style={{ color }}>
            {check.status}{!check.enforced && check.status === "WARN" ? " · ADVISORY" : ""}
          </span>
        </div>
        <p className="qt-num text-[9px] mt-0.5" style={{ color: "var(--qt-text-muted)" }}>{check.detail}</p>
      </div>
    </li>
  );
}

/* ================= Hold-to-fire ================= */
const HOLD_MS = 1200;

function HoldToFire({
  disabled, busy, onFire,
}: { disabled: boolean; busy: boolean; onFire: () => void }) {
  const reduced = useReducedMotion();
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = () => {
    if (disabled || busy) return;
    setHolding(true);
    timer.current = setTimeout(() => { setHolding(false); onFire(); }, HOLD_MS);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  return (
    <button
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!disabled && !busy) onFire(); } }}
      disabled={disabled || busy}
      aria-label="Hold to dispatch manual signal through the engine gauntlet"
      className="qt-num relative w-full py-3.5 rounded-lg text-xs font-bold tracking-[0.18em] overflow-hidden disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)] select-none"
      style={{ border: "1px solid var(--qt-warn)", color: "var(--qt-warn)", background: "rgb(245 158 11 / 0.08)", touchAction: "none" }}
    >
      <motion.span
        className="absolute inset-y-0 left-0"
        style={{ background: "rgb(245 158 11 / 0.25)" }}
        initial={false}
        animate={{ width: holding ? "100%" : "0%" }}
        transition={holding && !reduced ? { duration: HOLD_MS / 1000, ease: "linear" } : { duration: 0.15 }}
      />
      <span className="relative flex items-center justify-center gap-2">
        <Flame size={14} />
        {busy ? "DISPATCHING…" : holding ? "HOLD…" : "HOLD TO FIRE → ENGINE GAUNTLET"}
      </span>
    </button>
  );
}

/* ================= Console ================= */
export function TripleFusionConsole() {
  const { telemetry } = useTelemetry();
  const ctx = useSignalContext();
  const { config } = useRiskConfig();
  const session = useSessionState();
  const fs = useFailsafeState();
  const { activeTrade } = useQueue();
  const qc = useQueryClient();

  const [direction, setDirection] = useState<Direction>("LONG");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tier, setTier] = useState<(typeof RISK_TIERS)[number]["tier"]>("T1");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const entryNum = parseFloat(entry) || 0;
  const slNum = parseFloat(sl) || 0;
  const valid = entryNum > 0 && slNum > 0;

  const preflight = useMemo(
    () =>
      valid
        ? evaluatePreflight(direction, entryNum, slNum, {
            volumeDelta: telemetry.volume_delta,
            magnetNode: telemetry.magnet_node,
            atr: ctx.atr,
            sessionActive: session.isActiveSession,
            positionLocked: !!activeTrade,
            embargoActive: fs.scheduleUnlocked ? fs.mode === "EMBARGO" : null,
            embargoEventName: fs.embargoEvent?.event_name,
          })
        : null,
    [valid, direction, entryNum, slNum, telemetry, ctx.atr, session.isActiveSession, activeTrade, fs],
  );

  const tierPct = RISK_TIERS.find((t) => t.tier === tier)!.pct;
  const tierLots =
    preflight && preflight.riskDistance > 0
      ? (config.total_equity * tierPct) / (preflight.riskDistance * PIP_VALUE_PER_LOT)
      : 0;

  const adoptPrediction = (p: NewsPrediction) => {
    setDirection(p.predicted_action === "BUY NOW" ? "LONG" : "SHORT");
    if (ctx.refPrice) setEntry(ctx.refPrice.toFixed(2));
    setResult(null);
  };

  const fire = async () => {
    if (!preflight?.canFire) return;
    setBusy(true);
    setResult(null);
    try {
      await adminFetch(
        "/webhook",
        buildManualPayload(direction, entryNum, slNum, telemetry, ctx.atr),
        "POST",
        { tokenInBody: true },
      );
      qc.invalidateQueries({ queryKey: ["queue"] });
      const okMsg = "Signal accepted — gauntlet passed. Auto-pilot is now monitoring; Telegram traffic-light sent.";
      setResult({ ok: true, msg: okMsg });
      toast.success(okMsg);
    } catch (e) {
      const errMsg =
        e instanceof AdminAuthError ? (e as Error).message : `Engine rejected: ${(e as Error).message}`;
      setResult({ ok: false, msg: errMsg });
      toast.error(errMsg);
    } finally {
      setBusy(false);
    }
  };

  const score = preflight ? Math.round((preflight.passes / preflight.checks.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-3 max-w-2xl mx-auto w-full">
      <FusionIntel onAdopt={adoptPrediction} />

      {/* ===== Manual override inputs ===== */}
      <section className="qt-card p-4 flex flex-col gap-3">
        <span className="qt-label" style={{ color: "var(--qt-text)" }}>Manual override · XAUUSD</span>

        <div className="grid grid-cols-2 gap-2">
          {(["LONG", "SHORT"] as Direction[]).map((d) => {
            const c = d === "LONG" ? "var(--qt-long)" : "var(--qt-short)";
            const active = direction === d;
            return (
              <button
                key={d}
                onClick={() => { setDirection(d); setResult(null); }}
                className="qt-num py-2.5 rounded-lg text-[11px] font-bold tracking-[0.14em] outline-none focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)]"
                style={{
                  border: `1px solid ${active ? c : "var(--qt-border-strong)"}`,
                  background: active ? `color-mix(in srgb, ${c} 12%, transparent)` : "transparent",
                  color: active ? c : "var(--qt-text-muted)",
                }}
              >
                {d === "LONG" ? "🟢 LONG" : "🔴 SHORT"}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="qt-label">Entry price</label>
            <input type="number" step="0.01" value={entry} placeholder={ctx.refPrice?.toFixed(2) ?? "0.00"}
              onChange={(e) => { setEntry(e.target.value); setResult(null); }}
              className={qtInputClass} style={qtInputStyle} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="qt-label">Stop loss</label>
            <input type="number" step="0.01" value={sl}
              onChange={(e) => { setSl(e.target.value); setResult(null); }}
              className={qtInputClass} style={qtInputStyle} />
          </div>
        </div>

        {/* Engine-enforced geometry — honest about who sets the numbers */}
        {preflight && (
          <div className="rounded-lg p-2.5 flex items-center justify-between flex-wrap gap-2" style={{ background: "var(--qt-surface-2)" }}>
            <span className="qt-num text-[9.5px]" style={{ color: "var(--qt-text-muted)" }}>
              Engine will set → SL <span style={{ color: "var(--qt-short)" }}>{preflight.engineSL.toFixed(2)}</span>
              {" · "}TP <span style={{ color: "var(--qt-long)" }}>{preflight.engineTP.toFixed(2)}</span>
              <span style={{ color: "var(--qt-text-faint)" }}> (fixed {ENGINE_RR}R — TP is not an input by design)</span>
            </span>
          </div>
        )}

        {/* Tier allocation preview (broadcast-side sizing) */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="qt-label">Risk tier</span>
          {RISK_TIERS.map(({ tier: t, pct }) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              className="qt-num px-2 py-1 rounded text-[9px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)]"
              style={{
                border: `1px solid ${tier === t ? "var(--qt-accent)" : "var(--qt-border-strong)"}`,
                color: tier === t ? "var(--qt-accent)" : "var(--qt-text-muted)",
              }}
            >
              {t} · {pct * 100}%
            </button>
          ))}
          {preflight && tierLots > 0 && (
            <span className="qt-num text-[9.5px]" style={{ color: "var(--qt-accent)" }}>
              → {tierLots.toFixed(2)} lots (${(config.total_equity * tierPct).toFixed(2)} at risk)
            </span>
          )}
        </div>
        <p className="qt-num text-[8.5px]" style={{ color: "var(--qt-text-faint)" }}>
          Sizing is broadcast-side (the Telegram tier matrix) — the tier here previews your allocation; it is not sent with the signal.
        </p>
      </section>

      {/* ===== Pre-Flight Confluence Radar ===== */}
      <section className="qt-card p-4 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="qt-label flex items-center gap-1.5" style={{ color: "var(--qt-text)" }}>
            <Radar size={12} /> Pre-flight confluence radar
          </span>
          {preflight && (
            <span className="qt-num text-[10px] font-bold" style={{ color: preflight.canFire ? "var(--qt-long)" : "var(--qt-short)" }}>
              {preflight.canFire ? `CLEAR · ${score}%` : `${preflight.hardBlocks} HARD BLOCK${preflight.hardBlocks > 1 ? "S" : ""}`}
            </span>
          )}
        </div>

        {preflight ? (
          <>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--qt-surface-2)" }}>
              <motion.span
                className="block h-full rounded-full"
                style={{ background: preflight.canFire ? "var(--qt-long)" : "var(--qt-short)" }}
                initial={false}
                animate={{ width: `${score}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
            <ul className="flex flex-col">
              {preflight.checks.map((c) => <CheckRow key={c.id} check={c} />)}
            </ul>
            <p className="qt-num text-[8.5px]" style={{ color: "var(--qt-text-faint)" }}>
              This radar predicts the engine's verdict from live telemetry. The server re-runs every check on dispatch and remains the authority.
            </p>
          </>
        ) : (
          <p className="qt-num text-[10px] py-3 text-center" style={{ color: "var(--qt-text-faint)" }}>
            Enter an entry price and stop loss to run pre-flight.
          </p>
        )}

        {result && (
          <p className="qt-num text-[10px] p-2 rounded" style={{
            color: result.ok ? "var(--qt-long)" : "var(--qt-short)",
            background: result.ok ? "rgb(16 185 129 / 0.08)" : "rgb(244 63 94 / 0.08)",
            border: `1px solid ${result.ok ? "var(--qt-long)" : "var(--qt-short)"}`,
          }}>
            {result.msg}
          </p>
        )}

        <HoldToFire disabled={!preflight?.canFire} busy={busy} onFire={fire} />
      </section>
    </div>
  );
}
