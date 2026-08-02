"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Calculator, Zap } from "lucide-react";
import { useRiskConfig } from "@/hooks/useSupabaseReads";
import { useSignalContext } from "@/hooks/useSupabaseReads";
import { ENGINE_RR, CONTRACT_OZ, USD_PER_PIP, computePositionSize, LADDER_TIER_OFFSET } from "@/lib/quant/constants";
import { qtInputClass, qtInputStyle } from "./QtDialog";

/* MANUAL WHAT-IF ONLY — "if I risked X%, what size is that?"
   This is the operator's own scenario and is NOT what the engine does.
   trading_state.compute_position_size walks the written MM ladder on equity
   alone, one rung BELOW the balance's own tier, ignoring risk percentage
   entirely. The engine's real size is rendered separately below; the old
   percentage matrix claimed to BE the engine and returned 0.02–0.05 lots
   where the engine sizes 0.01 — a 5x overtrade if followed. */
const lotsFor = (equity: number, pct: number, dist: number) =>
  dist > 0 ? (equity * pct) / (dist * CONTRACT_OZ) : 0;

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: "1px solid var(--qt-border)" }}>
      <span className="qt-label">{label}</span>
      <span className="qt-num text-[12px] font-bold" style={{ color: accent ?? "var(--qt-text)" }}>{value}</span>
    </div>
  );
}

