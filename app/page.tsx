"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Activity, Calculator, ShieldAlert, Target, BookText, Flame } from "lucide-react"; 

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
  stop_loss?: number;
  take_profit?: number;
  market_regime?: string;
  volume_delta?: number;
  magnet_node?: number;
  structure?: string;
  trade_layers?: TradeLayer[];
}

export default function QuantTerminal() {
  const [activeTab, setActiveTab] = useState<"TERMINAL" | "CALCULATOR" | "CONTROLS" | "JOURNAL" | "BURNER">("TERMINAL");
  
  const [config, setConfig] = useState<RiskConfig>({ total_equity: 250.0, max_allowed_layers: 4, system_is_killed: false });
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [analytics, setAnalytics] = useState({ winRate: 0, totalWins: 0, totalLosses: 0, netPnL: 0 });
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const isFetching = useRef(false);

  const [calcEquity, setCalcEquity] = useState<string>("250");
  const [calcRiskPct, setCalcRiskPct] = useState<string>("2");
  const [calcEntry, setCalcEntry] = useState<string>("2350.00");
  const [calcSL, setCalcSL] = useState<string>("2345.00");

  const [pendingJournalTradeId, setPendingJournalTradeId] = useState<string | null>(null);
  const [pendingOutcome, setPendingOutcome] = useState<"WIN" | "LOSS" | "BREAKEVEN" | "DROPPED" | null>(null);
  const [journalText, setJournalText] = useState("");
  const [journalHistory, setJournalHistory] = useState<any[]>([]);
  const [pnlInput, setPnlInput] = useState<string>("0.00"); 

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchDashboardData = async () => {
    if (isFetching.current) return;
    isFetching.current = true;

    try {
      const { data: configData, error: configError } = await supabase
        .from("risk_configuration")
        .select("total_equity, max_allowed_layers, system_is_killed")
        .order("created_at", { ascending: false }).limit(1).single();

      if (!configError && configData) setConfig(configData);

      // Hydrate relational trade_layers
      const { data: queueData, error: queueError } = await supabase
        .from("execution_queue")
        .select(`
          id, ticker, action, status, created_at, zone_low, zone_high, stop_loss, take_profit, market_regime, volume_delta, magnet_node, structure,
          trade_layers ( id, trade_id, layer_type, risk_pct, target_price, stop_loss, status, realized_pnl )
        `)
        .order("created_at", { ascending: false }).limit(5);

      if (!queueError && queueData) setQueue(queueData as any);

      const { data: statsData, error: statsError } = await supabase
        .from("execution_queue")
        .select("status, realized_pnl")
        .in("status", ["WIN", "LOSS", "BREAKEVEN"]);

      if (!statsError && statsData) {
        const wins = statsData.filter(t => t.status === "WIN").length;
        const losses = statsData.filter(t => t.status === "LOSS").length;
        const total = statsData.length;
        const totalPnL = statsData.reduce((sum, trade) => sum + (trade.realized_pnl || 0), 0);
        
        setAnalytics({
          totalWins: wins,
          totalLosses: losses,
          winRate: total > 0 ? (wins / total) * 100 : 0,
          netPnL: totalPnL
        });
      }
      
      if (activeTab === "JOURNAL") {
        const { data: jData } = await supabase
          .from("trade_journal")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(10);
        if (jData) setJournalHistory(jData);
      }

    } catch (err) {
      console.error("Telemetry error:", err);
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000);
    return () => clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    if (config.total_equity) setCalcEquity(config.total_equity.toString());
  }, [config.total_equity]);

  const toggleKillSwitch = async () => {
    const currentAction = config.system_is_killed ? "DEACTIVATE" : "ACTIVATE";
    const actionText = currentAction === "ACTIVATE" ? "HALT" : "RESTORE";
    
    const adminKey = window.prompt(`[AUTHORIZATION REQUIRED]\n\nEnter Webhook Secret Token to ${actionText} system:`);
    if (!adminKey) return; 

    try {
      const res = await fetch("https://nexus-neural-machine-backend-production.up.railway.app/api/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
        body: JSON.stringify({ action: currentAction })
      });
      if (res.ok) alert(`Command accepted. System ${currentAction}D.`);
      else alert("Command rejected. Invalid Token.");
    } catch (err) {
      alert("Fatal: Could not reach Railway backend.");
    }
  };

  const equityNum = parseFloat(calcEquity) || 0;
  const riskPctNum = parseFloat(calcRiskPct) || 0;
  const entryNum = parseFloat(calcEntry) || 0;
  const slNum = parseFloat(calcSL) || 0;
  const riskAmount = equityNum * (riskPctNum / 100);
  const slDistance = Math.abs(entryNum - slNum);
  const pipValuePerLot = 100;
  const lotSize = slDistance > 0 ? (riskAmount / (slDistance * pipValuePerLot)) : 0;

  const resolveSingleLayer = async (
    layerId: string, 
    tradeId: string, 
    layerType: "T1" | "T2" | "T3", 
    outcome: "HIT" | "STOPPED_BE" | "STOPPED_SL" | "DROPPED",
    pnl: number
  ) => {
    let secret = localStorage.getItem("NEXUS_WEBHOOK_SECRET");
    if (!secret) {
      secret = window.prompt("Enter Webhook Secret Token to authenticate:");
      if (!secret) return;
      localStorage.setItem("NEXUS_WEBHOOK_SECRET", secret);
    }

    try {
      const res = await fetch("https://nexus-neural-machine-backend-production.up.railway.app/api/resolve-layer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret_token: secret,
          layer_id: layerId,
          trade_id: tradeId,
          layer_type: layerType,
          outcome: outcome,
          pnl_amount: pnl
        })
      });

      if (res.ok) {
        fetchDashboardData();
      } else {
        alert("Layer resolution failed.");
      }
    } catch (err) {
      alert("Network error.");
    }
  };

  const resolveTrade = (id: string, outcome: "WIN" | "LOSS" | "BREAKEVEN" | "DROPPED") => {
    let vaultSecret = localStorage.getItem("NEXUS_WEBHOOK_SECRET");
    if (!vaultSecret) {
      vaultSecret = window.prompt("Enter Webhook Secret Token to authenticate:");
      if (!vaultSecret) return;
      localStorage.setItem("NEXUS_WEBHOOK_SECRET", vaultSecret);
    }

    if (outcome === "DROPPED") {
      executeAtomicResolution(id, outcome, "Setup dropped. Did not execute.", vaultSecret);
      return;
    }

    setPendingJournalTradeId(id);
    setPendingOutcome(outcome);
  };

  const executeAtomicResolution = async (id: string, outcome: string, journalEntry: string, secret: string) => {
    try {
      setQueue(prev => prev.map(item => item.id === id ? { ...item, status: outcome } : item));

      const { error: dbError } = await supabase.from("trade_journal").insert({
        trade_id: id,
        reason_for_entry: journalEntry
      });

      if (dbError) {
        alert(`Database Rejected Entry: ${dbError.message}`);
        setQueue(prev => prev.map(item => item.id === id ? { ...item, status: "PENDING" } : item)); 
        return;
      }

      const res = await fetch("https://nexus-neural-machine-backend-production.up.railway.app/api/resolve-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          secret_token: secret,
          trade_id: id,
          outcome: outcome,
          pnl_amount: parseFloat(pnlInput) || 0 
        })
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) localStorage.removeItem("NEXUS_WEBHOOK_SECRET");
        setQueue(prev => prev.map(item => item.id === id ? { ...item, status: "PENDING" } : item)); 
        alert("Execution failed at API layer.");
        return;
      }

      setPendingJournalTradeId(null);
      setPendingOutcome(null);
      setJournalText("");
      setPnlInput("0.00");
      fetchDashboardData();

    } catch (err) {
      alert("Fatal: Network error reaching backend.");
      setQueue(prev => prev.map(item => item.id === id ? { ...item, status: "PENDING" } : item));
    }
  };

  const submitJournal = () => {
    if (!pendingJournalTradeId || !pendingOutcome || !journalText.trim()) return;
    const secret = localStorage.getItem("NEXUS_WEBHOOK_SECRET");
    executeAtomicResolution(pendingJournalTradeId, pendingOutcome, journalText, secret!);
  };

  const calculateSignalLots = (equity: number, riskPct: number, zoneLow?: number, zoneHigh?: number, sl?: number) => {
    if (!zoneLow || !zoneHigh || !sl) return 0;
    const midZone = (zoneLow + zoneHigh) / 2;
    const distance = Math.abs(midZone - sl);
    if (distance === 0) return 0;
    return (equity * riskPct) / (distance * 100); 
  };

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-background text-foreground font-mono relative">
      
      {/* MODAL OVERLAY: FORCED CONTEXT JOURNALING */}
      {pendingJournalTradeId && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
            <div className="bg-zinc-950 border border-border/50 rounded-xl p-5 w-full max-w-md shadow-2xl flex flex-col gap-4">
                <div className="border-b border-border/50 pb-3">
                    <h3 className="text-lg font-bold text-primary tracking-wider uppercase">Log Trade Context</h3>
                    <p className="text-xs text-muted-foreground mt-1">Why did you execute this setup?</p>
                </div>

                {(pendingOutcome === "WIN" || pendingOutcome === "LOSS") && (
                  <div className="flex flex-col gap-1.5 pb-2">
                    <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Realized PnL ($)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      className="w-full p-2 bg-zinc-900 border border-border/50 rounded-lg focus:ring-1 focus:ring-primary outline-none text-sm text-foreground"
                      placeholder={pendingOutcome === "WIN" ? "+15.50" : "-5.00"}
                      value={pnlInput}
                      onChange={(e) => setPnlInput(e.target.value)}
                    />
                  </div>
                )}

                <textarea 
                    className="w-full h-32 p-3 bg-zinc-900 border border-border/50 rounded-lg focus:ring-1 focus:ring-primary outline-none text-sm resize-none text-foreground"
                    placeholder="e.g., M5 orderblock tap aligned with H1 bullish trend."
                    value={journalText}
                    onChange={(e) => setJournalText(e.target.value)}
                />
                <div className="flex gap-2 pt-2">
                    <Button variant="ghost" className="flex-1 border border-border/50 text-xs tracking-wider" onClick={() => { setPendingJournalTradeId(null); setPendingOutcome(null); }}>SKIP</Button>
                    <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold tracking-wider" onClick={submitJournal}>SAVE ENTRY</Button>
                </div>
            </div>
        </div>
      )}

      {/* TOP STATUS BAR */}
      <header className="flex justify-between items-center p-3 border-b border-border/50 bg-card shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${config.system_is_killed ? "bg-red-600 animate-none" : "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"}`} />
          <h1 className="text-sm font-bold tracking-widest uppercase text-primary">
            {config.system_is_killed ? "SYSTEM HALTED" : "NEXUS LIVE"}
          </h1>
        </div>
        <div className="text-sm font-bold text-muted-foreground bg-secondary/50 px-3 py-1 rounded-md border border-border/50">
          {currentTime ? currentTime.toLocaleTimeString('en-SG', { hour12: false }) : "--:--:--"}
        </div>
      </header>

      {/* MAIN CANVAS */}
      <main className="flex-1 overflow-y-auto p-4 pb-24">
        
        {/* TERMINAL */}
        {activeTab === "TERMINAL" && (
          <div className="flex flex-col gap-4 h-full">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 border border-border/50 rounded-xl bg-zinc-900/50 flex flex-col items-center justify-center">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Live Equity</span>
                <span className="text-lg font-bold text-primary">${config.total_equity.toFixed(2)}</span>
              </div>
              <div className="p-3 border border-border/50 rounded-xl bg-zinc-900/50 flex flex-col items-center justify-center">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Win Rate</span>
                <span className="text-lg font-bold text-emerald-400">{analytics.winRate.toFixed(1)}%</span>
              </div>
              <div className="p-3 border border-border/50 rounded-xl bg-zinc-900/50 flex flex-col items-center justify-center">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Total Wins</span>
                <span className="text-lg font-bold text-foreground">{analytics.totalWins}</span>
              </div>
              <div className="p-3 border border-border/50 rounded-xl bg-zinc-900/50 flex flex-col items-center justify-center">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Total Losses</span>
                <span className="text-lg font-bold text-rose-400">{analytics.totalLosses}</span>
              </div>
              <div className="col-span-2 p-3 border border-border/50 rounded-xl bg-zinc-900/50 flex flex-col items-center justify-center">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Net PnL</span>
                <span className={`text-lg font-bold ${analytics.netPnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  ${analytics.netPnL.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="p-4 border border-border/50 rounded-xl bg-card shadow-sm">
              <div className="flex items-center gap-2 border-b border-border/50 pb-2 mb-3">
                <Target size={14} className="text-primary" />
                <h3 className="text-xs text-muted-foreground uppercase tracking-wider">Execution Queue</h3>
              </div>
              
              <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                {loading ? (
                  <div className="text-xs text-muted-foreground text-center py-6 animate-pulse">Syncing Ledger...</div>
                ) : queue.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-6">Queue clear. No pending setups.</div>
                ) : (
                  queue.map((item) => {
                    const isPending = item.status === "PENDING";

                    return (
                      <div key={item.id} className={`p-3 border rounded-lg text-xs shadow-sm flex flex-col gap-3 transition-colors ${isPending ? "bg-zinc-950 border-primary/30" : "bg-background border-border/40 opacity-75"}`}>
                        <div className="flex justify-between items-center">
                          <span className={`font-bold text-sm ${item.action === "BUY" ? "text-emerald-500" : "text-rose-500"}`}>
                            {item.action} {item.ticker}
                          </span>
                          <span className="text-muted-foreground text-[10px]">{new Date(item.created_at).toLocaleTimeString([], { hour12: false })}</span>
                        </div>

                        {isPending && item.zone_low && (
                          <div className="bg-background/50 p-3 rounded-md border border-border/30 flex flex-col gap-2">
                            <div className="flex justify-between items-center border-b border-border/30 pb-1">
                              <span className="text-muted-foreground text-[10px] uppercase">Entry Zone</span>
                              <span className="font-bold">{item.zone_low.toFixed(2)} - {item.zone_high?.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-border/30 pb-1">
                              <span className="text-muted-foreground text-[10px] uppercase">Stop Loss</span>
                              <span className="font-bold text-rose-400">{item.stop_loss?.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-border/30 pb-1">
                              <span className="text-muted-foreground text-[10px] uppercase">Take Profit</span>
                              <span className="font-bold text-emerald-400">{item.take_profit?.toFixed(2)}</span>
                            </div>
                          </div>
                        )}

                        {/* PHASE 2.2: MULTI-TRANCHE RUNNER MATRIX UI */}
                        {item.trade_layers && item.trade_layers.length > 0 && (
                          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border/30">
                            {item.trade_layers.sort((a,b) => a.layer_type.localeCompare(b.layer_type)).map((layer) => {
                              const layerPending = layer.status === "PENDING";
                              const layerLot = calculateSignalLots(config.total_equity, layer.risk_pct, item.zone_low, item.zone_high, item.stop_loss);

                              return (
                                <div key={layer.id} className="bg-zinc-900/80 p-2 rounded-lg border border-border/40 flex flex-col gap-1.5">
                                  <div className="flex justify-between items-center">
                                    <span className="font-bold text-[10px] text-primary">{layer.layer_type} ({Math.round(layer.risk_pct * 100)}%)</span>
                                    <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${
                                      layer.status === "HIT" ? "bg-emerald-500/20 text-emerald-400" :
                                      layer.status === "STOPPED_SL" ? "bg-rose-500/20 text-rose-400" :
                                      layer.status === "STOPPED_BE" ? "bg-amber-500/20 text-amber-400" :
                                      "bg-zinc-800 text-muted-foreground"
                                    }`}>
                                      {layer.status}
                                    </span>
                                  </div>

                                  <div className="text-[10px] font-bold text-foreground flex justify-between">
                                    <span className="text-muted-foreground text-[8px]">Size:</span>
                                    <span>{layerLot.toFixed(2)} Lots</span>
                                  </div>

                                  {layerPending && item.status === "PENDING" && (
                                    <div className="grid grid-cols-2 gap-1 pt-1">
                                      <Button 
                                        size="sm" 
                                        onClick={() => resolveSingleLayer(layer.id, item.id, layer.layer_type, "HIT", 15.00)} 
                                        className="h-5 text-[8px] bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 p-0 font-bold"
                                      >
                                        HIT
                                      </Button>
                                      <Button 
                                        size="sm" 
                                        onClick={() => resolveSingleLayer(layer.id, item.id, layer.layer_type, "STOPPED_BE", 0.00)} 
                                        className="h-5 text-[8px] bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 p-0 font-bold"
                                      >
                                        BE
                                      </Button>
                                      <Button 
                                        size="sm" 
                                        onClick={() => resolveSingleLayer(layer.id, item.id, layer.layer_type, "STOPPED_SL", -5.00)} 
                                        className="h-5 text-[8px] bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 p-0 font-bold"
                                      >
                                        SL
                                      </Button>
                                      <Button 
                                        size="sm" 
                                        onClick={() => resolveSingleLayer(layer.id, item.id, layer.layer_type, "DROPPED", 0.00)} 
                                        variant="ghost" 
                                        className="h-5 text-[8px] text-muted-foreground p-0 font-bold border border-border/40"
                                      >
                                        DROP
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {isPending && (
                          <div className="grid grid-cols-4 gap-1.5 mt-1">
                            <Button size="sm" onClick={() => resolveTrade(item.id, "WIN")} className="h-8 text-[10px] bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 font-bold border border-emerald-500/20">ALL WIN</Button>
                            <Button size="sm" onClick={() => resolveTrade(item.id, "LOSS")} className="h-8 text-[10px] bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 font-bold border border-rose-500/20">ALL SL</Button>
                            <Button size="sm" onClick={() => resolveTrade(item.id, "BREAKEVEN")} className="h-8 text-[10px] bg-zinc-500/10 text-zinc-400 hover:bg-zinc-500/20 font-bold border border-zinc-500/20">ALL BE</Button>
                            <Button size="sm" onClick={() => resolveTrade(item.id, "DROPPED")} variant="ghost" className="h-8 text-[10px] text-muted-foreground hover:text-foreground font-bold border border-border/50">DROP</Button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* TELEMETRY MATRIX HUD */}
            <div className="flex-1 border border-border/30 rounded-xl bg-zinc-950/80 shadow-inner min-h-80 relative overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-3 border-b border-border/30 bg-zinc-900/50">
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-primary" />
                  <h3 className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Quant Telemetry Matrix</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest">Live Sync</span>
                </div>
              </div>
              
              <div className="p-4 grid grid-cols-2 gap-3 flex-1 content-start">
                <div className="p-3 border border-border/20 rounded-lg bg-background/50">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1">Market Regime</span>
                  <span className={`text-sm font-bold ${queue[0]?.market_regime === "TRENDING" ? "text-cyan-400" : queue[0]?.market_regime === "SQUEEZE" ? "text-fuchsia-400" : "text-amber-400"}`}>
                    {queue[0]?.market_regime || "AWAITING DATA"}
                  </span>
                </div>
                
                <div className="p-3 border border-border/20 rounded-lg bg-background/50">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1">Structure</span>
                  <span className="text-sm font-bold text-foreground">
                    {queue[0]?.structure || "NEUTRAL"}
                  </span>
                </div>

                <div className="p-3 border border-border/20 rounded-lg bg-background/50">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1">Footprint Delta</span>
                  <span className={`text-sm font-bold ${Number(queue[0]?.volume_delta) > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {queue[0]?.volume_delta ? Number(queue[0].volume_delta).toLocaleString() : "0"}
                  </span>
                </div>

                <div className="p-3 border border-border/20 rounded-lg bg-background/50">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1">Inst. Magnet</span>
                  <span className="text-sm font-bold text-amber-400">
                    ${queue[0]?.magnet_node?.toFixed(2) || "0.00"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* JOURNAL */}
        {activeTab === "JOURNAL" && (
          <div className="flex flex-col gap-4 h-full">
            <div className="p-4 border border-border/50 rounded-xl bg-card shadow-sm">
                <div className="flex items-center gap-2 border-b border-border/50 pb-2 mb-4">
                    <BookText size={16} className="text-primary" />
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Trading Journal Logs</h3>
                </div>
                
                <div className="space-y-4">
                    {journalHistory.length === 0 ? (
                        <div className="text-xs text-muted-foreground text-center py-6">No journal entries found. Execute a trade to log context.</div>
                    ) : (
                        journalHistory.map((log) => (
                            <div key={log.id} className="p-3 bg-zinc-900/50 border border-border/50 rounded-lg flex flex-col gap-2">
                                <div className="text-[10px] text-muted-foreground flex justify-between items-center border-b border-border/20 pb-1">
                                    <span>Log ID: {String(log.id).split("-")[0]}</span>
                                    <span>{new Date(log.created_at).toLocaleDateString()}</span>
                                </div>
                                <p className="text-xs text-foreground mt-1 leading-relaxed">{log.reason_for_entry}</p>
                            </div>
                        ))
                    )}
                </div>
            </div>
          </div>
        )}

        {/* CALCULATOR */}
        {activeTab === "CALCULATOR" && (
          <div className="w-full max-w-md mx-auto p-5 border border-border/50 rounded-xl bg-card shadow-sm">
            <h3 className="text-lg font-bold mb-5 text-primary border-b border-border/50 pb-3 font-mono">XAUUSD Position Sizer</h3>
            <div className="space-y-5 text-sm font-mono">
              <div className="flex flex-col gap-1.5">
                <label className="text-muted-foreground font-semibold">Account Equity ($)</label>
                <input type="number" value={calcEquity} onChange={(e) => setCalcEquity(e.target.value)} className="w-full text-base p-3 bg-background border border-border/50 rounded-lg focus:ring-2 focus:ring-primary outline-none text-foreground" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-muted-foreground font-semibold">Risk Percentage (%)</label>
                <input type="number" step="0.1" value={calcRiskPct} onChange={(e) => setCalcRiskPct(e.target.value)} className="w-full text-base p-3 bg-background border border-border/50 rounded-lg focus:ring-2 focus:ring-primary outline-none text-foreground" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-muted-foreground font-semibold">Entry Price</label>
                  <input type="number" step="0.01" value={calcEntry} onChange={(e) => setCalcEntry(e.target.value)} className="w-full text-base p-3 bg-background border border-border/50 rounded-lg focus:ring-2 focus:ring-primary outline-none text-foreground" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-muted-foreground font-semibold">Stop Loss</label>
                  <input type="number" step="0.01" value={calcSL} onChange={(e) => setCalcSL(e.target.value)} className="w-full text-base p-3 bg-background border border-border/50 rounded-lg focus:ring-2 focus:ring-primary outline-none text-foreground" />
                </div>
              </div>

              {lotSize > 0 ? (
                <div className="mt-6 p-5 bg-background border border-border/50 rounded-xl space-y-3 shadow-inner">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider">Capital at Risk</span>
                    <span className="font-bold text-destructive">${riskAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider">SL Distance</span>
                    <span className="font-bold">{slDistance.toFixed(2)} pts</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-border/50 pt-3 mt-3">
                    <span className="text-muted-foreground font-bold uppercase tracking-wider">Execute Size</span>
                    <span className="font-bold text-emerald-500 text-2xl">{lotSize.toFixed(2)} Lots</span>
                  </div>
                </div>
              ) : (
                <div className="text-center text-xs text-muted-foreground bg-background p-4 border border-dashed border-border/50 rounded-xl mt-4">
                  Enter valid metrics to calculate size.
                </div>
              )}
            </div>
          </div>
        )}

        {/* CONTROLS */}
        {activeTab === "CONTROLS" && (
          <div className="w-full max-w-md mx-auto p-5 border border-border/50 rounded-xl bg-card shadow-sm flex flex-col gap-6">
            <div>
              <h3 className="text-lg font-bold text-primary border-b border-border/50 pb-3 mb-2">Admin Overrides</h3>
              <p className="text-xs text-muted-foreground">Require master API key authorization to execute.</p>
            </div>
            
            <div className="p-4 border border-red-900/30 bg-red-950/10 rounded-xl">
              <Button 
                onClick={toggleKillSwitch}
                size="lg"
                variant={config.system_is_killed ? "default" : "destructive"} 
                className={`w-full font-bold tracking-wider uppercase transition-colors ${config.system_is_killed ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}`}
              >
                {config.system_is_killed ? "RESTORE SYSTEM" : "ACTIVATE KILL SWITCH"}
              </Button>
            </div>
          </div>
        )}

        {/* BURNER */}
        {activeTab === "BURNER" && (
          <div className="flex flex-col gap-4 h-full">
            <div className="p-4 border border-border/50 rounded-xl bg-card shadow-sm flex flex-col gap-2">
                <div className="flex items-center gap-2 border-b border-border/50 pb-2 mb-2">
                    <Flame size={16} className="text-orange-500" />
                    <h3 className="text-xs font-bold text-orange-500 uppercase tracking-wider">Kinetic Event Protocol</h3>
                </div>
                <div className="p-3 border border-orange-900/30 bg-orange-950/10 rounded-lg flex justify-between items-center">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Burner Equity</span>
                    <span className="text-lg font-bold text-foreground">$50.00</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                  Isolated full-margin execution sandbox.
                </p>
            </div>
            
            <div className="flex-1 border-2 border-orange-900/20 border-dashed rounded-xl bg-zinc-950/30 flex flex-col items-center justify-center text-muted-foreground shadow-inner min-h-80">
              <span className="text-xs uppercase tracking-widest font-bold text-orange-900/50">Module Offline</span>
            </div>
          </div>
        )}
      </main>

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-0 w-full bg-card border-t border-border/50 pb-safe shrink-0 z-40">
        <div className="flex justify-around items-center h-16 max-w-md mx-auto px-2">
          <button onClick={() => setActiveTab("TERMINAL")} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === "TERMINAL" ? "text-primary" : "text-muted-foreground hover:text-primary/70"}`}>
            <Activity size={20} strokeWidth={activeTab === "TERMINAL" ? 2.5 : 2} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Terminal</span>
          </button>
          
          <button onClick={() => setActiveTab("JOURNAL")} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === "JOURNAL" ? "text-primary" : "text-muted-foreground hover:text-primary/70"}`}>
            <BookText size={20} strokeWidth={activeTab === "JOURNAL" ? 2.5 : 2} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Journal</span>
          </button>

          <button onClick={() => setActiveTab("CALCULATOR")} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === "CALCULATOR" ? "text-primary" : "text-muted-foreground hover:text-primary/70"}`}>
            <Calculator size={20} strokeWidth={activeTab === "CALCULATOR" ? 2.5 : 2} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Sizer</span>
          </button>

          <button onClick={() => setActiveTab("CONTROLS")} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === "CONTROLS" ? "text-primary" : "text-muted-foreground hover:text-primary/70"}`}>
            <ShieldAlert size={20} strokeWidth={activeTab === "CONTROLS" ? 2.5 : 2} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Controls</span>
          </button>

          <button onClick={() => setActiveTab("BURNER")} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === "BURNER" ? "text-orange-500" : "text-muted-foreground hover:text-orange-500/70"}`}>
            <Flame size={20} strokeWidth={activeTab === "BURNER" ? 2.5 : 2} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Burner</span>
          </button>
        </div>
      </nav>
    </div>
  );
}