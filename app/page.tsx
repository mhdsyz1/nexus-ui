"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";

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
}

// ============================================================================
// WIDGET: TRADINGVIEW ADVANCED CHART
// ============================================================================
function TradingViewChart() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    container.current.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: "OANDA:XAUUSD",
      interval: "15",
      timezone: "Asia/Singapore",
      theme: "dark",
      style: "1",
      locale: "en",
      enable_publishing: false,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      support_host: "https://www.tradingview.com"
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
// MAIN TERMINAL APPLICATION
// ============================================================================
export default function QuantTerminal() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<"TERMINAL" | "CALCULATOR">("TERMINAL");

  // Backend States
  const [config, setConfig] = useState<RiskConfig>({ total_equity: 800.0, max_allowed_layers: 4, system_is_killed: false });
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Calculator States
  const [calcEquity, setCalcEquity] = useState<number>(800);
  const [calcRiskPct, setCalcRiskPct] = useState<number>(2);
  const [calcEntry, setCalcEntry] = useState<number>(2350.00);
  const [calcSL, setCalcSL] = useState<number>(2345.00);
  const [calcLotSize, setCalcLotSize] = useState<number>(0);
  const [calcRiskAmount, setCalcRiskAmount] = useState<number>(0);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const { data: configData, error: configError } = await supabase
          .from("risk_configuration")
          .select("total_equity, max_allowed_layers, system_is_killed")
          .order("id", { ascending: false }).limit(1).single();

        if (!configError && configData) {
          setConfig(configData);
          if (calcEquity === 800) setCalcEquity(configData.total_equity); // Auto-fill calc equity
        }

        const { data: queueData, error: queueError } = await supabase
          .from("execution_queue")
          .select("id, ticker, action, status, created_at")
          .order("created_at", { ascending: false }).limit(5);

        if (!queueError && queueData) setQueue(queueData);
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

  const toggleKillSwitch = async () => {
    const currentAction = config.system_is_killed ? "DEACTIVATE" : "ACTIVATE";
    const actionText = currentAction === "ACTIVATE" ? "HALT" : "RESTORE";
    const adminKey = window.prompt(`[AUTHORIZATION REQUIRED]\n\nEnter Admin API Key to ${actionText} system operations:`);
    if (!adminKey) return; 

    try {
      const res = await fetch("https://nexus-backend-production.up.railway.app/api/kill-switch", {
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

  const handleCalculate = () => {
    const riskAmount = calcEquity * (calcRiskPct / 100);
    const slDistance = Math.abs(calcEntry - calcSL);
    const pipValuePerLot = 100;
    
    let lotSize = 0;
    if (slDistance > 0) {
      lotSize = riskAmount / (slDistance * pipValuePerLot);
    }
    
    setCalcRiskAmount(riskAmount);
    setCalcLotSize(lotSize);
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-2 md:p-4 flex flex-col gap-4">
      
      {/* HEADER */}
      <header className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
        <div className="col-span-2 md:col-span-1 p-3 border border-border/50 rounded-lg bg-card flex flex-col justify-center">
          <h2 className="text-[10px] text-muted-foreground uppercase tracking-widest font-sans">Neural Nexus</h2>
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant={activeTab === "TERMINAL" ? "default" : "outline"} onClick={() => setActiveTab("TERMINAL")} className="text-xs w-full">TERMINAL</Button>
            <Button size="sm" variant={activeTab === "CALCULATOR" ? "default" : "outline"} onClick={() => setActiveTab("CALCULATOR")} className="text-xs w-full">CALCULATOR</Button>
          </div>
        </div>
        <div className="col-span-1 p-3 border border-border/50 rounded-lg bg-card flex-col justify-center hidden md:flex">
          <h2 className="text-[10px] text-muted-foreground uppercase tracking-widest font-sans">Total Equity</h2>
          <p className="text-lg font-bold font-mono">${config.total_equity.toFixed(2)}</p>
        </div>
        <div className="col-span-1 p-3 border border-border/50 rounded-lg bg-card flex-col justify-center hidden md:flex">
          <h2 className="text-[10px] text-muted-foreground uppercase tracking-widest font-sans">Risk Exposure</h2>
          <p className="text-lg font-bold font-mono text-destructive">Max Layers: {config.max_allowed_layers}</p>
        </div>
        <div className="col-span-2 md:col-span-1 p-3 border border-border/50 rounded-lg bg-card flex flex-col justify-between items-start">
          <h2 className="text-[10px] text-muted-foreground uppercase tracking-widest font-sans">System Status</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`h-2 w-2 rounded-full ${config.system_is_killed ? "bg-red-600 animate-none" : "bg-emerald-500 animate-pulse"}`} />
            <span className={`text-xs font-mono font-bold ${config.system_is_killed ? "text-red-600" : "text-emerald-500"}`}>
              {config.system_is_killed ? "HALTED" : "OPERATIONAL"}
            </span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 min-h-[600px]">
        
        {/* TERMINAL TAB */}
        {activeTab === "TERMINAL" && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="col-span-1 md:col-span-3 p-4 border border-border/50 rounded-lg bg-card flex flex-col justify-between order-2 md:order-1">
              <div className="pt-4 border-t border-border/50">
                <Button 
                  onClick={toggleKillSwitch}
                  variant={config.system_is_killed ? "default" : "destructive"} 
                  className={`w-full font-bold font-mono tracking-wider border transition-colors ${config.system_is_killed ? "bg-emerald-950 text-emerald-400 border-emerald-800 hover:bg-emerald-900" : "bg-red-950 text-red-400 border-red-800 hover:bg-red-900"}`}
                >
                  {config.system_is_killed ? "🟢 RESTORE SYSTEM" : "🛑 KILL SWITCH"}
                </Button>
              </div>
            </div>

            <div className="col-span-1 md:col-span-6 p-2 md:p-4 border border-border/50 rounded-lg bg-card flex flex-col order-1 md:order-2">
              <h3 className="text-xs text-muted-foreground border-b border-border/50 pb-2 mb-2 font-sans uppercase">Live Charting (XAUUSD)</h3>
              <div className="flex-1 border border-border/20 rounded bg-zinc-950 overflow-hidden min-h-[350px]">
                <TradingViewChart />
              </div>
            </div>

            <div className="col-span-1 md:col-span-3 p-4 border border-border/50 rounded-lg bg-card flex flex-col order-3">
              <h3 className="text-xs text-muted-foreground border-b border-border/50 pb-2 mb-4 font-sans uppercase">Execution Queue</h3>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {loading ? (
                  <div className="text-xs font-mono text-muted-foreground">Syncing...</div>
                ) : queue.length === 0 ? (
                  <div className="text-xs font-mono text-muted-foreground">Queue clear.</div>
                ) : (
                  queue.map((item) => (
                    <div key={item.id} className="p-2 bg-background border border-border/50 rounded text-xs font-mono shadow-sm">
                      <span className={item.action === "BUY" ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}>{item.action}</span>{" "}
                      {item.ticker}
                      <div className="text-muted-foreground mt-1 flex justify-between items-center text-[10px]">
                        <span className="uppercase">{item.status}</span>
                        <span>{new Date(item.created_at).toLocaleTimeString([], { hour12: false })}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* CALCULATOR TAB */}
        {activeTab === "CALCULATOR" && (
          <div className="w-full max-w-md mx-auto p-4 md:p-6 border border-border/50 rounded-lg bg-card">
            <h3 className="text-lg font-bold font-mono mb-4 text-primary border-b border-border/50 pb-2">XAUUSD Position Sizer</h3>
            
            <div className="space-y-4 font-mono text-sm">
              <div className="flex flex-col gap-1">
                <label className="text-muted-foreground">Account Equity ($)</label>
                <input type="number" value={calcEquity} onChange={(e) => setCalcEquity(Number(e.target.value))} className="w-full text-base p-2 bg-background border border-border rounded focus:ring-1 focus:ring-primary outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-muted-foreground">Risk Percentage (%)</label>
                <input type="number" step="0.1" value={calcRiskPct} onChange={(e) => setCalcRiskPct(Number(e.target.value))} className="w-full text-base p-2 bg-background border border-border rounded focus:ring-1 focus:ring-primary outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-muted-foreground">Entry Price</label>
                <input type="number" step="0.01" value={calcEntry} onChange={(e) => setCalcEntry(Number(e.target.value))} className="w-full text-base p-2 bg-background border border-border rounded focus:ring-1 focus:ring-primary outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-muted-foreground">Stop Loss Price</label>
                <input type="number" step="0.01" value={calcSL} onChange={(e) => setCalcSL(Number(e.target.value))} className="w-full text-base p-2 bg-background border border-border rounded focus:ring-1 focus:ring-primary outline-none" />
              </div>

              <Button onClick={handleCalculate} className="w-full mt-4 font-bold tracking-wider">CALCULATE LOT SIZE</Button>
              
              {calcLotSize > 0 && (
                <div className="mt-6 p-4 bg-background border border-border/50 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Capital at Risk:</span>
                    <span className="font-bold text-destructive">${calcRiskAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stop Loss Distance:</span>
                    <span className="font-bold">{Math.abs(calcEntry - calcSL).toFixed(2)} Points</span>
                  </div>
                  <div className="flex justify-between border-t border-border/50 pt-2 mt-2">
                    <span className="text-muted-foreground">Recommended Size:</span>
                    <span className="font-bold text-emerald-500 text-lg">{calcLotSize.toFixed(2)} Lots</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}