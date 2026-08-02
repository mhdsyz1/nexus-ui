// ============================================================
// SYSTEM CONSTANTS — mirror of the backend's real decision lines.
//
// Every value here has a named counterpart in main.py or
// trading_state.py, cited inline. The UI visualises these; it never
// invents trading logic and the server remains the sole authority.
//
// DRIFT WARNING: this file previously claimed to mirror the backend
// while carrying a raw-delta threshold (300) the engine had already
// replaced with a 0.75σ gate, and a flat 2/4/6% lot matrix that told
// the operator to trade 0.02–0.05 lots while the engine sized 0.01.
// If you change a threshold in main.py, change it here in the same
// commit. Better still, replace this mirror with /api/preflight.
// Last reconciled against main.py: 2026-08-03.
// ============================================================

export const BACKEND_URL =
  "https://nexus-neural-machine-backend-production.up.railway.app";

// ---------- FILTER 1 · CME footprint delta ------------------------------
/** main.py DELTA_Z_REJECT — opposing conviction in sigmas, not raw delta. */
export const DELTA_Z_REJECT = 0.75;
/** Absent or NaN delta_z fails CLOSED server-side. */
export const DELTA_Z_FAILS_CLOSED = true;
/** Display scale for the sigma gauge (± range, clamped). */
export const DELTA_Z_GAUGE_SCALE = 3.0;
/** Raw-delta scale, retained for the volume sparkline only — NOT a threshold. */
export const DELTA_GAUGE_SCALE = 2500;

// ---------- FILTER 2 · magnet pressure gradient --------------------------
/** main.py MAGNET_BAND_BY_REGIME — danger band as a multiple of ATR. */
export const MAGNET_BAND_BY_REGIME: Record<string, number> = {
  "CHOP (RANGE)": 0.75,
  NEUTRAL: 0.5,
  TRENDING: 0.35,
  SQUEEZE: 0.6,
  Unknown: 0.5,
};
export const MAGNET_BAND_DEFAULT = 0.5;
/** main.py MAGNET_HARD_BLOCK — pressure at or above this rejects outright. */
export const MAGNET_HARD_BLOCK = 0.66;
/** main.py MAGNET_TIER_CAP_PRESSURE — above this the engine caps size at T1. */
export const MAGNET_TIER_CAP_PRESSURE = 0.33;

/** main.py magnet_pressure() — 0.0 when clear, approaching 1.0 on the magnet. */
export function magnetPressure(
  entry: number,
  magnet: number,
  atr: number,
  regime: string,
): number {
  if (magnet <= 0 || atr <= 0 || entry <= magnet) return 0;
  const band = (MAGNET_BAND_BY_REGIME[regime] ?? MAGNET_BAND_DEFAULT) * atr;
  const d = entry - magnet;
  return d <= band ? Math.max(0, 1 - d / band) : 0;
}

// ---------- FILTER 3 · Smart Risk Geometry v3 ----------------------------
/** main.py SESSION_SPREAD_EST — $ spread priors, XM Standard XAUUSD. */
export const SESSION_SPREAD_EST: Record<string, number> = {
  LONDON: 0.35,
  NEW_YORK: 0.3,
  TOKYO: 0.48,
  OFF: 0.6,
};
export const NEWS_SPREAD_MULT = 3.0;
export const NEAR_NEWS_WINDOW_MIN = 30;

export const BUFFER_ATR_FRACTION = 0.15;
export const BUFFER_FLOOR_USD = 2.5;
export const BUFFER_CEIL_USD = 6.0;
export const MAX_RISK_FLOOR_USD = 10.0;
export const MAX_RISK_HARD_USD = 15.0;

/**
 * main.py _active_spread_session(). NEW_YORK is tested before LONDON, so the
 * 13:00–16:00 overlap resolves to NEW_YORK — mirror that precedence exactly.
 */
export function activeSpreadSession(now: Date = new Date()): string {
  const day = now.getUTCDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return "OFF";
  const m = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (m >= 13 * 60 && m < 21 * 60) return "NEW_YORK";
  if (m >= 8 * 60 && m < 16 * 60) return "LONDON";
  if (m >= 22 * 60 || m < 8 * 60) return "TOKYO";
  return "OFF";
}

/** main.py estimated_spread(). */
export function estimatedSpread(nearNews = false, now: Date = new Date()): number {
  const s = SESSION_SPREAD_EST[activeSpreadSession(now)] ?? 0.6;
  return nearNews ? Math.round(s * NEWS_SPREAD_MULT * 100) / 100 : s;
}

/** main.py compute_stop_buffer(). */
export function computeStopBuffer(
  atr: number,
  nearNews = false,
  now: Date = new Date(),
): number {
  const raw = Math.max(
    BUFFER_FLOOR_USD,
    BUFFER_ATR_FRACTION * Math.max(atr, 0),
    3 * estimatedSpread(nearNews, now),
  );
  return Math.round(Math.min(raw, BUFFER_CEIL_USD) * 100) / 100;
}

/** main.py process_smart_risk_geometry() — vol-scaled cap. */
export function maxRiskDistance(atr: number): number {
  return (
    Math.round(
      Math.min(MAX_RISK_HARD_USD, Math.max(MAX_RISK_FLOOR_USD, 1.2 * atr)) * 100,
    ) / 100
  );
}

/** Engine target ladder: bank 50% at 1.5R, runner to 3.0R. */
export const ENGINE_RR_TP1 = 1.5;
export const ENGINE_RR = 3.0;

