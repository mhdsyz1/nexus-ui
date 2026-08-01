"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ResponsiveContainer, LineChart, Line, YAxis } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useTelemetry } from "@/hooks/useTelemetry";
import { useSignalContext } from "@/hooks/useSupabaseReads";
import {
  DELTA_GAUGE_SCALE,
  DELTA_REJECT_THRESHOLD,
  DELTA_SIGNAL_GATE,
} from "@/lib/quant/constants";
import { MagnetRadar } from "./MagnetRadar";

/* ---------- shared cell chrome ---------- */
function Cell({
  title,
  squeeze,
  children,
}: {
  title: string;
  squeeze?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`qt-card flex flex-col p-3 min-h-[190px] ${squeeze ? "qt-squeeze-cell" : ""}`}
    >
      <span className="qt-label mb-2">{title}</span>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}

/* ---------- 1. Regime Spectrum ---------- */
const REGIME_POSITIONS: Record<string, number> = {
  "CHOP (RANGE)": 12,
  NEUTRAL: 50,
  TRENDING: 88,
};

function RegimeSpectrum({ regime }: { regime: string }) {
  const reduced = useReducedMotion();
  const isSqueeze = regime === "SQUEEZE";

  if (isSqueeze) {
    // SQUEEZE is a mode, not a point on the spectrum — full takeover.
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1.5">
        <span
          className="qt-num text-xl font-bold tracking-[0.2em]"
          style={{ color: "var(--qt-squeeze)" }}
        >
          SQUEEZE
        </span>
        <span className="qt-num text-[10px]" style={{ color: "var(--qt-text-muted)" }}>
          Volatility compressed — breakout pre-alert state
        </span>
      </div>
    );
  }

  const pos = REGIME_POSITIONS[regime] ?? 50;
  const color =
    regime === "TRENDING"
      ? "var(--qt-accent)"
      : regime === "CHOP (RANGE)"
        ? "var(--qt-warn)"
        : "var(--qt-text-muted)";

  return (
    <div className="flex flex-col justify-center h-full gap-3">
      <div className="text-center">
        <span className="qt-num text-lg font-bold" style={{ color }}>
          {regime}
        </span>
      </div>

      <div className="relative h-2 rounded-full mx-1"
        style={{
          background:
            "linear-gradient(90deg, rgb(245 158 11 / 0.55), rgb(138 147 163 / 0.35), rgb(34 211 238 / 0.55))",
        }}
      >
        <motion.span
          className="absolute top-1/2 w-3 h-3 rounded-full border-2"
          style={{
            background: "var(--qt-bg)",
            borderColor: color,
            translateY: "-50%",
            translateX: "-50%",
          }}
          initial={false}
          animate={{ left: `${pos}%` }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 16 }}
        />
      </div>

      <div className="flex justify-between px-1">
        <span className="qt-num text-[8.5px]" style={{ color: "var(--qt-text-faint)" }}>CHOP</span>
        <span className="qt-num text-[8.5px]" style={{ color: "var(--qt-text-faint)" }}>NEUTRAL</span>
        <span className="qt-num text-[8.5px]" style={{ color: "var(--qt-text-faint)" }}>TRENDING</span>
      </div>
    </div>
  );
}

