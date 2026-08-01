// ============================================================
// DATA CONTRACTS — projections of backend truth.
// Read plane: Supabase tables. Command plane: FastAPI (Phase 3+).
// ============================================================

/** GET /api/telemetry — latest engine telemetry snapshot */
export interface Telemetry {
  market_regime: string;
  structure: string;
  volume_delta: number;
  magnet_node: number;
}

/** Supabase: risk_configuration (latest row) */
export interface RiskConfig {
  total_equity: number;
  max_allowed_layers: number;
  system_is_killed: boolean;
  killed_at: string | null; // consumed by parole clock (Phase 3)
}

/** Supabase: trade_layers */
export interface TradeLayer {
  id: string;
  trade_id: string;
  layer_type: "T1" | "T2" | "T3";
  risk_pct: number;
  target_price: number;
  stop_loss: number;
  status: "PENDING" | "HIT" | "STOPPED_BE" | "STOPPED_SL" | "DROPPED";
  realized_pnl: number;
}

/** Supabase: execution_queue */
export interface QueueItem {
  id: string;
  ticker: string;
  action: string;
  status: string;
  created_at: string;
  score?: number;
  confidence?: string;
  entry_price?: number;
  zone_low?: number;
  zone_high?: number;
  stop_loss?: number;
  take_profit?: number;
  atr_volatility?: number;
  market_regime?: string;
  volume_delta?: number;
  magnet_node?: number;
  structure?: string;
  realized_pnl?: number;
  trade_layers?: TradeLayer[];
}

/**
 * Price/ATR context for the Magnet Radar. Sourced from the most
 * recent execution_queue row — labelled in the UI as "last signal
 * ref", never presented as a live market feed.
 */
export interface SignalContext {
  refPrice: number | null;
  atr: number | null;
  structure: string | null;
  asOf: string | null;
}

/** GET /api/macro-schedule — RED_FOLDER_SCHEDULE entries (main.py) */
export interface MacroEvent {
  event_id: string;
  event_name: string;
  impact: string;
  timestamp_utc: number;
  time_str: string;
  forecast: number;
  previous: number;
  embargo_start: number; // unix s — event − 15 min
  embargo_end: number;   // unix s — event + 5 min
}

/** Master failsafe state, priority KILLED > EMBARGO > ARMED */
export type FailsafeMode = "ARMED" | "KILLED" | "EMBARGO";

export type TerminalView =
  | "TERMINAL"
  | "BURNER"
  | "ANALYTICS"
  | "SIZER"
  | "CONTROLS";
