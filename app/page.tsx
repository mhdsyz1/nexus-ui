import { Button } from "@/components/ui/button";

export default function QuantTerminal() {
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
          <p className="text-xl font-bold font-mono">$800.00</p>
        </div>
        <div className="col-span-1 p-4 border border-border/50 rounded-lg bg-card flex flex-col justify-center">
          <h2 className="text-xs text-muted-foreground uppercase tracking-widest font-sans">Risk Exposure</h2>
          <p className="text-xl font-bold font-mono text-destructive">Max Layers: 4</p>
        </div>
        <div className="col-span-1 p-4 border border-border/50 rounded-lg bg-card flex items-center justify-end">
           {/* THE KILL SWITCH */}
          <Button variant="destructive" className="w-full h-full font-mono font-bold tracking-widest uppercase">
            Engage Kill Switch
          </Button>
        </div>
      </header>

      {/* MAIN BENTO BOX GRID */}
      <main className="grid grid-cols-12 gap-4 flex-1">
        
        {/* LEFT COLUMN: SYSTEM CONTROLS & STATUS (3 Cols) */}
        <div className="col-span-3 flex flex-col gap-4">
          <div className="flex-1 p-4 border border-border/50 rounded-lg bg-card">
            <h3 className="text-sm text-muted-foreground border-b border-border/50 pb-2 mb-4 font-sans uppercase">Risk Tranches</h3>
            <div className="space-y-4 font-mono text-sm">
              <div className="flex justify-between"><span>T1 (Low):</span> <span className="text-primary">2.0%</span></div>
              <div className="flex justify-between"><span>T2 (Mid):</span> <span className="text-primary">4.0%</span></div>
              <div className="flex justify-between"><span>T3 (High):</span> <span className="text-primary">6.0%</span></div>
            </div>
          </div>
          <div className="flex-1 p-4 border border-border/50 rounded-lg bg-card">
            <h3 className="text-sm text-muted-foreground border-b border-border/50 pb-2 mb-4 font-sans uppercase">Telemetry</h3>
            <div className="space-y-4 font-mono text-sm">
              <div className="flex justify-between"><span>DB Latency:</span> <span className="text-green-500">12ms</span></div>
              <div className="flex justify-between"><span>Webhook Status:</span> <span className="text-green-500">SECURE</span></div>
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: MAIN CHART WIDGET (6 Cols) */}
        <div className="col-span-6 p-4 border border-border/50 rounded-lg bg-card flex flex-col">
          <h3 className="text-sm text-muted-foreground border-b border-border/50 pb-2 mb-4 font-sans uppercase">Live Charting (XAUUSD)</h3>
          <div className="flex-1 border border-border/20 rounded bg-zinc-950 flex items-center justify-center text-muted-foreground font-mono text-sm">
            [ TradingView Advanced Chart Widget Injection Zone ]
          </div>
        </div>

        {/* RIGHT COLUMN: EVENT QUEUE & LOGS (3 Cols) */}
        <div className="col-span-3 p-4 border border-border/50 rounded-lg bg-card flex flex-col">
          <h3 className="text-sm text-muted-foreground border-b border-border/50 pb-2 mb-4 font-sans uppercase">Execution Queue</h3>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {/* Mock Queue Items */}
            <div className="p-2 bg-background border border-border/50 rounded text-xs font-mono">
              <span className="text-primary">BUY</span> XAUUSD @ 2345.10
              <div className="text-muted-foreground mt-1">Status: PENDING...</div>
            </div>
            <div className="p-2 bg-background border border-border/50 rounded text-xs font-mono">
              <span className="text-destructive">SELL</span> XAUUSD @ 2350.25
              <div className="text-green-500 mt-1">Status: EXECUTED</div>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}