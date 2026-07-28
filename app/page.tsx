"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { 
  Activity, 
  Calculator, 
  ShieldAlert, 
  Target, 
  BookText, 
  Flame, 
  Lock, 
  Unlock, 
  CheckCircle2, 
  X, 
  Award,
  RefreshCw
} from "lucide-react"; 

interface RiskConfig {
  total_equity: number;
  max_allowed_layers: number;
  system_is_killed: boolean;
}

interface TradeLayer {
  id: string;
  trade_id: string;
  layer_type: "T1" | "T2" | "T3";
  risk_pct: number;
  target_price: number;
  stop_loss: number;
  status: "PENDING" | "HIT" | "STOPPED_BE" | "STOPPED_SL" | "DROPPED";
  realized_pnl: number;
}

interface QueueItem {
  id: string;
  ticker: string;
  action: string;
  status: string;
  created_at: string;
  zone_low?: number;
  zone_high?: number;
  entry_price?: number;
  stop_loss?: number;
  take_profit?: number;
  market_regime?: string;
  volume_delta?: number;
  magnet_node?: number;
  structure?: string;
  realized_pnl?: number;
  trade_layers?: TradeLayer[];
}

const backendUrl = "https://nexus-neural-machine-backend-production.up.railway.app";
const adminKey = process.env.NEXT_PUBLIC_ADMIN_KEY || "SuperSecretSecureToken2026!";

