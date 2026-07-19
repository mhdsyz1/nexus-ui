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
// WIDGET: TRADINGVIEW ADVANCED CHART INJECTION
// ============================================================================
function TradingViewChart() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;

    // Prevent duplicate script injections during React Strict Mode re-renders
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
      calendar: false,
      support_host: "https://www.tradingview.com"
    });

    container.current.appendChild(script);
  }, []);

  return (
    <div className="tradingview-widget-container w-full h-full flex flex-col" ref={container}>
      <div className="tradingview-widget-container__widget w-full flex-1" />
    </div>
  );
}

// ============================================================================
// MAIN TERMINAL DASHBOARD
// ============================================================================
export default function QuantTerminal() {
  const [config, setConfig] = useState<RiskConfig>({ 
    total_equity: 800.0, 
    max_allowed_layers: 4,
    system_is_killed: false 
  });
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Live Telemetry Polling Loop
  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const { data: configData, error: configError } = await supabase
          .from("risk_configuration")
          .select("total_equity, max_allowed_layers, system_is_killed")
          .order("id", { ascending: false })
          .limit(1)
          .single();

        if (!configError && configData) {
          setConfig(configData);
        }

        const { data: queueData, error: queueError } = await supabase
          .from("execution_queue")
          .select("id, ticker, action, status, created_at")
          .order("created_at", { ascending: false })
          .limit(5);

        if (!queueError && queueData) {
          setQueue(queueData);
        }
      } catch (err) {
        console.error("Failed to sync with Supabase instance:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000);
    return () => clearInterval(interval);
  }, []);

  // 2. Secure Administrative Override Execution
  const toggleKillSwitch = async () => {
    const currentAction = config.system_is_killed ? "DEACTIVATE" : "ACTIVATE";
    const actionText = currentAction === "ACTIVATE" ? "HALT" : "RESTORE";
    
    // Securely prompt the operator for the key (keeps it out of the JS bundle)
    const adminKey = window.prompt(`[AUTHORIZATION REQUIRED]\n\nEnter Admin API Key to ${actionText} system operations:`);
    
    if (!adminKey) return; 

    try {
      const res = await fetch("https://nexus-neural-machine-backend-production.up.railway.app/api/kill-switch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": adminKey
        },
        body: JSON.stringify({ action: currentAction })
      });

      if (res.ok) {
        alert(`Command accepted. System ${currentAction}D.`);
      } else {
        alert("Command rejected: Invalid Admin Key or Network Error.");
      }
    } catch (err) {
      alert("Fatal: Could not reach middleware pipeline.");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 flex flex-col gap-4">
      
      {/* TOP NAVIGATION / GLOBAL METRICS */}
      <header className="grid grid-cols-4 gap-4">
        <div className="col-span-1 p-4 border border-border/50 rounded-lg bg-card flex flex-col justify-center">
          <h2 className="text-xs text-muted-foreground uppercase tracking-widest font-sans">Neural Nexus</h2>
          <p className="text-xl font-bold font-mono text-primary">v3.1.0_LIVE</p>
        </div>
        <div className="col-span-1 p-4 border border-border/50 rounded-lg bg-card flex flex-col justify-center">
          <h2 className="text-xs text-muted-foreground uppercase tracking-widest font-sans">Total Equity</h2>
          <p className="text-xl font-bold font-mono">${config.total_equity.toFixed(2)}</p>
        </div>
        <div className="col-span-1 p-4 border border-border/50 rounded-lg bg-card flex flex-col justify-center">
          <h2 className="text-xs text-muted-foreground uppercase tracking-widest font-sans">Risk Exposure</h2>
          <p className="text-xl font-bold font-mono text-destructive">Max Layers: {config.max_allowed_layers}</p>
        </div>
        <div className="col-span-1 p-4 border border-border/50 rounded-lg bg-card flex flex-col justify-between items-start">
          <h2 className="text-xs text-muted-foreground uppercase tracking-widest font-sans">System Status</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`h-2 w-2 rounded-full ${config.system_is_killed ? "bg-red-600 animate-none" : "bg-emerald-500 animate-pulse"}`} />
            <span className={`text-sm font-mono font-bold ${config.system_is_killed ? "text-red-600" : "text-emerald-500"}`}>
              {config.system_is_killed ? "HALTED" : "OPERATIONAL"}
            </span>
          </div>
        </div>
      </header>

      {/* CORE CONTROL MODULES */}
      <main className="flex-1 grid grid-cols-12 gap-4 min-h-[600px]">
        
        {/* LEFT COLUMN: CONTROLS */}
        <div className="col-span-3 p-4 border border-border/50 rounded-lg bg-card flex flex-col justify-between">
          <div>
            <h3 className="text-sm text-muted-foreground border-b border-border/50 pb-2 mb-4 font-sans uppercase">Contingency Controls</h3>
            <div className="space-y-4">
              <Button variant="outline" className="w-full text-xs font-mono justify-start text-amber-500 border-amber-500/30 hover:bg-amber-500/10">
                ⚡ REQUEST MANUAL APPROVAL
              </Button>
            </div>
          </div>
          <div className="pt-4 border-t border-border/50">
            <Button 
              onClick={toggleKillSwitch}
              variant={config.system_is_killed ? "default" : "destructive"} 
              className={`w-full font-bold font-mono tracking-wider border transition-colors ${
                config.system_is_killed 
                  ? "bg-emerald-950 text-emerald-400 border-emerald-800 hover:bg-emerald-900" 
                  : "bg-red-950 text-red-400 border-red-800 hover:bg-red-900"
              }`}
            >
              {config.system_is_killed ? "🟢 RESTORE SYSTEM" : "🛑 SYSTEM KILL SWITCH"}
            </Button>
            <p className="text-[10px] text-muted-foreground mt-2 text-center font-mono">
              {config.system_is_killed 
                ? "SYSTEM HALTED. Inbound signals are currently being dropped." 
                : "WARNING: Instantly purges active loops and drops execution routing."}
            </p>
          </div>
        </div>

        {/* MIDDLE COLUMN: LIVE CHART INJECTION ZONE */}
        <div className="col-span-6 p-4 border border-border/50 rounded-lg bg-card flex flex-col">
          <h3 className="text-sm text-muted-foreground border-b border-border/50 pb-2 mb-2 font-sans uppercase">Live Charting (XAUUSD)</h3>
          <div className="flex-1 border border-border/20 rounded bg-zinc-950 overflow-hidden min-h-[450px]">
            <TradingViewChart />
          </div>
        </div>

        {/* RIGHT COLUMN: EVENT QUEUE & LOGS */}
        <div className="col-span-3 p-4 border border-border/50 rounded-lg bg-card flex flex-col">
          <h3 className="text-sm text-muted-foreground border-b border-border/50 pb-2 mb-4 font-sans uppercase">Execution Queue</h3>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {loading ? (
              <div className="text-xs font-mono text-muted-foreground">Syncing telemetry data...</div>
            ) : queue.length === 0 ? (
              <div className="text-xs font-mono text-muted-foreground">Queue clear. No pending alerts.</div>
            ) : (
              queue.map((item) => (
                <div key={item.id} className="p-2 bg-background border border-border/50 rounded text-xs font-mono shadow-sm">
                  <span className={item.action === "BUY" ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}>
                    {item.action}
                  </span>{" "}
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
      </main>
    </div>
  );
}