// ---------- POSITION SIZING · the MM ladder ------------------------------
// trading_state.py LOT_LADDER. Equity-only by design, and the engine trades
// one rung BELOW the balance's own tier (LADDER_TIER_OFFSET = 1): a $500
// account sizes off the $200 rung, a $1,000 account off the $500 rung.
export const LOT_LADDER: ReadonlyArray<{
  floor: number;
  lots: number;
  layers: number;
}> = [
  { floor: 50, lots: 0.01, layers: 3 },
  { floor: 100, lots: 0.01, layers: 5 },
  { floor: 200, lots: 0.01, layers: 10 },
  { floor: 500, lots: 0.02, layers: 10 },
  { floor: 1000, lots: 0.05, layers: 10 },
  { floor: 2000, lots: 0.1, layers: 10 },
  { floor: 5000, lots: 0.25, layers: 10 },
];
export const LADDER_TIER_OFFSET = 1;
export const BROKER_MIN_LOT = 0.01;
export const BROKER_LOT_STEP = 0.01;
/** XAUUSD contract = 100oz, so $1 of price move = $100 per lot. */
export const CONTRACT_OZ = 100;
export const PIP_VALUE_PER_LOT = 100;
/** 1 pip = $0.10 on gold. */
export const USD_PER_PIP = 0.1;

/** Floor to the broker step — sizing errors must round DOWN, never up. */
function roundLot(x: number): number {
  const steps = Math.floor(Math.max(0, x) / BROKER_LOT_STEP);
  return Math.max(
    BROKER_MIN_LOT,
    Math.round(steps * BROKER_LOT_STEP * 100) / 100,
  );
}

/** trading_state.py compute_position_size(). Returns lots PER LAYER. */
export function computePositionSize(equity: number): {
  lots: number;
  layers: number;
} {
  const eq = Number.isFinite(equity) ? equity : 0;
  if (eq < LOT_LADDER[0].floor)
    return { lots: BROKER_MIN_LOT, layers: LOT_LADDER[0].layers };

  let idx = 0;
  LOT_LADDER.forEach((t, i) => {
    if (eq >= t.floor) idx = i;
  });

  const eff = Math.max(0, idx - Math.max(0, LADDER_TIER_OFFSET));
  const tier = LOT_LADDER[eff];
  let lots = tier.lots;
  if (idx === LOT_LADDER.length - 1 && eq > LOT_LADDER[idx].floor) {
    lots = lots * (eq / LOT_LADDER[idx].floor);
  }
  return { lots: roundLot(lots), layers: tier.layers };
}

/** Dollar risk of ONE layer at the engine's size. */
export function riskPerLayer(
  entry: number,
  stop: number,
  lots: number,
): number {
  return Math.abs(entry - stop) * CONTRACT_OZ * lots;
}

// ---------- FAILSAFES ----------------------------------------------------
/** main.py DAILY_LOSS_LIMIT_PCT — vs the FROZEN UTC-midnight opening equity. */
export const DAILY_LOSS_LIMIT_PCT = 0.06;
/** main.py automated_parole_worker. */
export const PAROLE_HOURS = 12;
/** main.py EQUITY_STALE_HOURS. */
export const EQUITY_STALE_HOURS = 24;

// ---------- PRICE FEED & MARKET HOURS ------------------------------------
/** main.py PRICE_SYMBOL — spot proxy. GC=F carried a ~$60 basis. */
export const PRICE_SYMBOL = "PAXG-USD";
export const PRICE_SYMBOL_REF = "GC=F";

/** main.py is_market_open(). Gold spot, UTC. */
export function isMarketOpen(now: Date = new Date()): {
  open: boolean;
  reason: string;
} {
  const day = now.getUTCDay(); // 0 = Sun, 6 = Sat
  const m = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (day === 6) return { open: false, reason: "Saturday — gold closed" };
  if (day === 0) {
    return m >= 22 * 60
      ? { open: true, reason: "open" }
      : { open: false, reason: "Sunday pre-open" };
  }
  if (day === 5 && m >= 21 * 60)
    return { open: false, reason: "Friday post-close" };
  if (m >= 21 * 60 && m < 22 * 60)
    return { open: false, reason: "daily settlement break" };
  return { open: true, reason: "open" };
}

// ---------- POLLING ------------------------------------------------------
export const POLL_TELEMETRY_MS = 4_000;
export const POLL_SUPABASE_MS = 10_000;
export const POLL_QUEUE_MS = 5_000;
export const POLL_MACRO_MS = 300_000;
export const POLL_PREDICTIONS_MS = 30_000;
export const DELTA_HISTORY_LEN = 30;

/** localStorage key — matches the legacy page so existing devices keep working. */
export const ADMIN_KEY_STORAGE = "NEXUS_WEBHOOK_SECRET";

/** Pine session inputs (UTC, Mon–Fri). Asia crosses midnight. */
export const SESSIONS_UTC = {
  TOKYO: { start: 22 * 60, end: 8 * 60 },
  LONDON: { start: 8 * 60, end: 16 * 60 },
  NEW_YORK: { start: 13 * 60, end: 21 * 60 },
} as const;

export type SessionName = keyof typeof SESSIONS_UTC | "CLOSED";

export type MarketRegime =
  | "TRENDING"
  | "CHOP (RANGE)"
  | "NEUTRAL"
  | "SQUEEZE"
  | string;
