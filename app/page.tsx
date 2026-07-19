"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Activity, Calculator, ShieldAlert, Target, BookText, CheckCircle2 } from "lucide-react"; 

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
// WIDGET: ECONOMIC CALENDAR 
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
  const [activeTab, setActiveTab] = useState<"TERMINAL" | "CALCULATOR" | "CONTROLS" | "JOURNAL">("TERMINAL");
  
  const [config, setConfig] = useState<RiskConfig>({ total_equity: 800.0, max_allowed_layers: 4, system_is_killed: false });
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [analytics, setAnalytics] = useState({ winRate: 0, totalWins: 0, totalLosses: 0 });
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  const [calcEquity, setCalcEquity] = useState<string>("800");
  const [calcRiskPct, setCalcRiskPct] = useState<string>("2");
  const [calcEntry, setCalcEntry] = useState<string>("2350.00");
  const [calcSL, setCalcSL] = useState<string>("2345.00");

  const [pendingJournalTradeId, setPendingJournalTradeId] = useState<string | null>(null);
  const [journalText, setJournalText] = useState("");
  const [journalHistory, setJournalHistory] = useState<any[]>([]);

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const { data: configData } = await supabase
          .from("risk_configuration")
          .select("total_equity, max_allowed_layers, system_is_killed")
          .order("id", { ascending: false }).limit(1).single();

        if (configData) setConfig(configData);

        const { data: queueData } = await supabase
          .from("execution_queue")
          .select("id, ticker, action, status, created_at, zone_low, zone_high, stop_loss, take_profit")
          .order("created_at", { ascending: false }).limit(10); // Pulled 10 to show history

        if (queueData) setQueue(queueData);

        const { data: statsData } = await supabase
          .from("execution_queue")
          .select("status")
          .in("status", ["WIN", "LOSS", "BREAKEVEN"]);

        if (statsData) {
          const wins = statsData.filter(t => t.status === "WIN").length;
          const losses = statsData.filter(t => t.status === "LOSS").length;
          const total = statsData.length;
          setAnalytics({
            totalWins: wins,
            totalLosses: losses,
            winRate: total > 0 ? (wins / total) * 100 : 0
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
      }
    }
    
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
    const adminKey = window.prompt(`[AUTHORIZATION REQUIRED]\n\nEnter Admin API Key to ${actionText} system operations:`);
    if (!adminKey) return; 

    try {
      const res = await fetch("https://nexus-neural-machine-backend-production.up.railway.app/api/kill-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": adminKey },
        body: JSON.stringify({ action: currentAction })
      });
      if (res.ok) alert(`Command accepted. System ${currentAction}D.`);
      else alert("Command rejected.");
    } catch (err) {
      alert("Fatal: Could not reach middleware pipeline.");
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

  const resolveTrade = async (id: string, outcome: "WIN" | "LOSS" | "BREAKEVEN" | "DROPPED") => {
    try {
      setQueue(prev => prev.map(item => item.id === id ? { ...item, status: outcome } : item));
      
      await fetch("https://nexus-neural-machine-backend-production.up.railway.app/api/resolve-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          secret_token: "YOUR_WEBHOOK_SECRET", 
          trade_id: id, 
          outcome: outcome 
        })
      });

      if (outcome === "WIN" || outcome === "LOSS" || outcome === "BREAKEVEN") {
          setPendingJournalTradeId(id);
      }
    } catch (err) {
      console.error("Failed to update trade outcome:", err);
    }
  };

  const submitJournal = async () => {
    if (!pendingJournalTradeId || !journalText.trim()) return;
    try {
        await supabase.from("trade_journal").insert({
            trade_id: pendingJournalTradeId,
            reason_for_entry: journalText
        });
        setPendingJournalTradeId(null);
        setJournalText("");
    } catch (err) {
        console.error("Failed to save journal:", err);
    }
  };

  const calculateLots = (equity: number, riskPct: number, zoneLow?: number, zoneHigh?: number, sl?: number) => {
    if (!zoneLow || !zoneHigh || !sl) return 0;
    const midZone = (zoneLow + zoneHigh) / 2;
    const distance = Math.abs(midZone - sl);
    if (distance === 0) return 0;
    return (equity * riskPct) / (distance * 100); 
  };

  const pendingQueue = queue.filter(q => q.status === "PENDING");
  const closedQueue = queue.filter(q => q.status !== "PENDING").slice(0, 5); // Show last 5

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-background text-foreground font-mono relative selection:bg-primary/20">
      
      {/* MODAL OVERLAY: FORCED CONTEXT JOURNALING */}
      {pendingJournalTradeId && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/95 p-4 backdrop-blur-md">
            <div className="bg-[#13151A] border border-border/20 rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-4">
                <div className="border-b border-border/20 pb-4">
                    <h3 className="text-lg font-bold text-white tracking-wider uppercase">Trade Journal</h3>
                    <p className="text-xs text-muted-foreground mt-1">Contextualize this execution.</p>
                </div>
                <textarea 
                    className="w-full h-32 p-4 bg-[#1C1E26] border border-border/10 rounded-xl focus:ring-1 focus:ring-primary outline-none text-sm resize-none text-foreground"
                    placeholder="e.g., M5 orderblock tap aligned with H1 bullish trend. Clean price action rejection."
                    value={journalText}
                    onChange={(e) => setJournalText(e.target.value)}
                />
                <div className="flex gap-3 pt-3">
                    <Button variant="ghost" className="flex-1 bg-zinc-900/50 hover:bg-zinc-800 text-muted-foreground text-xs font-bold" onClick={() => setPendingJournalTradeId(null)}>SKIP</Button>
                    <Button className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-500 hover:opacity-90 text-white text-xs font-bold shadow-lg" onClick={submitJournal}>SAVE LOG</Button>
                </div>
            </div>
        </div>
      )}

      {/* GLOBAL TOP STATUS BAR */}
      <header className="flex justify-between items-center p-4 border-b border-white/5 bg-[#13151A] shrink-0">
        <div className="flex items-center gap-3">
          <span className={`h-2 w-2 rounded-full ${config.system_is_killed ? "bg-red-500" : "bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]"}`} />
          <h1 className="text-sm font-bold tracking-widest uppercase text-white">
            {config.system_is_killed ? "SYSTEM HALTED" : "NEXUS LIVE"}
          </h1>
        </div>
        <div className="text-xs font-medium text-muted-foreground">
          {currentTime ? currentTime.toLocaleTimeString('en-SG', { hour12: false }) : "--:--:--"}
        </div>
      </header>

      {/* SCROLLABLE MAIN CONTENT CANVAS */}
      <main className="flex-1 overflow-y-auto p-4 pb-24 bg-[#090A0F]">
        
        {activeTab === "TERMINAL" && (
          <div className="flex flex-col gap-6 h-full">
            
            {/* ACTIVE SIGNALS */}
            <div>
              <div className="flex items-center gap-2 mb-4 pl-1">
                <Target size={14} className="text-blue-400" />
                <h3 className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Active Signals</h3>
              </div>
              
              <div className="space-y-4">
                {loading ? (
                  <div className="text-xs text-muted-foreground text-center py-6 animate-pulse">Syncing Telemetry...</div>
                ) : pendingQueue.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-8 bg-[#13151A] border border-white/5 rounded-2xl">No pending setups. Awaiting injection.</div>
                ) : (
                  pendingQueue.map((item) => {
                    const isBuy = item.action === "BUY";
                    const badgeColor = isBuy ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20";
                    
                    const lotT1 = calculateLots(config.total_equity, 0.02, item.zone_low, item.zone_high, item.stop_loss);
                    const lotT2 = calculateLots(config.total_equity, 0.04, item.zone_low, item.zone_high, item.stop_loss);
                    const lotT3 = calculateLots(config.total_equity, 0.06, item.zone_low, item.zone_high, item.stop_loss);

                    // Dynamic TP Interpolation
                    const entryMid = (item.zone_low && item.zone_high) ? (item.zone_low + item.zone_high) / 2 : 0;
                    const slDist = Math.abs(entryMid - (item.stop_loss || 0));
                    const tp1 = isBuy ? entryMid + slDist : entryMid - slDist;
                    const tp2 = isBuy ? entryMid + (slDist * 2) : entryMid - (slDist * 2);

                    return (
                      <div key={item.id} className="bg-[#13151A] border border-white/5 rounded-2xl p-5 shadow-xl flex flex-col gap-4 relative overflow-hidden">
                        
                        {/* AESTHETIC HEADER */}
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <h2 className="text-xl font-black text-white tracking-tight">{item.ticker}</h2>
                            <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}>
                              {item.action}
                            </span>
                          </div>
                          <span className="text-muted-foreground text-[10px]">{new Date(item.created_at).toLocaleTimeString([], { hour12: false })}</span>
                        </div>

                        {/* METRICS GRID (Vexaflow Style) */}
                        {item.zone_low && (
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2 bg-[#1C1E26] p-4 rounded-xl border border-white/5">
                              <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mb-1.5">Entry Zone</div>
                              <div className="text-lg font-mono font-medium text-white">{item.zone_low.toFixed(2)} <span className="text-muted-foreground/50 mx-1">-</span> {item.zone_high?.toFixed(2)}</div>
                            </div>
                            
                            <div className="bg-[#1C1E26] p-3 rounded-xl border border-white/5">
                              <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mb-1.5">SL</div>
                              <div className="text-md font-mono font-medium text-rose-400">{item.stop_loss?.toFixed(2)}</div>
                            </div>

                            <div className="bg-[#1C1E26] p-3 rounded-xl border border-white/5">
                              <div className="flex justify-between items-end mb-1.5">
                                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">TP 1</span>
                                <span className="text-[8px] text-emerald-400 font-bold">{lotT1.toFixed(2)} L</span>
                              </div>
                              <div className="text-md font-mono font-medium text-emerald-400">{tp1.toFixed(2)}</div>
                            </div>

                            <div className="bg-[#1C1E26] p-3 rounded-xl border border-white/5">
                               <div className="flex justify-between items-end mb-1.5">
                                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">TP 2</span>
                                <span className="text-[8px] text-emerald-400 font-bold">{lotT2.toFixed(2)} L</span>
                              </div>
                              <div className="text-md font-mono font-medium text-emerald-400">{tp2.toFixed(2)}</div>
                            </div>

                            <div className="bg-[#1C1E26] p-3 rounded-xl border border-white/5 relative overflow-hidden">
                               <div className="absolute top-0 right-0 w-8 h-8 bg-blue-500/10 rounded-bl-full blur-md" />
                               <div className="flex justify-between items-end mb-1.5 relative z-10">
                                <span className="text-[9px] text-blue-400 font-bold uppercase tracking-widest">TP 3 (FINAL)</span>
                                <span className="text-[8px] text-blue-400 font-bold">{lotT3.toFixed(2)} L</span>
                              </div>
                              <div className="text-md font-mono font-medium text-blue-400 relative z-10">{item.take_profit?.toFixed(2)}</div>
                            </div>
                          </div>
                        )}
                        
                        {/* RESOLUTION ACTIONS */}
                        <div className="grid grid-cols-4 gap-2 mt-2">
                          <Button size="sm" onClick={() => resolveTrade(item.id, "WIN")} className="h-10 text-[10px] bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 font-bold rounded-xl transition-all">WIN</Button>
                          <Button size="sm" onClick={() => resolveTrade(item.id, "LOSS")} className="h-10 text-[10px] bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 font-bold rounded-xl transition-all">LOSS</Button>
                          <Button size="sm" onClick={() => resolveTrade(item.id, "BREAKEVEN")} className="h-10 text-[10px] bg-zinc-800 text-zinc-300 hover:bg-zinc-700 font-bold rounded-xl transition-all">BE</Button>
                          <Button size="sm" onClick={() => resolveTrade(item.id, "DROPPED")} variant="ghost" className="h-10 text-[10px] text-muted-foreground hover:text-white font-bold rounded-xl">DROP</Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* RECENTLY CLOSED */}
            <div className="mt-4 border-t border-white/5 pt-6">
              <div className="flex items-center gap-2 mb-4 pl-1">
                <CheckCircle2 size={14} className="text-muted-foreground" />
                <h3 className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Recently Closed</h3>
              </div>

              <div className="space-y-3">
                {closedQueue.length === 0 ? (
                    <div className="text-[10px] text-muted-foreground/50 pl-1">No execution history found.</div>
                ) : (
                    closedQueue.map((item) => {
                        const statusColor = 
                            item.status === "WIN" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" :
                            item.status === "LOSS" ? "text-rose-400 border-rose-500/20 bg-rose-500/5" :
                            "text-zinc-400 border-white/5 bg-[#1C1E26]";
                            
                        return (
                            <div key={item.id} className={`p-4 rounded-xl border ${statusColor} flex justify-between items-center`}>
                                <div>
                                    <h4 className="text-sm font-bold text-white">{item.ticker}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-[9px] font-bold ${item.action === "BUY" ? "text-emerald-500" : "text-rose-500"}`}>{item.action}</span>
                                        <span className="text-[9px] text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                <div className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider ${statusColor.replace('bg-', 'bg-opacity-100 bg-')}`}>
                                    {item.status}
                                </div>
                            </div>
                        )
                    })
                )}
              </div>
            </div>

            <div className="h-12" /> {/* Bottom padding buffer */}
          </div>
        )}

        {/* PAGE 2: JOURNAL LOGS */}
        {activeTab === "JOURNAL" && (
          <div className="flex flex-col gap-4 h-full">
            <div className="p-5 border border-white/5 rounded-2xl bg-[#13151A] shadow-xl">
                <div className="flex items-center gap-2 border-b border-white/5 pb-3 mb-5">
                    <BookText size={16} className="text-blue-400" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Trading Journal Logs</h3>
                </div>
                
                <div className="space-y-4">
                    {journalHistory.length === 0 ? (
                        <div className="text-xs text-muted-foreground text-center py-6">No journal entries found. Execute a trade to log context.</div>
                    ) : (
                        journalHistory.map((log) => (
                            <div key={log.id} className="p-4 bg-[#1C1E26] border border-white/5 rounded-xl flex flex-col gap-2">
                                <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex justify-between items-center border-b border-white/5 pb-2">
                                    <span>Log: {log.id.split("-")[0]}</span>
                                    <span>{new Date(log.created_at).toLocaleDateString()}</span>
                                </div>
                                <p className="text-xs text-zinc-300 mt-2 leading-relaxed">{log.reason_for_entry}</p>
                            </div>
                        ))
                    )}
                </div>
            </div>
          </div>
        )}

        {/* PAGE 3: REACTIVE RISK CALCULATOR */}
        {activeTab === "CALCULATOR" && (
          <div className="w-full max-w-md mx-auto p-6 border border-white/5 rounded-2xl bg-[#13151A] shadow-xl">
            <h3 className="text-lg font-bold mb-6 text-white border-b border-white/5 pb-4">Manual Sizer</h3>
            <div className="space-y-5 text-sm">
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Account Equity ($)</label>
                <input type="number" value={calcEquity} onChange={(e) => setCalcEquity(e.target.value)} className="w-full text-base p-3 bg-[#1C1E26] border border-white/5 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none text-white font-mono" />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Risk (%)</label>
                <input type="number" step="0.1" value={calcRiskPct} onChange={(e) => setCalcRiskPct(e.target.value)} className="w-full text-base p-3 bg-[#1C1E26] border border-white/5 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none text-white font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Entry Price</label>
                  <input type="number" step="0.01" value={calcEntry} onChange={(e) => setCalcEntry(e.target.value)} className="w-full text-base p-3 bg-[#1C1E26] border border-white/5 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none text-white font-mono" />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Stop Loss</label>
                  <input type="number" step="0.01" value={calcSL} onChange={(e) => setCalcSL(e.target.value)} className="w-full text-base p-3 bg-[#1C1E26] border border-white/5 rounded-xl focus:ring-1 focus:ring-blue-500 outline-none text-white font-mono" />
                </div>
              </div>

              {lotSize > 0 && (
                <div className="mt-8 p-5 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-xl space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Capital at Risk</span>
                    <span className="font-mono text-rose-400">${riskAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">SL Distance</span>
                    <span className="font-mono text-white">{slDistance.toFixed(2)} pts</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-white/10 pt-4 mt-2">
                    <span className="text-white font-bold uppercase tracking-widest text-xs">Execute Size</span>
                    <span className="font-mono text-blue-400 font-black text-2xl">{lotSize.toFixed(2)} L</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PAGE 4: ADMIN CONTROLS */}
        {activeTab === "CONTROLS" && (
          <div className="w-full max-w-md mx-auto p-6 border border-white/5 rounded-2xl bg-[#13151A] shadow-xl flex flex-col gap-6">
            <div>
              <h3 className="text-lg font-bold text-white border-b border-white/5 pb-4 mb-3">Admin Overrides</h3>
              <p className="text-xs text-muted-foreground">Require master API key authorization to execute.</p>
            </div>
            
            <div className="p-5 border border-red-900/30 bg-red-950/10 rounded-xl">
              <Button 
                onClick={toggleKillSwitch}
                size="lg"
                className={`w-full font-bold tracking-widest uppercase rounded-xl transition-all ${config.system_is_killed ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "bg-rose-500 hover:bg-rose-600 text-white"}`}
              >
                {config.system_is_killed ? "RESTORE SYSTEM" : "ACTIVATE KILL SWITCH"}
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* FIXED BOTTOM NAVIGATION BAR */}
      <nav className="fixed bottom-0 w-full bg-[#13151A] border-t border-white/5 pb-safe z-40">
        <div className="flex justify-around items-center h-16 max-w-md mx-auto px-2">
          <button onClick={() => setActiveTab("TERMINAL")} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === "TERMINAL" ? "text-blue-400" : "text-muted-foreground hover:text-white"}`}>
            <Activity size={20} strokeWidth={activeTab === "TERMINAL" ? 2.5 : 2} />
            <span className="text-[9px] font-bold uppercase tracking-widest">Terminal</span>
          </button>
          
          <button onClick={() => setActiveTab("JOURNAL")} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === "JOURNAL" ? "text-blue-400" : "text-muted-foreground hover:text-white"}`}>
            <BookText size={20} strokeWidth={activeTab === "JOURNAL" ? 2.5 : 2} />
            <span className="text-[9px] font-bold uppercase tracking-widest">Journal</span>
          </button>

          <button onClick={() => setActiveTab("CALCULATOR")} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === "CALCULATOR" ? "text-blue-400" : "text-muted-foreground hover:text-white"}`}>
            <Calculator size={20} strokeWidth={activeTab === "CALCULATOR" ? 2.5 : 2} />
            <span className="text-[9px] font-bold uppercase tracking-widest">Sizer</span>
          </button>

          <button onClick={() => setActiveTab("CONTROLS")} className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${activeTab === "CONTROLS" ? "text-blue-400" : "text-muted-foreground hover:text-white"}`}>
            <ShieldAlert size={20} strokeWidth={activeTab === "CONTROLS" ? 2.5 : 2} />
            <span className="text-[9px] font-bold uppercase tracking-widest">Controls</span>
          </button>
        </div>
      </nav>
    </div>
  );
}