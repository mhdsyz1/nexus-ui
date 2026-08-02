// ============================================================
// PRE-FLIGHT MIRROR — pure functions, no React.
// Every check here PREDICTS a decision main.py will make
// server-side; the server remains the sole authority. If the
// backend thresholds ever change, constants.ts is the one place
// to update — nothing here invents new trading logic.
// ============================================================

import {
  DELTA_Z_REJECT,
  ENGINE_RR,
  MAGNET_HARD_BLOCK,
  MAGNET_TIER_CAP_PRESSURE,
  magnetPressure,
  computeStopBuffer,
  maxRiskDistance,
} from "./constants";

export type Direction = "LONG" | "SHORT";

export interface PreflightContext {
  volumeDelta: number;
  /** Filter 1's real input, in sigmas. undefined/null = feed down -> fail closed. */
  deltaZ?: number | null;
  /** Filter 2's band is regime-conditional. */
  regime?: string;
  magnetNode: number;
  atr: number | null;
  sessionActive: boolean;
  positionLocked: boolean;
  /** null = schedule locked on this device, so unknown */
  embargoActive: boolean | null;
  embargoEventName?: string;
}

export interface PreflightCheck {
  id: string;
  label: string;
  status: "PASS" | "BLOCK" | "WARN" | "UNKNOWN";
  detail: string;
  /** true = the server WILL reject on failure; false = advisory only */
  enforced: boolean;
}

export interface PreflightResult {
  checks: PreflightCheck[];
  hardBlocks: number;
  passes: number;
  canFire: boolean;
  /** SL the engine's geometry will actually set (mirrors the rewrite) */
  engineSL: number;
  /** TP the engine will enforce at 3R */
  engineTP: number;
  riskDistance: number;
}

export function evaluatePreflight(
  direction: Direction,
  entry: number,
  sl: number,
  ctx: PreflightContext,
): PreflightResult {
  const checks: PreflightCheck[] = [];
  const isLong = direction === "LONG";

  // --- Geometry (Filter 3): zone construction targets the user's SL,
  // so engineSL === user SL when valid; distances mirror main.py.
  // main.py compute_stop_buffer(): dynamic on ATR and session spread, not a
  // flat $2.50. maxRiskDistance(): vol-scaled between $10 and $15.
  const atrVal = ctx.atr ?? 0;
  const minBuffer = computeStopBuffer(atrVal);
  const maxRisk = maxRiskDistance(atrVal);
  const riskDistance = isLong ? entry - sl : sl - entry;
  const minOk = riskDistance >= minBuffer;
  const maxOk = riskDistance <= maxRisk;
  checks.push({
    id: "geometry",
    label: "Risk Geometry",
    enforced: true,
    status: minOk && maxOk ? "PASS" : "BLOCK",
    detail: !minOk
      ? `SL must sit ≥ $${minBuffer.toFixed(2)} ${isLong ? "below" : "above"} entry — dynamic buffer on ATR $${atrVal.toFixed(2)} and session spread`
      : !maxOk
        ? `Risk distance $${riskDistance.toFixed(2)} exceeds the vol-scaled cap $${maxRisk.toFixed(2)}`
        : `$${riskDistance.toFixed(2)} risk (${Math.round(riskDistance * 10)} pips) within engine bounds`,
  });

  // --- Filter 1: directional volume delta
  // Filter 1 gates on SIGMAS. An absent delta_z fails CLOSED server-side, so
  // the mirror must show a BLOCK rather than a pass when the feed is down.
  const z = ctx.deltaZ ?? null;
  const feedDown = z == null;
  const deltaBlocks = feedDown
    ? true
    : isLong
      ? z! < -DELTA_Z_REJECT
      : z! > DELTA_Z_REJECT;
  checks.push({
    id: "delta",
    label: "Filter 1 · CME delta_z",
    enforced: true,
    status: deltaBlocks ? "BLOCK" : "PASS",
    detail: feedDown
      ? "No delta_z from the Pine feed — the engine fails CLOSED and rejects every entry"
      : deltaBlocks
        ? `Δz ${z!.toFixed(2)}σ opposes a ${direction} beyond ±${DELTA_Z_REJECT}σ`
        : `Δz ${z!.toFixed(2)}σ permits ${direction} entries (gate ±${DELTA_Z_REJECT}σ)`,
  });

  // --- Filter 2: magnet floor trap (shorts only)
  if (!isLong && ctx.magnetNode > 0 && entry > ctx.magnetNode) {
    if (ctx.atr == null) {
      checks.push({
        id: "magnet",
        label: "Filter 2 · Magnet Trap",
        enforced: true,
        status: "UNKNOWN",
        detail: "No ATR context yet — the engine will still evaluate this server-side",
      });
    } else {
      const gap = entry - ctx.magnetNode;
      const regime = ctx.regime ?? "Unknown";
      const pressure = magnetPressure(entry, ctx.magnetNode, ctx.atr, regime);
      const trapped = pressure >= MAGNET_HARD_BLOCK;
      const capped = !trapped && pressure >= MAGNET_TIER_CAP_PRESSURE;
      checks.push({
        id: "magnet",
        label: "Filter 2 · Magnet Pressure",
        enforced: true,
        status: trapped ? "BLOCK" : capped ? "WARN" : "PASS",
        detail: trapped
          ? `Pressure ${pressure.toFixed(2)} — entry $${gap.toFixed(2)} above magnet ${ctx.magnetNode.toFixed(2)}, inside the ${regime} danger band`
          : capped
            ? `Pressure ${pressure.toFixed(2)} — passes, but the engine caps size at T1 above ${MAGNET_TIER_CAP_PRESSURE}`
            : `Pressure ${pressure.toFixed(2)} — clear of the ${regime} magnet band`,
      });
    }
  } else {
    checks.push({
      id: "magnet",
      label: "Filter 2 · Magnet Trap",
      enforced: true,
      status: "PASS",
      detail: isLong
        ? "Applies to shorts only"
        : "Entry not above an active magnet",
    });
  }

  // --- Position lock (server returns 423)
  checks.push({
    id: "lock",
    label: "Position Lock",
    enforced: true,
    status: ctx.positionLocked ? "BLOCK" : "PASS",
    detail: ctx.positionLocked
      ? "One position max — close the active trade first"
      : "Queue unlocked",
  });

  // --- Macro embargo shield (server returns 423)
  checks.push({
    id: "embargo",
    label: "Macro Embargo",
    enforced: true,
    status:
      ctx.embargoActive === null
        ? "UNKNOWN"
        : ctx.embargoActive
          ? "BLOCK"
          : "PASS",
    detail:
      ctx.embargoActive === null
        ? "Schedule locked on this device — the engine will still enforce it"
        : ctx.embargoActive
          ? `Red Folder window open: ${ctx.embargoEventName ?? "USD event"}`
          : "No embargo window active",
  });

  // --- AMD session (advisory: Pine gates sessions; the webhook does not)
  checks.push({
    id: "session",
    label: "AMD Session",
    enforced: false,
    status: ctx.sessionActive ? "PASS" : "WARN",
    detail: ctx.sessionActive
      ? "Inside an active session window"
      : "Outside Tokyo/London/NY — engine convention discourages entries (advisory)",
  });

  const hardBlocks = checks.filter((c) => c.enforced && c.status === "BLOCK").length;
  const passes = checks.filter((c) => c.status === "PASS").length;

  const engineSL = sl; // zone construction reverse-engineers the rewrite onto user SL
  const engineTP = isLong
    ? entry + riskDistance * ENGINE_RR
    : entry - riskDistance * ENGINE_RR;

  return {
    checks,
    hardBlocks,
    passes,
    canFire: hardBlocks === 0 && riskDistance > 0,
    engineSL,
    engineTP,
    riskDistance,
  };
}

