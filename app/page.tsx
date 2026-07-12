'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Activity, TrendingUp, TrendingDown, Zap, Shield } from 'lucide-react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

// Initialize the secure client layer using local environmental variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface TradingStateRow {
  timeframe: string;
  current_bias: string;
  session_trade_count: number;
}

interface SignalLogRow {
  created_at: string;
  ticker: string;
  timeframe: string;
  action: string;
  entry_price: number;
  take_profit: number;
  stop_loss: number;
  atr_volatility: number;
  market_context: string;
}

export default function NeuralNexusDashboard() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [states, setStates] = useState<TradingStateRow[]>([]);
  const [logs, setLogs] = useState<SignalLogRow[]>([]);

  // 1. Live Running Clock Routine
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Centralized Ingestion Core
  const fetchLiveTelemetry = async () => {
    // Ingest state updates sorted alphabetically by timeframe context keys
    const { data: stateData } = await supabase
      .from('trading_state')
      .select('*')
      .order('timeframe', { ascending: true });

    // Ingest the 10 most recent logging anomalies to protect grid capacity
    const { data: logData } = await supabase
      .from('signal_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (stateData) setStates(stateData);
    if (logData) setLogs(logData);
  };

  // 3. Realtime Stream Synchronization Wireframe
  useEffect(() => {
    fetchLiveTelemetry();

    // Hook listeners directly into table broadcast replication events
    const stateChannel = supabase
      .channel('live-state-tracker')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trading_state' }, () => {
        fetchLiveTelemetry();
      })
      .subscribe();

    const logChannel = supabase
      .channel('live-log-tracker')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signal_logs' }, () => {
        fetchLiveTelemetry();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(stateChannel);
      supabase.removeChannel(logChannel);
    };
  }, []);

  // 4. Transform logging coordinates for Recharts array synchronization
  const volatilityData = logs
    .slice()
    .reverse()
    .map((item, index) => ({
      signal: index + 1,
      atr: Number(item.atr_volatility),
    }));

  // Utility extractors to populate operational status cards cleanly
  const getContextCard = (tf: string) => {
    const match = states.find((s) => s.timeframe === tf);
    return {
      bias: match?.current_bias || 'NONE',
      count: match?.session_trade_count ?? 0,
    };
  };

  const m5 = getContextCard('M5');
  const m15 = getContextCard('M15');
  const h1 = getContextCard('H1');

  return (
    <div className="min-h-screen bg-slate-950 text-gray-100 p-4 md:p-6 lg:p-8">
      <div className="max-w-[1800px] mx-auto space-y-6">
        
        {/* HEADER */}
        <header className="relative overflow-hidden rounded-lg border border-blue-900/50 bg-slate-900/80 backdrop-blur-sm p-6 shadow-2xl shadow-blue-900/20">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-950/20 via-purple-950/20 to-blue-950/20" />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Shield className="w-8 h-8 text-blue-400 animate-pulse" />
              <h1 className="text-2xl md:text-4xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400">
                NEURAL NEXUS // OPERATION BEAST
              </h1>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-green-950/50 border border-green-500/50 shadow-lg shadow-green-500/20">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-400 font-semibold text-sm tracking-wider">SYSTEM ONLINE</span>
              </div>
              <div className="font-mono text-xl md:text-2xl text-blue-400 tabular-nums tracking-wider">
                {currentTime.toLocaleTimeString('en-US', { hour12: false })}
              </div>
            </div>
          </div>
        </header>

        {/* TIMEFRAME STATE MATRIX */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          
          {/* M5 Context Card */}
          <div className={`group relative overflow-hidden rounded-lg border bg-slate-900/80 backdrop-blur-sm p-6 transition-all hover:shadow-2xl ${
            m5.bias === 'BUY' ? 'border-green-900/50 hover:border-green-500/50 hover:shadow-green-500/10' :
            m5.bias === 'SELL' ? 'border-red-900/50 hover:border-red-500/50 hover:shadow-red-500/10' : 'border-slate-700/50 hover:border-slate-500/50'
          }`}>
            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <TrendingUp className={`w-6 h-6 ${m5.bias === 'BUY' ? 'text-green-400' : m5.bias === 'SELL' ? 'text-red-400' : 'text-gray-400'}`} />
                  <h3 className="text-lg font-semibold tracking-wide text-gray-300">M5 Context</h3>
                </div>
                <Activity className="w-5 h-5 opacity-60" />
              </div>
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-gray-500 uppercase tracking-wider">Bias</span>
                  <span className={`text-3xl font-bold font-mono ${
                    m5.bias === 'BUY' ? 'text-green-400' : m5.bias === 'SELL' ? 'text-red-400' : 'text-slate-500'
                  }`}>{m5.bias}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-700/30">
                  <span className="text-xs text-gray-500 uppercase tracking-wider">Session Alerts</span>
                  <span className="text-xl font-mono text-blue-400">{m5.count}</span>
                </div>
              </div>
            </div>
          </div>

          {/* M15 Context Card */}
          <div className={`group relative overflow-hidden rounded-lg border bg-slate-900/80 backdrop-blur-sm p-6 transition-all hover:shadow-2xl ${
            m15.bias === 'BUY' ? 'border-green-900/50 hover:border-green-500/50 hover:shadow-green-500/10' :
            m15.bias === 'SELL' ? 'border-red-900/50 hover:border-red-500/50 hover:shadow-red-500/10' : 'border-slate-700/50 hover:border-slate-500/50'
          }`}>
            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Activity className={`w-6 h-6 ${m15.bias === 'BUY' ? 'text-green-400' : m15.bias === 'SELL' ? 'text-red-400' : 'text-gray-400'}`} />
                  <h3 className="text-lg font-semibold tracking-wide text-gray-300">M15 Context</h3>
                </div>
                <Activity className="w-5 h-5 opacity-60" />
              </div>
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-gray-500 uppercase tracking-wider">Bias</span>
                  <span className={`text-3xl font-bold font-mono ${
                    m15.bias === 'BUY' ? 'text-green-400' : m15.bias === 'SELL' ? 'text-red-400' : 'text-slate-500'
                  }`}>{m15.bias}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-700/30">
                  <span className="text-xs text-gray-500 uppercase tracking-wider">Session Alerts</span>
                  <span className="text-xl font-mono text-blue-400">{m15.count}</span>
                </div>
              </div>
            </div>
          </div>

          {/* H1 Context Card */}
          <div className={`group relative overflow-hidden rounded-lg border bg-slate-900/80 backdrop-blur-sm p-6 transition-all hover:shadow-2xl ${
            h1.bias === 'BUY' ? 'border-green-900/50 hover:border-green-500/50 hover:shadow-green-500/10' :
            h1.bias === 'SELL' ? 'border-red-900/50 hover:border-red-500/50 hover:shadow-red-500/10' : 'border-slate-700/50 hover:border-slate-500/50'
          }`}>
            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <TrendingDown className={`w-6 h-6 ${h1.bias === 'BUY' ? 'text-green-400' : h1.bias === 'SELL' ? 'text-red-400' : 'text-gray-400'}`} />
                  <h3 className="text-lg font-semibold tracking-wide text-gray-300">H1 Context</h3>
                </div>
                <Activity className="w-5 h-5 opacity-60" />
              </div>
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-gray-500 uppercase tracking-wider">Bias</span>
                  <span className={`text-3xl font-bold font-mono ${
                    h1.bias === 'BUY' ? 'text-green-400' : h1.bias === 'SELL' ? 'text-red-400' : 'text-slate-500'
                  }`}>{h1.bias}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-700/30">
                  <span className="text-xs text-gray-500 uppercase tracking-wider">Session Alerts</span>
                  <span className="text-xl font-mono text-blue-400">{h1.count}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION: TELEMETRY + VOLATILITY */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* MAIN TELEMETRY TERMINAL */}
          <div className="lg:col-span-2 relative overflow-hidden rounded-lg border border-blue-900/50 bg-slate-900/80 backdrop-blur-sm shadow-2xl shadow-blue-900/20">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-950/10 via-transparent to-purple-950/10" />
            <div className="relative">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-blue-900/30 bg-slate-950/50">
                <Zap className="w-5 h-5 text-blue-400" />
                <h2 className="text-xl font-bold tracking-wider text-blue-400">MAIN TELEMETRY TERMINAL</h2>
                <div className="ml-auto w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-blue-900/30 bg-slate-950/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-blue-400 uppercase tracking-wider">Time</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-blue-400 uppercase tracking-wider">Asset</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-blue-400 uppercase tracking-wider">TF</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-blue-400 uppercase tracking-wider">Action</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-blue-400 uppercase tracking-wider">Entry</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-blue-400 uppercase tracking-wider">TP</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-blue-400 uppercase tracking-wider">SL</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-blue-400 uppercase tracking-wider">Context</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-900/20">
                    {logs.map((log, index) => {
                      const timeStr = new Date(log.created_at).toLocaleTimeString('en-US', { hour12: false });
                      return (
                        <tr key={index} className="hover:bg-blue-950/20 transition-colors group">
                          <td className="px-4 py-4 font-mono text-sm text-gray-300 tabular-nums">{timeStr}</td>
                          <td className="px-4 py-4 font-mono text-sm font-semibold text-yellow-400">{log.ticker}</td>
                          <td className="px-4 py-4 font-mono text-sm text-purple-400">{log.timeframe}</td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center px-3 py-1 rounded-md text-xs font-bold font-mono ${
                              log.action === 'BUY' 
                                ? 'bg-green-500/20 text-green-400 border border-green-500/50' 
                                : 'bg-red-500/20 text-red-400 border border-red-500/50'
                            }`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="px-4 py-4 font-mono text-sm text-right text-gray-200 tabular-nums">{Number(log.entry_price).toFixed(2)}</td>
                          <td className="px-4 py-4 font-mono text-sm text-right text-green-400 tabular-nums">{Number(log.take_profit).toFixed(2)}</td>
                          <td className="px-4 py-4 font-mono text-sm text-right text-red-400 tabular-nums">{Number(log.stop_loss).toFixed(2)}</td>
                          <td className="px-4 py-4 text-xs text-gray-400 uppercase tracking-wide">
                            {log.market_context.replace('_', ' ')}
                          </td>
                        </tr>
                      );
                    })}
                    {logs.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500 font-mono">
                          AWAITING INBOUND TELEMETRY DATA STRINGS...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* VOLATILITY RADAR */}
          <div className="lg:col-span-1 relative overflow-hidden rounded-lg border border-purple-900/50 bg-slate-900/80 backdrop-blur-sm shadow-2xl shadow-purple-900/20">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-950/10 via-transparent to-blue-950/10" />
            <div className="relative h-full flex flex-col">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-purple-900/30 bg-slate-950/50">
                <Activity className="w-5 h-5 text-purple-400" />
                <h2 className="text-xl font-bold tracking-wider text-purple-400">VOLATILITY RADAR</h2>
                <div className="ml-auto w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              </div>

              {/* CHART CONTAINER */}
              <div className="p-6 flex-1 min-h-[340px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={volatilityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorAtr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="signal" 
                      stroke="#475569" 
                      fontFamily="monospace" 
                      fontSize={12}
                      tickLine={false} 
                    />
                    <YAxis 
                      stroke="#475569" 
                      fontFamily="monospace" 
                      fontSize={12}
                      tickLine={false} 
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#020617',
                        borderColor: '#6b21a8',
                        borderRadius: '0.375rem',
                        color: '#f3f4f6'
                      }}
                      itemStyle={{ color: '#c084fc' }}
                      labelStyle={{ color: '#94a3b8', fontFamily: 'monospace' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="atr" 
                      stroke="#a855f7" 
                      strokeWidth={2} 
                      fillOpacity={1} 
                      fill="url(#colorAtr)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}