'use client';
import { useState } from 'react';

interface QueueItem {
  id: string;
  ticker: string;
  action: string;
  status: string;
  zone_low?: number;
  zone_high?: number;
  stop_loss?: number;
  take_profit?: number;
  market_regime?: string;
  volume_delta?: number;
  magnet_node?: number;
}

export default function SignalDashboard({ signals }: { signals: QueueItem[] }) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const resolveTrade = async (id: string, outcome: string) => {
    setLoadingId(id);
    try {
      await fetch('/api/resolve-trade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret_token: process.env.NEXT_PUBLIC_WEBHOOK_SECRET,
          trade_id: id,
          outcome: outcome
        })
      });
      // Integrate your UI refresh state/logic here
    } catch (error) {
      console.error("Resolution failed", error);
    }
    setLoadingId(null);
  };

  return (
    <div className="overflow-x-auto bg-slate-900 rounded-lg shadow-xl border border-slate-800">
      <table className="w-full whitespace-nowrap">
        <thead className="bg-slate-950/50 border-b border-slate-800">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Asset</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Regime</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Delta</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Magnet</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {(signals || []).map((item) => (
            <tr key={item.id} className="hover:bg-slate-800/20 transition-colors">
              <td className="px-4 py-3">
                <div className="font-bold text-slate-200">{item.ticker}</div>
                <div className={`text-xs ${item.action?.includes('BUY') ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {item.action}
                </div>
              </td>
              
              <td className="px-4 py-3 text-xs">
                <span className={`px-2 py-0.5 rounded font-bold text-[10px] tracking-wider ${
                  item.market_regime === 'TRENDING' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 
                  item.market_regime === 'CHOP' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                  'bg-slate-500/10 text-slate-400'
                }`}>
                  {item.market_regime || 'NEUTRAL'}
                </span>
              </td>

              <td className={`px-4 py-3 font-mono text-xs font-medium ${
                (item.volume_delta || 0) > 0 ? 'text-emerald-400' : (item.volume_delta || 0) < 0 ? 'text-rose-400' : 'text-slate-400'
              }`}>
                {(item.volume_delta || 0) > 0 ? '+' : ''}
                {item.volume_delta ? Number(item.volume_delta).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'}
              </td>

              <td className="px-4 py-3 font-mono text-xs text-yellow-500 font-semibold">
                ${item.magnet_node ? Number(item.magnet_node).toFixed(2) : '0.00'}
              </td>

              <td className="px-4 py-3 text-right space-x-2">
                <button onClick={() => resolveTrade(item.id, 'WIN')} disabled={loadingId === item.id} className="px-3 py-1 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded text-xs font-bold border border-emerald-500/20 transition-all">
                  WIN
                </button>
                <button onClick={() => resolveTrade(item.id, 'LOSS')} disabled={loadingId === item.id} className="px-3 py-1 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded text-xs font-bold border border-rose-500/20 transition-all">
                  LOSS
                </button>
                <button onClick={() => resolveTrade(item.id, 'SKIPPED')} disabled={loadingId === item.id} className="px-3 py-1 bg-slate-500/10 text-slate-400 hover:bg-slate-500/20 rounded text-xs font-bold border border-slate-500/20 transition-all">
                  SKIP
                </button>
              </td>
            </tr>
          ))}
          {(!signals || signals.length === 0) && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">
                No active signals in queue.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}