export default function QuantTerminal() {
  const [activeTab, setActiveTab] = useState<"TERMINAL" | "CALCULATOR" | "CONTROLS" | "JOURNAL" | "BURNER">("TERMINAL");
  
  const [config, setConfig] = useState<RiskConfig>({
    total_equity: 800.0,
    max_allowed_layers: 3,
    system_is_killed: false
  });

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loadingAction, setLoadingAction] = useState<boolean>(false);

  // Close Trade Modal State
  const [closeModalTrade, setCloseModalTrade] = useState<QueueItem | null>(null);
  const [modalOutcome, setModalOutcome] = useState<"WIN" | "LOSS" | "BREAKEVEN">("WIN");
  const [modalPnl, setModalPnl] = useState<string>("150.00");

  useEffect(() => {
    fetchInitialData();

    // Supabase Realtime Subscription
    const channel = supabase
      .channel("quant_terminal_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "execution_queue" }, () => {
        fetchInitialData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "risk_configuration" }, () => {
        fetchInitialData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchInitialData = async () => {
    // 1. Fetch Queue Items
    const { data: queueData } = await supabase
      .from("execution_queue")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (queueData) {
      setQueue(queueData);
    }

    // 2. Fetch Risk Config
    const { data: riskData } = await supabase
      .from("risk_configuration")
      .select("system_is_killed")
      .order("id", { ascending: false })
      .limit(1);

    if (riskData && riskData.length > 0) {
      setConfig((prev) => ({ ...prev, system_is_killed: riskData[0].system_is_killed }));
    }
  };

  // Find active locked trade
  const activeTrade = queue.find((item) => item.status === "ACTIVE");

  // 1. Accept Trade
  const handleAcceptTrade = async (tradeId: string) => {
    setLoadingAction(true);
    try {
      await fetch(`${backendUrl}/api/accept-trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
        body: JSON.stringify({ trade_id: tradeId })
      });
      fetchInitialData();
    } catch (e) {
      console.error("Error accepting trade:", e);
    } finally {
      setLoadingAction(false);
    }
  };

  // 2. Drop Trade
  const handleDropTrade = async (tradeId: string) => {
    setLoadingAction(true);
    try {
      await fetch(`${backendUrl}/api/drop-trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
        body: JSON.stringify({ trade_id: tradeId })
      });
      fetchInitialData();
    } catch (e) {
      console.error("Error dropping trade:", e);
    } finally {
      setLoadingAction(false);
    }
  };

  // 3. Submit Close Trade & PnL Modal
  const handleSubmitCloseTrade = async () => {
    if (!closeModalTrade) return;
    setLoadingAction(true);
    try {
      await fetch(`${backendUrl}/api/close-trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
        body: JSON.stringify({
          trade_id: closeModalTrade.id,
          outcome: modalOutcome,
          realized_pnl: parseFloat(modalPnl) || 0.0
        })
      });
      setCloseModalTrade(null);
      fetchInitialData();
    } catch (e) {
      console.error("Error closing trade:", e);
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24">
      {/* HEADER HUD */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur-xl px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold tracking-wider bg-gradient-to-r from-slate-100 to-cyan-400 bg-clip-text text-transparent uppercase">
                Neural Nexus Terminal
              </h1>
              <p className="text-[11px] text-slate-400 font-mono">XAUUSD Single-Position Guard Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Position Lock Status Pill */}
            <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-[11px] font-mono font-bold uppercase ${
              activeTrade 
                ? "bg-amber-500/10 border-amber-500/40 text-amber-400 animate-pulse" 
                : "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
            }`}>
              {activeTrade ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              <span>{activeTrade ? "POSITION LOCK ACTIVE" : "SYSTEM READY"}</span>
            </div>

            <div className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-[11px] font-mono font-bold uppercase ${
              config.system_is_killed ? "bg-rose-500/10 border-rose-500/40 text-rose-400" : "bg-slate-900 border-slate-800 text-slate-300"
            }`}>
              <ShieldAlert className={`w-3.5 h-3.5 ${config.system_is_killed ? "text-rose-400" : "text-emerald-400"}`} />
              <span>{config.system_is_killed ? "12-HR PAROLE" : "ARMED"}</span>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* TAB 1: TERMINAL / SIGNAL STREAM */}
        {activeTab === "TERMINAL" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider">Signal Stream</h2>
              <Button onClick={fetchInitialData} variant="outline" size="sm" className="h-8 border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200">
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
              </Button>
            </div>

            {queue.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-slate-900/30 border border-slate-800/50">
                <Target className="w-8 h-8 text-slate-600 mx-auto mb-3 animate-spin" />
                <p className="text-xs font-mono text-slate-400">Awaiting inbound TradingView webhooks...</p>
              </div>
            ) : (
              queue.map((sig) => {
                const isBuy = sig.action?.includes("BUY");
                const isPending = sig.status === "PENDING" || !sig.status;
                const isActive = sig.status === "ACTIVE";

                // Calculated Risk Lot Sizes
                const entryPrice = sig.entry_price || sig.zone_low || 2400.0;
                const stopLoss = sig.stop_loss || 2395.0;
                const slDistance = Math.max(Math.abs(entryPrice - stopLoss), 2.0);
                const lotT1 = (config.total_equity * 0.02) / (slDistance * 100);
                const lotT2 = (config.total_equity * 0.04) / (slDistance * 100);
                const lotT3 = (config.total_equity * 0.06) / (slDistance * 100);

                return (
                  <div
                    key={sig.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      isActive
                        ? "bg-amber-950/20 border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.12)]"
                        : isPending
                        ? "bg-slate-900/60 border-slate-800"
                        : "bg-slate-900/20 border-slate-800/50 opacity-60"
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                      {/* Left: Setup Metadata & Price Coordinates */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-black font-mono">{sig.ticker}</span>
                          <span className={`text-xs font-mono font-bold px-3 py-0.5 rounded-full border ${isBuy ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400" : "bg-rose-500/10 border-rose-500/40 text-rose-400"}`}>
                            {sig.action}
                          </span>

                          <span className={`text-[11px] font-mono px-3 py-0.5 rounded-full font-bold uppercase ${
                            isActive ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 animate-pulse" :
                            sig.status === "WIN" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" :
                            sig.status === "LOSS" ? "bg-rose-500/20 text-rose-400 border border-rose-500/40" :
                            sig.status === "DROPPED" ? "bg-slate-800 text-slate-500" :
                            "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                          }`}>
                            {sig.status || "PENDING"}
                          </span>
                        </div>

                        {/* Coordinates */}
                        <div className="flex items-center gap-5 text-xs font-mono text-slate-400 flex-wrap">
                          <span>Entry Zone: <strong className="text-slate-200">${sig.zone_low?.toFixed(2)} - ${sig.zone_high?.toFixed(2)}</strong></span>
                          <span>TP: <strong className="text-emerald-400">${sig.take_profit?.toFixed(2)}</strong></span>
                          <span>SL: <strong className="text-rose-400">${sig.stop_loss?.toFixed(2)}</strong></span>
                        </div>

                        {/* Lot Sizing Matrix */}
                        <div className="flex items-center gap-3 text-xs font-mono pt-0.5">
                          <span className="text-slate-500 text-[11px]">Position Risk Sizing:</span>
                          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">T1 (2%): <strong className="text-cyan-400">{lotT1.toFixed(2)} Lots</strong></span>
                          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">T2 (4%): <strong className="text-cyan-400">{lotT2.toFixed(2)} Lots</strong></span>
                          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">T3 (6%): <strong className="text-cyan-400">{lotT3.toFixed(2)} Lots</strong></span>
                        </div>
                      </div>

                      {/* Right: ACTION BUTTONS */}
                      <div className="flex items-center gap-3 w-full lg:w-auto justify-end">
                        {/* PENDING STATE: Take or Drop */}
                        {isPending && !activeTrade && (
                          <>
                            <Button
                              onClick={() => handleDropTrade(sig.id)}
                              disabled={loadingAction}
                              variant="outline"
                              className="border-slate-800 bg-slate-900 hover:bg-rose-950/40 hover:text-rose-300 text-xs font-mono font-bold"
                            >
                              DROP TRADE
                            </Button>
                            <Button
                              onClick={() => handleAcceptTrade(sig.id)}
                              disabled={loadingAction}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold shadow-lg shadow-emerald-950/50"
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1.5" /> TAKE TRADE
                            </Button>
                          </>
                        )}

                        {/* ACTIVE STATE: Close Position Button */}
                        {isActive && (
                          <Button
                            onClick={() => {
                              setCloseModalTrade(sig);
                              setModalOutcome("WIN");
                              setModalPnl("150.00");
                            }}
                            className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-mono font-black tracking-wider uppercase shadow-lg shadow-amber-950/50"
                          >
                            <Lock className="w-4 h-4 mr-1.5" /> CLOSE TRADE & LOG PNL
                          </Button>
                        )}

                        {/* RESOLVED STATE: Realized PnL badge */}
                        {!isPending && !isActive && (
                          <div className="text-right font-mono">
                            <p className="text-[10px] text-slate-500 uppercase">Realized PnL</p>
                            <p className={`text-sm font-bold ${sig.realized_pnl && sig.realized_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              ${sig.realized_pnl ? sig.realized_pnl.toFixed(2) : "0.00"}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: CALCULATOR */}
        {activeTab === "CALCULATOR" && (
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 max-w-md font-mono text-xs">
            <h3 className="text-sm font-bold text-slate-200">Position Sizing Calculator</h3>
            <p className="text-slate-400">Equity Balance: <strong className="text-emerald-400">${config.total_equity.toFixed(2)}</strong></p>
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <p>Standard Pip Multiplier: 100.0 (Gold XAUUSD)</p>
              <p>Risk Tiers: T1 (2%), T2 (4%), T3 (6%)</p>
            </div>
          </div>
        )}

        {/* TAB 3: CONTROLS */}
        {activeTab === "CONTROLS" && (
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 max-w-md font-mono text-xs">
            <h3 className="text-sm font-bold text-slate-200">System Risk Configuration</h3>
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950 border border-slate-800">
              <span>12-Hour Parole Status:</span>
              <strong className={config.system_is_killed ? "text-rose-400" : "text-emerald-400"}>
                {config.system_is_killed ? "KILLED" : "ACTIVE"}
              </strong>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER MOBILE NAV TABS */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 h-16 bg-slate-950/90 border-t border-slate-800 backdrop-blur-xl px-6">
        <div className="max-w-md mx-auto h-full flex items-center justify-around">
          <button onClick={() => setActiveTab("TERMINAL")} className={`flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === "TERMINAL" ? "text-cyan-400" : "text-slate-500 hover:text-slate-300"}`}>
            <Activity className="w-5 h-5" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Terminal</span>
          </button>

          <button onClick={() => setActiveTab("CALCULATOR")} className={`flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === "CALCULATOR" ? "text-cyan-400" : "text-slate-500 hover:text-slate-300"}`}>
            <Calculator className="w-5 h-5" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Sizer</span>
          </button>

          <button onClick={() => setActiveTab("CONTROLS")} className={`flex flex-col items-center justify-center gap-1 transition-colors ${activeTab === "CONTROLS" ? "text-cyan-400" : "text-slate-500 hover:text-slate-300"}`}>
            <ShieldAlert className="w-5 h-5" />
            <span className="text-[9px] font-bold uppercase tracking-wider">Controls</span>
          </button>
        </div>
      </nav>

      {/* CLOSE TRADE MODAL */}
      {closeModalTrade && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-5 font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" /> Close Position: {closeModalTrade.ticker}
              </h3>
              <button onClick={() => setCloseModalTrade(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-slate-400 block mb-2">Select Trade Outcome</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => { setModalOutcome("WIN"); setModalPnl("150.00"); }}
                    className={`py-2 rounded-xl font-bold border ${modalOutcome === "WIN" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500" : "bg-slate-950 text-slate-400 border-slate-800"}`}
                  >
                    WIN 🟢
                  </button>
                  <button
                    onClick={() => { setModalOutcome("LOSS"); setModalPnl("-50.00"); }}
                    className={`py-2 rounded-xl font-bold border ${modalOutcome === "LOSS" ? "bg-rose-500/20 text-rose-400 border-rose-500" : "bg-slate-950 text-slate-400 border-slate-800"}`}
                  >
                    LOSS 🔴
                  </button>
                  <button
                    onClick={() => { setModalOutcome("BREAKEVEN"); setModalPnl("0.00"); }}
                    className={`py-2 rounded-xl font-bold border ${modalOutcome === "BREAKEVEN" ? "bg-amber-500/20 text-amber-400 border-amber-500" : "bg-slate-950 text-slate-400 border-slate-800"}`}
                  >
                    BE 🟡
                  </button>
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Realized PnL Amount ($)</label>
                <input
                  type="number"
                  value={modalPnl}
                  onChange={(e) => setModalPnl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 font-bold"
                  placeholder="e.g. 150.00"
                />
              </div>

              <div className="pt-2 flex items-center gap-3">
                <Button onClick={() => setCloseModalTrade(null)} variant="outline" className="w-full border-slate-800 bg-slate-900 text-slate-300">
                  Cancel
                </Button>
                <Button onClick={handleSubmitCloseTrade} disabled={loadingAction} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-950/50">
                  {loadingAction ? "Submitting..." : "Confirm & Unlock Engine"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}