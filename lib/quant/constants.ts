// ============================================================
// SYSTEM CONSTANTS — single source of truth for the UI.
// Every threshold here mirrors a REAL decision line in the
// backend (main.py) or signal engine (SMC_V9_Matrix.pine).
// The UI visualizes these; it never re-implements trading logic.
// ============================================================

export const BACKEND_URL =
  "https://nexus-neural-machine-backend-production.up.railway.app";

/** main.py — Hard Telemetry Filter 1: delta mismatch rejection line */
export const DELTA_REJECT_THRESHOLD = 300;

/** SMC_V9_Matrix.pine — signal gate: |delta| must exceed 500 × session mult */
export const DELTA_SIGNAL_GATE = 500;

/** Delta gauge display scale (± range, clamped) */
export const DELTA_GAUGE_SCALE = 2500;

/** main.py — Filter 2: magnet floor-trap band = 0.5 × ATR above magnet */
export const MAGNET_TRAP_ATR_MULT = 0.5;

/** Telemetry poll cadences (ms) */
export const POLL_TELEMETRY_MS = 4_000;
export const POLL_SUPABASE_MS = 10_000;

/** Points of delta history retained for the pressure sparkline */
export const DELTA_HISTORY_LEN = 30;

/**
 * AMD session windows — mirrors Pine inputs exactly (UTC, Mon–Fri).
 * Asia crosses midnight; handled in useSessionState.
 */
export const SESSIONS_UTC = {
  TOKYO: { start: 22 * 60, end: 8 * 60 },   // 2200–0800
  LONDON: { start: 8 * 60, end: 16 * 60 },  // 0800–1600
  NEW_YORK: { start: 13 * 60, end: 21 * 60 }, // 1300–2100
} as const;

export type SessionName = keyof typeof SESSIONS_UTC | "CLOSED";

export type MarketRegime =
  | "TRENDING"
  | "CHOP (RANGE)"
  | "NEUTRAL"
  | "SQUEEZE"
  | string;