export function PositionSizer() {
  const { config } = useRiskConfig();
  const ctx = useSignalContext();

  const [equity, setEquity] = useState("");
  const [equityTouched, setEquityTouched] = useState(false);
  const [riskPct, setRiskPct] = useState("2");
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");

  // Track live equity until the trader overrides it by hand
  useEffect(() => {
    if (!equityTouched && config.total_equity > 0) {
      setEquity(config.total_equity.toFixed(2));
    }
  }, [config.total_equity, equityTouched]);

  const equityNum = parseFloat(equity) || 0;
  const riskPctNum = parseFloat(riskPct) || 0;
  const entryNum = parseFloat(entry) || 0;
  const slNum = parseFloat(sl) || 0;
  const tpNum = parseFloat(tp) || 0;

  const calc = useMemo(() => {
    const dist = Math.abs(entryNum - slNum);
    if (equityNum <= 0 || riskPctNum <= 0 || dist <= 0) return null;
    const riskUsd = equityNum * (riskPctNum / 100);
    const lots = lotsFor(equityNum, riskPctNum / 100, dist);
    const isLong = tpNum ? tpNum > entryNum : slNum < entryNum;
    const reward = tpNum ? Math.abs(tpNum - entryNum) : dist * ENGINE_RR;
    const r = reward / dist;
    return {
      dist,
      pips: dist / USD_PER_PIP,
      riskUsd,
      lots,
      r,
      rewardUsd: riskUsd * r,
      tpImplied: !tpNum,
      isLong,
    };
  }, [equityNum, riskPctNum, entryNum, slNum, tpNum]);

  return (
    <div className="qt-card max-w-md mx-auto w-full p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between pb-3" style={{ borderBottom: "1px solid var(--qt-border)" }}>
        <span className="qt-label flex items-center gap-1.5" style={{ color: "var(--qt-text)" }}>
          <Calculator size={13} /> XAUUSD position sizer
        </span>
        {!equityTouched && (
          <span className="qt-num flex items-center gap-1 text-[9px] font-bold" style={{ color: "var(--qt-long)" }} title="Tracking risk_configuration — type in the field to override">
            <Zap size={10} /> LIVE EQUITY
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="qt-label">Account equity ($)</label>
          <input type="number" step="0.01" value={equity}
            onChange={(e) => { setEquity(e.target.value); setEquityTouched(true); }}
            className={qtInputClass} style={qtInputStyle} />
          {equityTouched && (
            <button
              onClick={() => { setEquityTouched(false); setEquity(config.total_equity.toFixed(2)); }}
              className="qt-num self-start text-[8.5px] underline outline-none focus-visible:ring-1 focus-visible:ring-[var(--qt-accent)]"
              style={{ color: "var(--qt-accent)" }}
            >
              re-sync to live (${config.total_equity.toFixed(2)})
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="qt-label">Risk (%)</label>
          <input type="number" step="0.1" value={riskPct} onChange={(e) => setRiskPct(e.target.value)}
            className={qtInputClass} style={qtInputStyle} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="qt-label">Entry price</label>
          <input type="number" step="0.01" value={entry} placeholder={ctx.refPrice?.toFixed(2) ?? "0.00"}
            onChange={(e) => setEntry(e.target.value)} className={qtInputClass} style={qtInputStyle} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="qt-label">Stop loss</label>
          <input type="number" step="0.01" value={sl} onChange={(e) => setSl(e.target.value)}
            className={qtInputClass} style={qtInputStyle} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-2">
          <label className="qt-label">Take profit (blank = engine {ENGINE_RR}R)</label>
          <input type="number" step="0.01" value={tp} onChange={(e) => setTp(e.target.value)}
            className={qtInputClass} style={qtInputStyle} />
        </div>
      </div>

      {calc ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl p-4" style={{ background: "var(--qt-surface-2)" }}>
            <Row label="Capital at risk" value={`$${calc.riskUsd.toFixed(2)}`} accent="var(--qt-short)" />
            <Row label="SL distance" value={`$${calc.dist.toFixed(2)} · ${Math.round(calc.pips)} pips`} />
            <Row label={`Projected reward (${calc.r.toFixed(1)}R${calc.tpImplied ? " engine" : ""})`} value={`$${calc.rewardUsd.toFixed(2)}`} accent="var(--qt-long)" />
            <div className="flex items-center justify-between pt-3">
              <span className="qt-label" style={{ color: "var(--qt-text-muted)" }}>
                What-if at {riskPctNum}% &mdash; not the engine
              </span>
              <motion.span
                key={calc.lots.toFixed(2)}
                initial={{ opacity: 0.4, y: -2 }}
                animate={{ opacity: 1, y: 0 }}
                className="qt-num text-base font-bold"
                style={{ color: "var(--qt-text-muted)" }}
              >
                {calc.lots.toFixed(2)} lots
              </motion.span>
            </div>
          </div>

          {/* 1:R distribution preview — risk vs reward span */}
          <div>
            <div className="flex h-3 rounded-full overflow-hidden" title={`Risk 1R : Reward ${calc.r.toFixed(1)}R`}>
              <motion.span
                initial={false}
                animate={{ flexGrow: 1 }}
                className="qt-num flex items-center justify-center text-[7.5px] font-bold"
                style={{ background: "rgb(244 63 94 / 0.55)", color: "var(--qt-text)", flexBasis: 0 }}
              >
                1R
              </motion.span>
              <motion.span
                initial={false}
                animate={{ flexGrow: calc.r }}
                transition={{ duration: 0.35 }}
                className="qt-num flex items-center justify-center text-[7.5px] font-bold"
                style={{ background: "rgb(16 185 129 / 0.45)", color: "var(--qt-text)", flexBasis: 0 }}
              >
                {calc.r.toFixed(1)}R
              </motion.span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="qt-num text-[8.5px]" style={{ color: "var(--qt-short)" }}>−${calc.riskUsd.toFixed(2)}</span>
              <span className="qt-num text-[8.5px]" style={{ color: "var(--qt-long)" }}>+${calc.rewardUsd.toFixed(2)}</span>
            </div>
          </div>

          {/* Engine size — the MM ladder, which is what the engine actually writes */}
          {(() => {
            const { lots, layers } = computePositionSize(equityNum);
            const perLayer = calc.dist > 0 ? calc.dist * CONTRACT_OZ * lots : 0;
            const pctOfEquity = equityNum > 0 ? (perLayer / equityNum) * 100 : 0;
            return (
              <div className="rounded-xl p-3" style={{ background: "var(--qt-surface-2)" }}>
                <span className="qt-label" style={{ color: "var(--qt-accent)" }}>
                  ▸ Engine size · what will actually be traded
                  {LADDER_TIER_OFFSET > 0 ? ` — MM ladder, one rung below $${equityNum.toFixed(0)}` : " — MM ladder"}
                </span>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div className="rounded-lg p-2 text-center" style={{ border: "1px solid var(--qt-accent)" }}>
                    <p className="qt-num text-[9px]" style={{ color: "var(--qt-text-muted)" }}>lots / layer</p>
                    <p className="qt-num text-2xl font-bold" style={{ color: "var(--qt-accent)" }}>{lots.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg p-2 text-center" style={{ border: "1px solid var(--qt-border-strong)" }}>
                    <p className="qt-num text-[9px]" style={{ color: "var(--qt-text-muted)" }}>risk / layer</p>
                    <p className="qt-num text-[13px] font-bold" style={{ color: "var(--qt-short)" }}>${perLayer.toFixed(2)}</p>
                    <p className="qt-num text-[8px]" style={{ color: "var(--qt-text-faint)" }}>{pctOfEquity.toFixed(1)}% of equity</p>
                  </div>
                  <div className="rounded-lg p-2 text-center" style={{ border: "1px solid var(--qt-border-strong)" }}>
                    <p className="qt-num text-[9px]" style={{ color: "var(--qt-text-muted)" }}>max layers</p>
                    <p className="qt-num text-[13px] font-bold" style={{ color: "var(--qt-text)" }}>{layers}</p>
                    <p className="qt-num text-[8px]" style={{ color: "var(--qt-text-faint)" }}>${(perLayer * layers).toFixed(2)} if fully layered</p>
                  </div>
                </div>
                {calc && calc.lots > lots * 1.5 && (
                  <p className="qt-num text-[9px] mt-2" style={{ color: "var(--qt-warn)" }}>
                    Your {riskPctNum}% what-if sizes {(calc.lots / lots).toFixed(1)}× the engine.
                    Trading {calc.lots.toFixed(2)} instead of {lots.toFixed(2)} breaks the MM ladder.
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="text-center py-5 rounded-xl" style={{ border: "1px dashed var(--qt-border-strong)" }}>
          <span className="qt-num text-[10px]" style={{ color: "var(--qt-text-faint)" }}>
            Enter equity, risk %, entry and stop loss to size the position.
          </span>
        </div>
      )}
    </div>
  );
}
