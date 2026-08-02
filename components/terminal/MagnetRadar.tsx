"use client";

import { motion, useReducedMotion } from "framer-motion";
import { MAGNET_BAND_BY_REGIME, MAGNET_BAND_DEFAULT, MAGNET_HARD_BLOCK, magnetPressure } from "@/lib/quant/constants";

interface MagnetRadarProps {
  magnetNode: number;
  refPrice: number | null;
  atr: number | null;
  asOf: string | null;
  /** Filter 2's band is regime-conditional; default matches main.py's fallback. */
  regime?: string;
}

const W = 220;
const H = 168;
const PAD_Y = 18;
const LADDER_X = 58;

/**
 * The signature instrument. A vertical price ladder rendering the
 * engine's Filter-2 geometry: the gold magnet line, the rose
 * floor-trap band (regime-conditional, 0.35–0.75 × ATR above the
 * magnet, where main.py rejects SELL entries at pressure >= 0.66),
 * and the last price the engine saw.
 * Pure visualization — the rejection logic itself stays in main.py.
 */
export function MagnetRadar({ magnetNode, refPrice, atr, asOf, regime = "Unknown" }: MagnetRadarProps) {
  const reduced = useReducedMotion();
  const hasMagnet = magnetNode > 0;
  const hasContext = refPrice != null && atr != null && atr > 0;

  if (!hasMagnet) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-1 py-6">
        <span className="qt-label">Magnet Node</span>
        <span className="qt-num text-[11px]" style={{ color: "var(--qt-text-faint)" }}>
          No magnet detected yet — awaiting pivot structure
        </span>
      </div>
    );
  }

  // ---- Scale: window the ladder around magnet ± 2 ATR (fallback ±$5)
  const span = hasContext ? atr! * 2 : 5;
  const top = magnetNode + span;
  const bottom = magnetNode - span;
  const toY = (price: number) => {
    const clamped = Math.min(Math.max(price, bottom), top);
    return PAD_Y + ((top - clamped) / (top - bottom)) * (H - PAD_Y * 2);
  };

  const magnetY = toY(magnetNode);
  // Filter 2 uses a REGIME-CONDITIONAL band, not a flat 0.5xATR. Chop widens
  // the danger zone to 0.75xATR; trends punch through, so it narrows to 0.35.
  const bandMult = MAGNET_BAND_BY_REGIME[regime] ?? MAGNET_BAND_DEFAULT;
  const trapTopPrice = hasContext
    ? magnetNode + atr! * bandMult
    : null;
  const trapTopY = trapTopPrice != null ? toY(trapTopPrice) : null;

  const priceY = hasContext ? toY(refPrice!) : null;
  const distATR = hasContext ? (refPrice! - magnetNode) / atr! : null;
  // Server rejects on PRESSURE >= 0.66, not on raw distance.
  const pressure = hasContext ? magnetPressure(refPrice!, magnetNode, atr!, regime) : 0;
  const inTrap = pressure >= MAGNET_HARD_BLOCK;

  const asOfLabel = asOf
    ? new Date(asOf).toISOString().slice(11, 16) + " UTC"
    : "—";

  return (
    <div className="flex flex-col h-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full flex-1"
        role="img"
        aria-label={
          inTrap
            ? "Price inside magnet floor-trap band; sell signals rejected"
            : "Magnet proximity ladder"
        }
      >
        {/* Ladder spine + rung ticks */}
        <line x1={LADDER_X} y1={PAD_Y} x2={LADDER_X} y2={H - PAD_Y} stroke="var(--qt-border-strong)" strokeWidth="1" />
        {[0.25, 0.5, 0.75].map((f) => {
          const y = PAD_Y + f * (H - PAD_Y * 2);
          return <line key={f} x1={LADDER_X - 4} y1={y} x2={LADDER_X + 4} y2={y} stroke="var(--qt-border)" strokeWidth="1" />;
        })}

        {/* Floor-trap band: magnet → magnet + 0.5 ATR */}
        {trapTopY != null && (
          <>
            <rect
              x={LADDER_X}
              y={trapTopY}
              width={W - LADDER_X - 8}
              height={Math.max(magnetY - trapTopY, 2)}
              fill="rgb(244 63 94 / 0.12)"
              stroke="rgb(244 63 94 / 0.35)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <text x={W - 12} y={trapTopY - 4} textAnchor="end" className="qt-num" fontSize="7.5" fill="var(--qt-short)">
              SELL TRAP ZONE · +{bandMult} ATR ({regime})
            </text>
          </>
        )}

        {/* Magnet line — the only gold in the terminal */}
        <line x1={LADDER_X - 8} y1={magnetY} x2={W - 8} y2={magnetY} stroke="var(--qt-magnet)" strokeWidth="1.75" />
        <text x={LADDER_X - 12} y={magnetY + 3} textAnchor="end" className="qt-num" fontSize="8.5" fontWeight="700" fill="var(--qt-magnet)">
          {magnetNode.toFixed(2)}
        </text>

        {/* Last engine ref price */}
        {priceY != null && (
          <motion.g
            initial={false}
            animate={{ y: 0 }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 18 }}
          >
            <line x1={LADDER_X - 8} y1={priceY} x2={W - 8} y2={priceY} stroke="var(--qt-accent)" strokeWidth="1" strokeDasharray="4 3" />
            <circle cx={LADDER_X} cy={priceY} r="3.5" fill="var(--qt-accent)" />
            <text x={LADDER_X - 12} y={priceY + 3} textAnchor="end" className="qt-num" fontSize="8.5" fill="var(--qt-accent)">
              {refPrice!.toFixed(2)}
            </text>
          </motion.g>
        )}
      </svg>

      {/* Readout row */}
      <div className="flex items-center justify-between pt-1.5 mt-auto" style={{ borderTop: "1px solid var(--qt-border)" }}>
        {distATR != null ? (
          <span
            className="qt-num text-[10px] font-bold"
            style={{ color: inTrap ? "var(--qt-short)" : "var(--qt-text-muted)" }}
          >
            Δ {distATR >= 0 ? "+" : ""}{distATR.toFixed(2)} ATR{" "}
            {distATR > 0 ? "above" : "below"} magnet
          </span>
        ) : (
          <span className="qt-num text-[10px]" style={{ color: "var(--qt-text-faint)" }}>
            Awaiting price context
          </span>
        )}
        <span className="qt-num text-[9px]" style={{ color: "var(--qt-text-faint)" }} title="Reference: last price seen by the signal engine, not a live feed">
          ref {asOfLabel}
        </span>
      </div>

      {inTrap && (
        <div
          className="qt-num mt-1.5 px-2 py-1 rounded text-[9px] font-bold tracking-wide"
          style={{
            color: "var(--qt-short)",
            background: "rgb(244 63 94 / 0.10)",
            border: "1px solid rgb(244 63 94 / 0.35)",
          }}
        >
          FLOOR TRAP — sell signals will be rejected by Filter 2
        </div>
      )}
    </div>
  );
}