/* ---------- 2. Delta Pressure Gauge ---------- */
function DeltaPressureGauge({
  delta,
  history,
}: {
  delta: number;
  history: { t: number; delta: number }[];
}) {
  const reduced = useReducedMotion();
  const clamped = Math.max(-DELTA_GAUGE_SCALE, Math.min(DELTA_GAUGE_SCALE, delta));
  const pct = (clamped / DELTA_GAUGE_SCALE) * 50; // ±50% from center
  const positive = delta >= 0;

  // Would the middleware's Filter-1 reject an opposing entry right now?
  const rejectsShorts = delta > DELTA_REJECT_THRESHOLD;
  const rejectsLongs = delta < -DELTA_REJECT_THRESHOLD;

  const tick = (value: number) => 50 + (value / DELTA_GAUGE_SCALE) * 50;

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-baseline justify-between">
        <span
          className="qt-num text-lg font-bold"
          style={{ color: positive ? "var(--qt-long)" : "var(--qt-short)" }}
        >
          {positive ? "+" : ""}
          {Math.round(delta).toLocaleString()}
        </span>
        <span className="qt-num text-[9px]" style={{ color: "var(--qt-text-faint)" }}>
          scale ±{DELTA_GAUGE_SCALE.toLocaleString()}
        </span>
      </div>

      {/* Bidirectional bar anchored at zero */}
      <div className="relative h-3.5 rounded" style={{ background: "var(--qt-surface-2)" }}>
        <span className="absolute inset-y-0 left-1/2 w-px" style={{ background: "var(--qt-border-strong)" }} />
        {/* Decision-line ticks: ±300 middleware reject, ±500 Pine gate */}
        {[-DELTA_SIGNAL_GATE, -DELTA_REJECT_THRESHOLD, DELTA_REJECT_THRESHOLD, DELTA_SIGNAL_GATE].map((v) => (
          <span
            key={v}
            className="absolute inset-y-0 w-px"
            style={{
              left: `${tick(v)}%`,
              background: Math.abs(v) === DELTA_REJECT_THRESHOLD ? "rgb(244 63 94 / 0.55)" : "rgb(34 211 238 / 0.45)",
            }}
            title={
              Math.abs(v) === DELTA_REJECT_THRESHOLD
                ? `±${DELTA_REJECT_THRESHOLD}: middleware rejects opposing entries`
                : `±${DELTA_SIGNAL_GATE}: Pine signal gate`
            }
          />
        ))}
        <motion.span
          className="absolute inset-y-0.5 rounded-sm"
          style={{
            background: positive ? "var(--qt-long)" : "var(--qt-short)",
            left: positive ? "50%" : `${50 + pct}%`,
            transformOrigin: positive ? "left" : "right",
          }}
          initial={false}
          animate={{ width: `${Math.abs(pct)}%` }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 110, damping: 20 }}
        />
      </div>

      <span className="qt-num text-[9px] font-semibold" style={{ color: rejectsShorts || rejectsLongs ? "var(--qt-warn)" : "var(--qt-text-faint)" }}>
        {rejectsShorts
          ? `Filter 1: SHORT entries rejected while Δ > +${DELTA_REJECT_THRESHOLD}`
          : rejectsLongs
            ? `Filter 1: LONG entries rejected while Δ < −${DELTA_REJECT_THRESHOLD}`
            : "Filter 1 clear — delta permits both directions"}
      </span>

      {/* Momentum sparkline */}
      <div className="flex-1 min-h-[34px]">
        {history.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <YAxis hide domain={["auto", "auto"]} />
              <Line
                type="monotone"
                dataKey="delta"
                stroke={positive ? "var(--qt-long)" : "var(--qt-short)"}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="qt-num text-[9px]" style={{ color: "var(--qt-text-faint)" }}>
              Accumulating delta history…
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- 4. Structure Compass ---------- */
function StructureCompass({ structure, asOf }: { structure: string; asOf: string | null }) {
  const upper = structure.toUpperCase();
  const bull = upper.includes("BULL");
  const bear = upper.includes("BEAR");
  const Icon = bull ? TrendingUp : bear ? TrendingDown : Minus;
  const color = bull ? "var(--qt-long)" : bear ? "var(--qt-short)" : "var(--qt-text-muted)";

  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <span
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
        style={{ background: "var(--qt-surface-2)", border: `1px solid ${color}` }}
      >
        <Icon size={18} style={{ color }} />
        <span className="qt-num text-base font-bold" style={{ color }}>
          {structure}
        </span>
      </span>
      <span className="qt-num text-[9px]" style={{ color: "var(--qt-text-faint)" }}>
        {asOf
          ? `last shift ${new Date(asOf).toISOString().slice(11, 16)} UTC`
          : "no structure event recorded"}
      </span>
    </div>
  );
}

/* ---------- Matrix assembly ---------- */
export function TelemetryMatrix() {
  const { telemetry, deltaHistory, isLive } = useTelemetry();
  const ctx = useSignalContext();
  const squeeze = telemetry.market_regime === "SQUEEZE";

  return (
    <section aria-label="Live telemetry" className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="qt-label" style={{ color: "var(--qt-text)" }}>
          Telemetry Matrix
        </h2>
        <span className="qt-num text-[9px]" style={{ color: isLive ? "var(--qt-long)" : "var(--qt-text-faint)" }}>
          {isLive ? "● LIVE · 4s" : "○ CONNECTING"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
        <Cell title="Market Regime" squeeze={squeeze}>
          <RegimeSpectrum regime={telemetry.market_regime} />
        </Cell>
        <Cell title="Volume Delta Pressure">
          <DeltaPressureGauge delta={telemetry.volume_delta} history={deltaHistory} />
        </Cell>
        <Cell title="Magnet Proximity Radar">
          <MagnetRadar
            magnetNode={telemetry.magnet_node}
            refPrice={ctx.refPrice}
            atr={ctx.atr}
            asOf={ctx.asOf}
          />
        </Cell>
        <Cell title="Structure Compass">
          <StructureCompass structure={telemetry.structure} asOf={ctx.asOf} />
        </Cell>
      </div>
    </section>
  );
}
