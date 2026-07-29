"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Activity, Calculator, ShieldAlert, Target, BookText, Flame, Lock, Unlock, CheckCircle2, X, Edit3, TrendingUp, TrendingDown, Zap, RefreshCw } from "lucide-react"; 

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
  realized_pnl?: number;
  trade_layers?: TradeLayer[];
}

interface NewsPrediction {
  event_id: string;
  event_name: string;
  time_str: string;
  forecast: number;
  previous: number;
  expected_delta: number;
  predicted_action: "BUY NOW" | "SELL NOW";
  confidence_pct: number;
  confluence_grade: string;
  fundamental_rationale: string;
  technical_rationale: string;
  market_regime: string;
  volume_delta: number;
}

const backendUrl = "https://nexus-neural-machine-backend-production.up.railway.app";

export default function QuantTerminal() {
  const [activeTab, setActiveTab] = useState<"TERMINAL" | "CALCULATOR" | "CONTROLS" | "JOURNAL" | "BURNER">("TERMINAL");
  
  const [config, setConfig] = useState<RiskConfig>({ total_equity: 250.0, max_allowed_layers: 4, system_is_killed: false });
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [analytics, setAnalytics] = useState({ winRate: 0, totalWins: 0, totalLosses: 0, netPnL: 0 });
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const isFetching = useRef(false);

  // Burner Prediction Matrix State
  const [burnerPredictions, setBurnerPredictions] = useState<NewsPrediction[]>([]);
  const [executingBurner, setExecutingBurner] = useState<boolean>(false);
  const [syncingMacro, setSyncingMacro] = useState<boolean>(false);

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

      const { data: queueData, error: queueError } = await supabase
        .from("execution_queue")
        .select(`
          id, ticker, action, status, created_at, zone_low, zone_high, stop_loss, take_profit, market_regime, volume_delta, magnet_node, structure, realized_pnl,
          trade_layers ( id, trade_id, layer_type, risk_pct, target_price, stop_loss, status, realized_pnl )
        `)
        .order("created_at", { ascending: false }).limit(10);

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

      if (activeTab === "BURNER") {
        try {
          const res = await fetch(`${backendUrl}/api/burner/predictions`);
          if (res.ok) {
            const data = await res.json();
            setBurnerPredictions(data.predictions || []);
          }
        } catch (e) {
          console.error("Burner prediction fetch error:", e);
        }
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
    const interval = setInterval(fetchDashboardData, 4000);
    return () => clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    if (config.total_equity) setCalcEquity(config.total_equity.toString());
  }, [config.total_equity]);

  const activeTrade = queue.find(item => item.status === "ACTIVE");

  const toggleKillSwitch = async () => {
    const currentAction = config.system_is_killed ? "DEACTIVATE" : "ACTIVATE";
    const actionText = currentAction === "ACTIVATE" ? "HALT" : "RESTORE";
    
    const adminKey = window.prompt(`[AUTHORIZATION REQUIRED]\n\nEnter Webhook Secret Token to ${actionText} system:`);
    if (!adminKey) return; 

    try {
      const res = await fetch(`${backendUrl}/kill-switch`, {
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

  const handleUpdateEquityManual = async () => {
    const inputVal = window.prompt(`[DEPOSIT / WITHDRAWAL ADJUSTMENT]\n\nEnter new Live Account Equity ($):`, config.total_equity.toFixed(2));
    if (!inputVal) return;

    const newEquity = parseFloat(inputVal);
    if (isNaN(newEquity) || newEquity <= 0) {
      alert("Invalid equity amount.");
      return;
    }

    let secret = localStorage.getItem("NEXUS_WEBHOOK_SECRET");
    if (!secret) {
      secret = window.prompt("Enter Webhook Secret Token to authorize equity change:");
      if (!secret) return;
      localStorage.setItem("NEXUS_WEBHOOK_SECRET", secret);
    }

    try {
      const res = await fetch(`${backendUrl}/api/update-equity`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": secret },
        body: JSON.stringify({ total_equity: newEquity })
      });

      if (res.ok) {
        alert(`Live equity updated to $${newEquity.toFixed(2)}.`);
        fetchDashboardData();
      } else {
        alert("Failed to update equity. Check Secret Token.");
      }
    } catch (e) {
      alert("Network error updating equity.");
    }
  };

  const handleTakeTrade = async (id: string) => {
    let secret = localStorage.getItem("NEXUS_WEBHOOK_SECRET");
    if (!secret) {
      secret = window.prompt("Enter Webhook Secret Token:");
      if (!secret) return;
      localStorage.setItem("NEXUS_WEBHOOK_SECRET", secret);
    }

    try {
      const res = await fetch(`${backendUrl}/api/accept-trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": secret },
        body: JSON.stringify({ trade_id: id })
      });
      if (res.ok) fetchDashboardData();
      else alert("Failed to accept trade.");
    } catch (e) {
      alert("Network error accepting trade.");
    }
  };

  const handleDropTrade = async (id: string) => {
    let secret = localStorage.getItem("NEXUS_WEBHOOK_SECRET");
    if (!secret) {
      secret = window.prompt("Enter Webhook Secret Token:");
      if (!secret) return;
      localStorage.setItem("NEXUS_WEBHOOK_SECRET", secret);
    }

    try {
      const res = await fetch(`${backendUrl}/api/drop-trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": secret },
        body: JSON.stringify({ trade_id: id })
      });
      if (res.ok) fetchDashboardData();
      else alert("Failed to drop trade.");
    } catch (e) {
      alert("Network error dropping trade.");
    }
  };

  const handleTriggerMacroSync = async () => {
    let secret = localStorage.getItem("NEXUS_WEBHOOK_SECRET");
    if (!secret) {
      secret = window.prompt("Enter Webhook Secret Token to authorize macro refresh:");
      if (!secret) return;
      localStorage.setItem("NEXUS_WEBHOOK_SECRET", secret);
    }

    setSyncingMacro(true);
    try {
      const res = await fetch(`${backendUrl}/api/macro-schedule/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": secret }
      });

      if (res.ok) {
        setTimeout(() => fetchDashboardData(), 1500); 
      } else {
        alert("Failed to sync macro schedule. Check Secret Token.");
      }
    } catch (e) {
      alert("Network error triggering macro sync.");
    } finally {
      setTimeout(() => setSyncingMacro(false), 1500);
    }
  };

  const handleFireBurner = async (pred: NewsPrediction) => {
    let secret = localStorage.getItem("NEXUS_WEBHOOK_SECRET");
    if (!secret) {
      secret = window.prompt("Enter Webhook Secret Token to authorize Burner position:");
      if (!secret) return;
      localStorage.setItem("NEXUS_WEBHOOK_SECRET", secret);
    }

    const priceInput = window.prompt(`[PRE-NEWS $50 BURNER EXECUTOR]\n\nEnter Current Live Gold Price for ${pred.event_name}:`, "2400.00");
    if (!priceInput) return;

    setExecutingBurner(true);
    try {
      const res = await fetch(`${backendUrl}/api/burner/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": secret },
        body: JSON.stringify({
          event_name: pred.event_name,
          predicted_action: pred.predicted_action,
          entry_price: parseFloat(priceInput) || 2400.0,
          confidence_pct: pred.confidence_pct,
          rationale: `${pred.fundamental_rationale} | ${pred.technical_rationale}`
        })
      });

      if (res.ok) {
        alert(`🔥 Burner trade executed for ${pred.event_name}! Check Terminal.`);
        setActiveTab("TERMINAL");
        fetchDashboardData();
      } else {
        alert("Failed to execute Burner trade. Check Secret Token.");
      }
    } catch (e) {
      alert("Error reaching backend for Burner execution.");
    } finally {
      setExecutingBurner(false);
    }
  };

  const openCloseTradeModal = (id: string) => {
    setPendingJournalTradeId(id);
    setPendingOutcome("WIN");
    setPnlInput("15.00");
  };

  const submitJournal = async () => {
    if (!pendingJournalTradeId || !pendingOutcome) return;
    
    let secret = localStorage.getItem("NEXUS_WEBHOOK_SECRET");
    if (!secret) {
      secret = window.prompt("Enter Webhook Secret Token to authenticate:");
      if (!secret) return;
      localStorage.setItem("NEXUS_WEBHOOK_SECRET", secret);
    }

    try {
      if (journalText.trim()) {
        await supabase.from("trade_journal").insert({
          trade_id: pendingJournalTradeId,
          reason_for_entry: journalText
        });
      }

      const res = await fetch(`${backendUrl}/api/close-trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Key": secret },
        body: JSON.stringify({ 
          trade_id: pendingJournalTradeId,
          outcome: pendingOutcome,
          realized_pnl: parseFloat(pnlInput) || 0 
        })
      });

      if (!res.ok) {
        alert("Failed to close trade on API.");
        return;
      }

      setPendingJournalTradeId(null);
      setPendingOutcome(null);
      setJournalText("");
      setPnlInput("0.00");
      fetchDashboardData();

    } catch (err) {
      alert("Fatal: Network error reaching backend.");
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

  const calculateSignalLots = (equity: number, riskPct: number, zoneLow?: number, zoneHigh?: number, sl?: number) => {
    if (!zoneLow || !zoneHigh || !sl) return 0;
    const midZone = (zoneLow + zoneHigh) / 2;
    const distance = Math.abs(midZone - sl);
    if (distance === 0) return 0;
    return (equity * riskPct) / (distance * 100); 
  };

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-background text-foreground font-mono relative">
      
      {/* MODAL OVERLAY: CLOSE TRADE & LOG CONTEXT */}
      {pendingJournalTradeId && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
            <div className="bg-zinc-950 border border-border/50 rounded-xl p-5 w-full max-w-md shadow-2xl flex flex-col gap-4">
                <div className="border-b border-border/50 pb-3 flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-bold text-primary tracking-wider uppercase">Close Position & Unlock</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Select trade outcome & record PnL</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setPendingJournalTradeId(null)} className="h-8 w-8 p-0 text-muted-foreground">
                      <X size={16} />
                    </Button>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Outcome</label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button 
                      variant={pendingOutcome === "WIN" ? "default" : "outline"} 
                      className={`text-xs font-bold ${pendingOutcome === "WIN" ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "border-border/50"}`}
                      onClick={() => { setPendingOutcome("WIN"); setPnlInput("15.00"); }}
                    >
                      WIN 🏆
                    </Button>
                    <Button 
                      variant={pendingOutcome === "LOSS" ? "default" : "outline"} 
                      className={`text-xs font-bold ${pendingOutcome === "LOSS" ? "bg-rose-600 hover:bg-rose-500 text-white" : "border-border/50"}`}
                      onClick={() => { setPendingOutcome("LOSS"); setPnlInput("-5.00"); }}
                    >
                      LOSS 💀
                    </Button>
                    <Button 
                      variant={pendingOutcome === "BREAKEVEN" ? "default" : "outline"} 
                      className={`text-xs font-bold ${pendingOutcome === "BREAKEVEN" ? "bg-amber-600 hover:bg-amber-500 text-white" : "border-border/50"}`}
                      onClick={() => { setPendingOutcome("BREAKEVEN"); setPnlInput("0.00"); }}
                    >
                      BE 🛡️
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Realized PnL ($)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="w-full p-2 bg-zinc-900 border border-border/50 rounded-lg focus:ring-1 focus:ring-primary outline-none text-sm font-bold text-foreground"
                    placeholder="e.g. 15.00"
                    value={pnlInput}
                    onChange={(e) => setPnlInput(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Journal Entry (Optional)</label>
                  <textarea 
                      className="w-full h-24 p-2 bg-zinc-900 border border-border/50 rounded-lg focus:ring-1 focus:ring-primary outline-none text-xs resize-none text-foreground"
                      placeholder="e.g., Target hit cleanly at M15 Liquidity pool."
                      value={journalText}
                      onChange={(e) => setJournalText(e.target.value)}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                    <Button variant="ghost" className="flex-1 border border-border/50 text-xs tracking-wider" onClick={() => setPendingJournalTradeId(null)}>CANCEL</Button>
                    <Button className="flex-1 bg-emerald-600 text-white hover:bg-emerald-500 text-xs font-bold tracking-wider" onClick={submitJournal}>CONFIRM & UNLOCK</Button>
                </div>
            </div>
        </div>
      )}

      {/* TOP STATUS BAR */}
      <header className="flex justify-between items-center p-3 border-b border-border/50 bg-card shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${config.system_is_killed ? "bg-red-600" : activeTrade ? "bg-amber-500 animate-pulse" : "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"}`} />
          <h1 className="text-sm font-bold tracking-widest uppercase text-primary">
            {config.system_is_killed ? "SYSTEM HALTED" : activeTrade ? "POSITION LOCKED" : "NEXUS LIVE"}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {activeTrade && (
            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
              <Lock size={10} /> IN TRADE
            </span>
          )}
          <div className="text-sm font-bold text-muted-foreground bg-secondary/50 px-3 py-1 rounded-md border border-border/50">
            {currentTime ? currentTime.toLocaleTimeString('en-SG', { hour12: false }) : "--:--:--"}
          </div>
        </div>
      </header>

      {/* MAIN CANVAS */}
      <main className="flex-1 overflow-y-auto p-4 pb-24">
        
        {/* TERMINAL */}
        {activeTab === "TERMINAL" && (
          <div className="flex flex-col gap-4 h-full">
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={handleUpdateEquityManual} 
                className="p-3 border border-border/50 rounded-xl bg-zinc-900/50 hover:bg-zinc-800/80 transition-all flex flex-col items-center justify-center cursor-pointer group"
                title="Click to Deposit/Withdraw or Adjust Equity"
              >
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Live Equity</span>
                  <Edit3 size={10} className="text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <span className="text-lg font-bold text-primary">${config.total_equity.toFixed(2)}</span>
              </button>
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
                    const isActive = item.status === "ACTIVE";

                    const lotT1 = calculateSignalLots(config.total_equity, 0.02, item.zone_low, item.zone_high, item.stop_loss);
                    const lotT2 = calculateSignalLots(config.total_equity, 0.04, item.zone_low, item.zone_high, item.stop_loss);
                    const lotT3 = calculateSignalLots(config.total_equity, 0.06, item.zone_low, item.zone_high, item.stop_loss);

                    return (
                      <div key={item.id} className={`p-3 border rounded-lg text-xs shadow-sm flex flex-col gap-3 transition-colors ${
                        isActive ? "bg-amber-950/20 border-amber-500/50" : isPending ? "bg-zinc-950 border-primary/30" : "bg-background border-border/40 opacity-70"
                      }`}>
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-sm ${item.action?.includes("BUY") ? "text-emerald-500" : "text-rose-500"}`}>
                              {item.action} {item.ticker}
                            </span>
                            <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${
                              isActive ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                              item.status === "WIN" ? "bg-emerald-500/20 text-emerald-400" :
                              item.status === "LOSS" ? "bg-rose-500/20 text-rose-400" :
                              item.status === "DROPPED" ? "bg-zinc-800 text-muted-foreground" :
                              "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                            }`}>
                              {item.status || "PENDING"}
                            </span>
                          </div>
                          <span className="text-muted-foreground text-[10px]">{new Date(item.created_at).toLocaleTimeString([], { hour12: false })}</span>
                        </div>

                        {(isPending || isActive) && item.zone_low && (
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

                            <div className="grid grid-cols-3 gap-1 pt-1 text-[9px] font-bold text-center">
                              <div className="p-1 rounded bg-zinc-900 border border-border/30">T1 (2%): <span className="text-cyan-400">{lotT1.toFixed(2)}</span></div>
                              <div className="p-1 rounded bg-zinc-900 border border-border/30">T2 (4%): <span className="text-cyan-400">{lotT2.toFixed(2)}</span></div>
                              <div className="p-1 rounded bg-zinc-900 border border-border/30">T3 (6%): <span className="text-cyan-400">{lotT3.toFixed(2)}</span></div>
                            </div>
                          </div>
                        )}

                        {isPending && (
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <Button 
                              size="sm" 
                              onClick={() => handleTakeTrade(item.id)} 
                              disabled={!!activeTrade}
                              className="h-8 text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> TAKE TRADE
                            </Button>
                            <Button 
                              size="sm" 
                              onClick={() => handleDropTrade(item.id)} 
                              variant="ghost" 
                              className="h-8 text-[10px] text-muted-foreground hover:text-foreground font-bold border border-border/50"
                            >
                              DROP
                            </Button>
                          </div>
                        )}

                        {isActive && (
                          <Button 
                            size="sm" 
                            onClick={() => openCloseTradeModal(item.id)} 
                            className="h-9 text-[11px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-black tracking-wider uppercase shadow-md shadow-amber-950/40"
                          >
                            <Lock className="w-3.5 h-3.5 mr-1.5" /> CLOSE TRADE & LOG PNL
                          </Button>
                        )}

                        {!isPending && !isActive && (
                          <div className="flex justify-between items-center pt-1 text-[10px]">
                            <span className="text-muted-foreground uppercase font-bold">Realized PnL:</span>
                            <span className={`font-bold ${item.realized_pnl && item.realized_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              ${item.realized_pnl ? item.realized_pnl.toFixed(2) : "0.00"}
                            </span>
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

        {/* BURNER / FUNDAMENTAL + TECHNICAL CONFLUENCE MATRIX */}
        {activeTab === "BURNER" && (
          <div className="flex flex-col gap-4 h-full font-mono">
            <div className="p-4 border border-orange-900/40 bg-orange-950/10 rounded-xl flex flex-col gap-3 shadow-sm">
              <div className="flex items-center justify-between border-b border-orange-900/30 pb-2">
                <div className="flex items-center gap-2">
                  <Flame size={18} className="text-orange-500 animate-pulse" />
                  <h3 className="text-xs font-bold text-orange-400 uppercase tracking-wider">Fundamental + Technical Confluence</h3>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 font-bold border border-orange-500/30">
                  $50 Fixed Margin
                </span>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Cross-validates 48-hour macro economic forecast expectations against live M15 market structure, active Breaker Blocks, and institutional volume delta before executing pre-news positions.
              </p>
            </div>

            {/* CONFLUENCE PREDICTION CARDS */}
            <div className="p-4 border border-border/50 rounded-xl bg-card shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-orange-400" />
                  <h3 className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Live Macro + Technical Analysis ({burnerPredictions.length})</h3>
                </div>
                <Button 
                  onClick={handleTriggerMacroSync} 
                  disabled={syncingMacro}
                  size="sm" 
                  variant="ghost" 
                  className={`h-6 text-[10px] text-muted-foreground ${syncingMacro ? "opacity-50" : ""}`}
                >
                  <RefreshCw size={12} className={`mr-1 ${syncingMacro ? "animate-spin" : ""}`} /> 
                  {syncingMacro ? "Syncing..." : "Sync Context"}
                </Button>
              </div>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {burnerPredictions.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-6 animate-pulse">Evaluating fundamental + technical confluence...</div>
                ) : (
                  burnerPredictions.map((pred: any) => {
                    const isBuy = pred.predicted_action.includes("BUY");
                    const isGradeA = pred.confidence_pct >= 85;

                    return (
                      <div key={pred.event_id} className={`p-3.5 bg-zinc-950 border rounded-xl flex flex-col gap-3 transition-all ${
                        isGradeA ? "border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.1)]" : "border-border/40"
                      }`}>
                        {/* Event Header & Action Badge */}
                        <div className="flex justify-between items-center flex-wrap gap-2">
                          <div>
                            <span className="font-bold text-sm text-foreground">{pred.event_name}</span>
                            <span className="text-[10px] text-muted-foreground ml-2">({pred.time_str})</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              isGradeA ? "bg-amber-500/20 text-amber-300 border-amber-500/40" : "bg-slate-800 text-slate-400 border-slate-700"
                            }`}>
                              {pred.confluence_grade}
                            </span>

                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                              isBuy ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400" : "bg-rose-500/10 border-rose-500/40 text-rose-400"
                            }`}>
                              {isBuy ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                              <span>{pred.predicted_action}</span>
                            </span>
                          </div>
                        </div>

                        {/* Macro & Technical Breakdown Grid - Side by Side */}
                        <div className="grid grid-cols-2 gap-2 text-[10px] bg-background/50 p-2.5 rounded-lg border border-border/30 h-full">
                          <div className="space-y-1.5 pr-2">
                            <span className="text-muted-foreground font-bold uppercase block border-b border-border/20 pb-0.5">1. Fundamental Bias</span>
                            <p className="text-slate-300">Prev: <strong className="text-foreground">{pred.previous}</strong> | Forecast: <strong className="text-cyan-400">{pred.forecast}</strong></p>
                            <p className="text-slate-400 italic leading-relaxed">{pred.fundamental_rationale}</p>
                          </div>

                          <div className="space-y-1.5 border-l border-border/20 pl-3">
                            <span className="text-muted-foreground font-bold uppercase block border-b border-border/20 pb-0.5">2. Technical Structure</span>
                            <p className="text-slate-300">Regime: <strong className="text-amber-400">{pred.market_regime}</strong> | Score: <strong className="text-emerald-400">{pred.confidence_pct}%</strong></p>
                            <p className="text-slate-400 italic leading-relaxed">{pred.technical_rationale}</p>
                          </div>
                        </div>

                        {/* Fire Button */}
                        <div className="pt-1 flex justify-end">
                          <Button
                            size="sm"
                            disabled={executingBurner}
                            onClick={() => handleFireBurner(pred)}
                            className="h-8 text-[10px] bg-orange-600 hover:bg-orange-500 text-white font-bold tracking-wider uppercase shadow-md shadow-orange-950/40"
                          >
                            <Flame className="w-3.5 h-3.5 mr-1" /> FIRE $50 BURNER (CONFLUENCE {pred.confidence_pct}%)
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
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

        {/* CALCULATOR / SIZER */}
        {activeTab === "CALCULATOR" && (
          <div className="w-full max-w-md mx-auto p-5 border border-border/50 rounded-xl bg-card shadow-sm">
            <div className="flex justify-between items-center border-b border-border/50 pb-3 mb-5">
              <h3 className="text-lg font-bold text-primary font-mono">XAUUSD Position Sizer</h3>
              <Button onClick={handleUpdateEquityManual} size="sm" variant="outline" className="h-7 text-[10px] border-border/50 text-slate-300">
                <Edit3 size={12} className="mr-1" /> Edit Equity
              </Button>
            </div>
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

            <div className="p-4 border border-border/50 bg-zinc-950 rounded-xl flex items-center justify-between font-mono text-xs">
              <div>
                <p className="font-bold text-foreground">Live Account Equity Balance</p>
                <p className="text-muted-foreground text-[10px]">Current: ${config.total_equity.toFixed(2)}</p>
              </div>
              <Button onClick={handleUpdateEquityManual} size="sm" variant="outline" className="border-border/50 text-xs font-bold">
                <Edit3 size={12} className="mr-1" /> Adjust Balance
              </Button>
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