/**
 * Builds the /webhook TradingViewPayload for a manual signal.
 * Zone geometry is constructed so process_smart_risk_geometry's
 * rewrite (zone ∓ $2.50 buffer) lands EXACTLY on the user's SL —
 * the engine stays in charge of the final numbers. Live telemetry
 * is embedded so Filters 1–2 evaluate against real market state.
 */
export function buildManualPayload(
  direction: Direction,
  entry: number,
  sl: number,
  telemetry: {
    volume_delta: number;
    magnet_node: number;
    market_regime: string;
    structure: string;
    delta_z?: number | null;
  },
  atr: number | null,
) {
  const isLong = direction === "LONG";
  return {
    ticker: "XAUUSD",
    timeframe: "MANUAL",
    action: isLong ? "BUY NOW" : "SELL NOW",
    entry_price: entry,
    // The engine re-derives SL from the zone edge minus its own dynamic
    // buffer, so the zone must be built with the SAME buffer or the server
    // will not reproduce the stop the operator asked for.
    zone_high: isLong ? entry : sl - computeStopBuffer(atr ?? 0),
    zone_low: isLong ? sl + computeStopBuffer(atr ?? 0) : entry,
    stop_loss: sl,
    take_profit: 0, // engine computes 3R in the rewrite
    atr_volatility: atr ?? 0,
    market_regime: telemetry.market_regime,
    structure: telemetry.structure,
    volume_delta: telemetry.volume_delta,
    magnet_node: telemetry.magnet_node,
    // Omitting this makes the server fail CLOSED and reject the manual fire.
    delta_z: telemetry.delta_z ?? null,
    timestamp: Date.now(),
    score: 100,
    confidence: "MANUAL",
    version: "manual_console_v1",
  };
}
