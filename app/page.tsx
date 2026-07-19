"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Activity, Calculator, ShieldAlert, Target } from "lucide-react"; 

interface RiskConfig {
  total_equity: number;
  max_allowed_layers: number;
  system_is_killed: boolean;
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
}

// ============================================================================
// WIDGET: ECONOMIC CALENDAR (FOREX FACTORY STYLE)
// ============================================================================
function EconomicCalendarWidget() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-events.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      colorTheme: "dark",
      isTransparent: true,
      width: "100%",
      height: "100%",
      locale: "en",
      importanceFilter: "-1,0,1", 
      currencyFilter: "USD,EUR,GBP,JPY,AUD,CAD,CHF" 
    });
    container.current.appendChild(script);
  }, []);

  return (
    <div className="tradingview-widget-container w-full h-full flex flex-col min-h-[400px]" ref={container}>
      <div className="tradingview-widget-container__widget w-full flex-1" />
    </div>
  );
}

// ============================================================================
// MAIN APP ARCHITECTURE
// ============================================================================
export default function QuantTerminal() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<"TERMINAL" | "CALCULATOR" | "CONTROLS">("TERMINAL");
  
  // Backend & Analytics States
  const [config, setConfig] = useState<RiskConfig>({ total_equity: 800.0, max_allowed_layers: 4, system_is_killed: false });
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [analytics, setAnalytics] = useState({ winRate: 0, totalWins: 0, totalLosses: 0 });
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  // Calculator States 
  const [calcEquity, setCalcEquity] = useState<string>("800");
  const [calcRiskPct, setCalcRiskPct] = useState<string>("2");
  const [calcEntry, setCalcEntry] = useState<string>("2350.00");
  const [calcSL, setCalcSL] = useState<string>("2345.00");

  // 1. Live Clock Sync (Prevents Next.js Hydration Mismatch)
  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Telemetry & Analytics Polling
  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const { data: configData, error: configError } = await supabase
          .from("risk_configuration")
          .select("total_equity, max_allowed_layers, system_is_killed")
          .order("id", { ascending: false }).limit(1).single();

        if (!configError && configData) setConfig(configData);

        // Fetch Live Queue (Now including signal metrics)
        const { data: queueData, error: queueError } = await supabase
          .from("execution_queue")
          .select("id, ticker, action, status, created_at, zone_low, zone_high, stop_loss, take_profit")
          .order("created_at", { ascending: false }).limit(5);

        if (!queueError && queueData) setQueue(queueData);

        // Fetch Historical Analytics for Win Rate
        const { data: statsData, error: statsError } = await supabase
          .from("execution_queue")
          .select("status")
          .in("status", ["WIN", "LOSS", "BREAKEVEN"]);

        if (!statsError && statsData) {
          const wins = statsData.filter(t => t.status === "WIN").length;
          const losses = statsData.filter(t => t.status === "LOSS").length;
          const total = statsData.length;
          setAnalytics({
            totalWins: wins,
            totalLosses: losses,
            winRate: total > 0 ? (wins / total) * 100 : 0
          });
        }
      } catch (err) {
        console.error("Telemetry error:", err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000);
    return () => clearInterval(interval);
  }, []);

  // 3. Auto-sync Calculator Equity with Live Database Equity
  useEffect(() => {
    if (config.total_equity) {
      setCalcEquity(config.total_equity.toString());
    }
  }, [config.total_equity]);

  // 4. Admin Kill Switch Execution
  const toggleKillSwitch = async () => {
    const currentAction = config.system_is_killed ? "DEACTIVATE" : "ACTIVATE";
    const actionText = currentAction === "ACTIVATE" ? "HALT" : "RESTORE";
    const adminKey = window.prompt(`[AUTHORIZATION REQUIRED]\n\nEnter Admin API Key to ${actionText} system operations:`);
    if (!adminKey) return; 

    try {
      const res = await fetch("https://nexus-neural-machine-backend-production.up.railway.app/api/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
        body: JSON.stringify({ action: currentAction })
      });
      if (res.ok) alert(`Command accepted. System ${currentAction}D.`);
      else alert("Command rejected: Invalid Admin Key or Network Error.");
    } catch (err) {
      alert("Fatal: Could not reach middleware pipeline.");
    }
  };

  // 5. Reactive Math Execution (Calculator Tab)
  const equityNum = parseFloat(calcEquity) || 0;
  const riskPctNum = parseFloat(calcRiskPct) || 0;
  const entryNum = parseFloat(calcEntry) || 0;
  const slNum = parseFloat(calcSL) || 0;
  const riskAmount = equityNum * (riskPctNum / 100);
  const slDistance = Math.abs(entryNum - slNum);
  const pipValuePerLot = 100; // Standard XAUUSD Contract
  const lotSize = slDistance > 0 ? (riskAmount / (slDistance * pipValuePerLot)) : 0;

  // 6. Manual Trade Resolution (Routed through Python Risk Engine)
  const resolveTrade = async (id: string, outcome: "WIN" | "LOSS" | "BREAKEVEN" | "DROPPED") => {
    try {
      // Instantly update UI on mobile so it feels crisp and responsive
      setQueue(prev => prev.map(item => item.id === id ? { ...item, status: outcome } : item));
      
      // Route the data to the Python Backend for Drawdown Evaluation
      await fetch("https://nexus-neural-machine-backend-production.up.railway.app/api/resolve-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          secret_token: "SuperSecretSecureToken2026!", // <-- REPLACE THIS WITH YOUR RAILWAY ENV TOKEN
          trade_id: id, 
          outcome: outcome 
        })
      });
      
    } catch (err) {
      console.error("Failed to update trade outcome:", err);
    }
  };

  // Helper function to calculate lot sizes for the queue UI dynamically
  const calculateSignalLots = (equity: number, riskPct: number, zoneLow?: number, zoneHigh?: number, sl?: number) => {
    if (!zoneLow || !zoneHigh || !sl) return 0;
    const midZone = (zoneLow + zoneHigh) / 2;
    const distance = Math.abs(midZone - sl);
    if (distance === 0) return 0;
    return (equity * riskPct) / (distance * 100); // Assumes XAUUSD
  };

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-background text-foreground font-mono">
      
      {/* GLOBAL TOP STATUS BAR */}
      <header className="flex justify-between items-center p-3 border-b border-border/50 bg-card shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${config.system_is_killed ? "bg-red-600 animate-none" : "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"}`} />
          <h1 className="text-sm font-bold tracking-widest uppercase text-primary">
            {config.system_is_killed ? "SYSTEM HALTED" : "NEXUS LIVE"}
          </h1>
        </div>
        {/* LIVE CLOCK */}
        <div className="text-sm font-bold text-muted-foreground bg-secondary/50 px-3 py-1 rounded-md border border-border/50">
          {currentTime ? currentTime.toLocaleTimeString('en-SG', { hour12: false }) : "--:--:--"}
        </div>
      </header>

      {/* SCROLLABLE MAIN CONTENT CANVAS */}
      <main className="flex-1 overflow-y-auto p-4 pb-24">
        
        {/* PAGE 1: TERMINAL (Analytics + Queue + Calendar) */}
        {activeTab === "TERMINAL" && (
          <div className="flex flex-col gap-4 h-full">
            
            {/* 2x2 ANALYTICS DASHBOARD */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 border border-border/50 rounded-xl bg-zinc-900/50 shadow-sm flex flex-col items-center justify-center">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Live Equity</span>
                <span className="text-lg font-bold text-primary">${config.total_equity.toFixed(2)}</span>
              </div>
              <div className="p-3 border border-border/50 rounded-xl bg-zinc-900/50 shadow-sm flex flex-col items-center justify-center">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Win Rate</span>
                <span className="text-lg font-bold text-emerald-400">{analytics.winRate.toFixed(1)}%</span>
              </div>
              <div className="p-3 border border-border/50 rounded-xl bg-zinc-900/50 shadow-sm flex flex-col items-center justify-center">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Total Wins</span>
                <span className="text-lg font-bold text-foreground">{analytics.totalWins}</span>
              </div>
              <div className="p-3 border border-border/50 rounded-xl bg-zinc-900/50 shadow-sm flex flex-col items-center justify-center">
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Total Losses</span>
                <span className="text-lg font-bold text-rose-400">{analytics.totalLosses}</span>
              </div>
            </div>

            {/* INTERACTIVE SIGNAL QUEUE */}
            <div className="p-4 border border-border/50 rounded-xl bg-card shadow-sm">
              <div className="flex items-center gap-2 border-b border-border/50 pb-2 mb-3">
                <Target size={14} className="text-primary" />
                <h3 className="text-xs text-muted-foreground uppercase tracking-wider">Execution Queue</h3>
              </div>
              
              <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                {loading ? (
                  <div className="text-xs text-muted-foreground text-center py-6 animate-pulse">Syncing Ledger...</div>
                ) : queue.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-6">Queue clear. No pending setups.</div>
                ) : (
                  queue.map((item) => {
                    const isPending = item.status === "PENDING";
                    // Calculate lots dynamically based on live equity
                    const lotT1 = calculateSignalLots(config.total_equity, 0.02, item.zone_low, item.zone_high, item.stop_loss);
                    const lotT2 = calculateSignalLots(config.total_equity, 0.04, item.zone_low, item.zone_high, item.stop_loss);
                    const lotT3 = calculateSignalLots(config.total_equity, 0.06, item.zone_low, item.zone_high, item.stop_loss);

                    return (
                      <div key={item.id} className={`p-3 border rounded-lg text-xs shadow-sm flex flex-col gap-3 transition-colors ${isPending ? "bg-zinc-950 border-primary/30" : "bg-background border-border/40 opacity-75"}`}>
                        
                        {/* Header */}
                        <div className="flex justify-between items-center">
                          <span className={`font-bold text-sm ${item.action === "BUY" ? "text-emerald-500" : "text-rose-500"}`}>
                            {item.action} {item.ticker}
                          </span>
                          <span className="text-muted-foreground text-[10px]">{new Date(item.created_at).toLocaleTimeString([], { hour12: false })}</span>
                        </div>

                        {/* SIGNAL METRICS CARD (Only shows if Pending and data exists) */}
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
                            
                            {/* Lot Sizes */}
                            <div className="pt-2 grid grid-cols-3 gap-2 text-center">
                              <div className="bg-zinc-900 rounded p-1">
                                <div className="text-[9px] text-muted-foreground mb-0.5">T1 (2%)</div>
                                <div className="font-bold text-primary">{lotT1.toFixed(2)}</div>
                              </div>
                              <div className="bg-zinc-900 rounded p-1">
                                <div className="text-[9px] text-muted-foreground mb-0.5">T2 (4%)</div>
                                <div className="font-bold text-primary">{lotT2.toFixed(2)}</div>
                              </div>
                              <div className="bg-zinc-900 rounded p-1">
                                <div className="text-[9px] text-muted-foreground mb-0.5">T3 (6%)</div>
                                <div className="font-bold text-primary">{lotT3.toFixed(2)}</div>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Conditional Action Buttons */}
                        {isPending ? (
                          <div className="grid grid-cols-4 gap-1.5 mt-1">
                            <Button size="sm" onClick={() => resolveTrade(item.id, "WIN")} className="h-8 text-[10px] bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 font-bold border border-emerald-500/20">WIN</Button>
                            <Button size="sm" onClick={() => resolveTrade(item.id, "LOSS")} className="h-8 text-[10px] bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 font-bold border border-rose-500/20">LOSS</Button>
                            <Button size="sm" onClick={() => resolveTrade(item.id, "BREAKEVEN")} className="h-8 text-[10px] bg-zinc-500/10 text-zinc-400 hover:bg-zinc-500/20 font-bold border border-zinc-500/20">BE</Button>
                            <Button size="sm" onClick={() => resolveTrade(item.id, "DROPPED")} variant="ghost" className="h-8 text-[10px] text-muted-foreground hover:text-foreground font-bold border border-border/50">DROP</Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`uppercase text-[10px] px-2 py-1 rounded font-bold ${
                              item.status === "WIN" ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
                              item.status === "LOSS" ? "bg-rose-500/10 text-rose-500 border border-rose-500/20" :
                              "bg-secondary/50 text-muted-foreground border border-border/50"
                            }`}>
                              {item.status}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ECONOMIC CALENDAR WIDGET */}
            <div className="flex-1 border border-border/30 rounded-xl bg-zinc-950 overflow-hidden shadow-md min-h-[300px]">
              <EconomicCalendarWidget />
            </div>
          </div>
        )}

        {/* PAGE 2: REACTIVE RISK CALCULATOR */}
        {activeTab === "CALCULATOR" && (
          <div className="w-full max-w-md mx-auto p-5 border border-border/50 rounded-xl bg-card shadow-sm">
            <h3 className="text-lg font-bold mb-5 text-primary border-b border-border/50 pb-3 font-mono">XAUUSD Position Sizer</h3>
            
            <div className="space-y-5 text-sm font-mono">
              <div className="flex flex-col gap-1.5">
                <label className="text-muted-foreground font-semibold">Account Equity ($)</label>
                <input 
                  type="number" 
                  value={calcEquity} 
                  onChange={(e) => setCalcEquity(e.target.value)} 
                  className="w-full text-base p-3 bg-background border border-border/50 rounded-lg focus:ring-2 focus:ring-primary outline-none text-foreground" 
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-muted-foreground font-semibold">Risk Percentage (%)</label>
                <input 
                  type="number" 
                  step="0.1" 
                  value={calcRiskPct} 
                  onChange={(e) => setCalcRiskPct(e.target.value)} 
                  className="w-full text-base p-3 bg-background border border-border/50 rounded-lg focus:ring-2 focus:ring-primary outline-none text-foreground" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-muted-foreground font-semibold">Entry Price</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={calcEntry} 
                    onChange={(e) => setCalcEntry(e.target.value)} 
                    className="w-full text-base p-3 bg-background border border-border/50 rounded-lg focus:ring-2 focus:ring-primary outline-none text-foreground" 
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-muted-foreground font-semibold">Stop Loss</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={calcSL} 
                    onChange={(e) => setCalcSL(e.target.value)} 
                    className="w-full text-base p-3 bg-background border border-border/50 rounded-lg focus:ring-2 focus:ring-primary outline-none text-foreground" 
                  />
                </div>
              </div>

              {/* REACTIVE OUTPUT WINDOW */}
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
                  Enter valid Entry and Stop Loss metrics to calculate size.
                </div>
              )}
            </div>
          </div>
        )}

        {/* PAGE 3: ADMIN CONTROLS */}
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
              <p className="text-[10px] text-muted-foreground mt-3 text-center">
                {config.system_is_killed 
                  ? "SYSTEM HALTED. Inbound signals are currently being dropped." 
                  : "WARNING: Instantly purges active loops and drops execution routing."}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* FIXED BOTTOM NAVIGATION BAR */}
      <nav className="fixed bottom-0 w-full bg-card border-t border-border/50 pb-safe shrink-0">
        <div className="flex justify-around items-center h-16 max-w-md mx-auto px-4">
          <button 
            onClick={() => setActiveTab("TERMINAL")} 
            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === "TERMINAL" ? "text-primary" : "text-muted-foreground hover:text-primary/70"}`}
          >
            <Activity size={20} strokeWidth={activeTab === "TERMINAL" ? 2.5 : 2} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Terminal</span>
          </button>
          
          <button 
            onClick={() => setActiveTab("CALCULATOR")} 
            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === "CALCULATOR" ? "text-primary" : "text-muted-foreground hover:text-primary/70"}`}
          >
            <Calculator size={20} strokeWidth={activeTab === "CALCULATOR" ? 2.5 : 2} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Risk Sizer</span>
          </button>

          <button 
            onClick={() => setActiveTab("CONTROLS")} 
            className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === "CONTROLS" ? "text-primary" : "text-muted-foreground hover:text-primary/70"}`}
          >
            <ShieldAlert size={20} strokeWidth={activeTab === "CONTROLS" ? 2.5 : 2} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Controls</span>
          </button>
        </div>
      </nav>
    </div>
  );
}