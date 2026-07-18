"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";

interface RiskConfig {
  total_equity: number;
  max_allowed_layers: number;
}

interface QueueItem {
  id: string;
  ticker: string;
  action: string;
  status: string;
  created_at: string;
}

// Dedicated TradingView Widget Wrapper
function TradingViewChart() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;

    // Prevent duplicate scripts if re-rendering
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

export default function QuantTerminal() {
  const [config, setConfig] = useState<RiskConfig>({ total_equity: 800.0, max_allowed_layers: 4 });
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const { data: configData, error: configError } = await supabase
          .from("risk_configuration")
          .select("total_equity, max_allowed_layers")
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

  return (
    <div className="min-h-screen bg-background text-foreground p-4 flex flex-col gap-4">
      
      {/* TOP NAVIGATION / GLOBAL METRICS */}
      <header className="grid grid-cols-4 gap-4">
        <div className="col-span-1 p-4 border border-border/50 rounded-lg bg-card flex flex-col justify-center">
          <h2 className="text-xs text-muted-foreground uppercase tracking-widest font-sans">Neural Nexus</h2>
          <p className="text-xl font-bold font-mono text-primary">v2.1.0_LIVE</p>
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
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-sm font-mono font-bold text-emerald-500">OPERATIONAL</span>
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
            <Button variant="destructive" className="w-full font-bold font-mono tracking-wider bg-red-950 text-red-400 border border-red-800 hover:bg-red-900">
              🛑 ACTIVATE SYSTEM KILL SWITCH
            </Button>
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
                <div key={item.id} className="p-2 bg-background border border-border/50 rounded text-xs font-mono">
                  <span className={item.action === "BUY" ? "text-emerald-500" : "text-rose-500"}>
                    {item.action}
                  </span>{" "}
                  {item.ticker}
                  <div className="text-muted-foreground mt-1 flex justify-between">
                    <span>Status: {item.status}</span>
                    <span>{new Date(item.created_at).toLocaleTimeString()}</span>
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