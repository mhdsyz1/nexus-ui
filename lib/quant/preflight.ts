// ============================================================
// PRE-FLIGHT MIRROR — pure functions, no React.
// Every check here PREDICTS a decision main.py will make
// server-side; the server remains the sole authority. If the
// backend thresholds ever change, constants.ts is the one place
// to update — nothing here invents new trading logic.
// ============================================================

import {
  DELTA_REJECT_THRESHOLD,
  ENGINE_RR,
  MAGNET_TRAP_ATR_MULT,
  MAX_RISK_USD,
  SL_BUFFER_USD,
} from "./constants";

export type Direction = "LONG" | "SHORT";

export interface PreflightContext {
  volumeDelta: number;
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
  const riskDistance = isLong ? entry - sl : sl - entry;
  const minOk = riskDistance >= SL_BUFFER_USD;
  const maxOk = riskDistance <= MAX_RISK_USD;
  checks.push({
    id: "geometry",
    label: "Risk Geometry",
    enforced: true,
    status: minOk && maxOk ? "PASS" : "BLOCK",
    detail: !minOk
      ? `SL must sit ≥ $${SL_BUFFER_USD.toFixed(2)} (25 pips) ${isLong ? "below" : "above"} entry — zone construction needs the buffer`
      : !maxOk
        ? `Risk distance $${riskDistance.toFixed(2)} exceeds the $${MAX_RISK_USD.toFixed(2)} (100-pip) engine cap`
        : `$${riskDistance.toFixed(2)} risk (${Math.round(riskDistance * 10)} pips) within engine bounds`,
  });

  // --- Filter 1: directional volume delta
  const deltaBlocks = isLong
    ? ctx.volumeDelta < -DELTA_REJECT_THRESHOLD
    : ctx.volumeDelta > DELTA_REJECT_THRESHOLD;
  checks.push({
    id: "delta",
    label: "Filter 1 · Volume Delta",
    enforced: true,
    status: deltaBlocks ? "BLOCK" : "PASS",
    detail: deltaBlocks
      ? `Live Δ ${Math.round(ctx.volumeDelta).toLocaleString()} opposes a ${direction} beyond ±${DELTA_REJECT_THRESHOLD}`
      : `Live Δ ${Math.round(ctx.volumeDelta).toLocaleString()} permits ${direction} entries`,
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
      const trapped = gap <= ctx.atr * MAGNET_TRAP_ATR_MULT;
      checks.push({
        id: "magnet",
        label: "Filter 2 · Magnet Trap",
        enforced: true,
        status: trapped ? "BLOCK" : "PASS",
        detail: trapped
          ? `Entry sits $${gap.toFixed(2)} above magnet ${ctx.magnetNode.toFixed(2)} — inside the ${MAGNET_TRAP_ATR_MULT}·ATR trap band`
          : `Entry clears the magnet trap band by $${(gap - ctx.atr * MAGNET_TRAP_ATR_MULT).toFixed(2)}`,
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
  },
  atr: number | null,
) {
  const isLong = direction === "LONG";
  return {
    ticker: "XAUUSD",
    timeframe: "MANUAL",
    action: isLong ? "BUY NOW" : "SELL NOW",
    entry_price: entry,
    zone_high: isLong ? entry : sl - SL_BUFFER_USD,
    zone_low: isLong ? sl + SL_BUFFER_USD : entry,
    stop_loss: sl,
    take_profit: 0, // engine computes 3R in the rewrite
    atr_volatility: atr ?? 0,
    market_regime: telemetry.market_regime,
    structure: telemetry.structure,
    volume_delta: telemetry.volume_delta,
    magnet_node: telemetry.magnet_node,
    timestamp: Date.now(),
    score: 100,
    confidence: "MANUAL",
    version: "manual_console_v1",
  };
}
