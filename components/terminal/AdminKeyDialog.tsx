"use client";

import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useTerminalStore } from "@/lib/quant/store";
import { QtDialog, qtInputClass, qtInputStyle } from "./QtDialog";

/**
 * THE AUTH VAULT (final form). Opens whenever a command-plane action
 * needs a token and none is cached; resolves the pending
 * adminFetch promise on submit — the same contract as Phase 2.
 *
 * "Remember this device" ON  → token sealed with a non-extractable
 *   WebCrypto AES-GCM device key (see lib/quant/vault.ts).
 * OFF → memory-only: the token dies with this tab/session.
 */
export function AdminKeyDialog() {
  const open = useTerminalStore((s) => s.keyPromptOpen);
  const submit = useTerminalStore((s) => s.submitAdminKey);
  const cancel = useTerminalStore((s) => s.cancelAdminKey);
  const [value, setValue] = useState("");
  const [remember, setRemember] = useState(true);

  const handleSubmit = () => {
    if (!value.trim()) return;
    submit(value, remember);
    setValue("");
  };

  return (
    <QtDialog
      open={open}
      title="AUTH VAULT"
      subtitle="This action requires the engine's secret token"
      onClose={() => {
        cancel();
        setValue("");
      }}
    >
      <div className="flex flex-col gap-3">
        <label className="qt-label flex items-center gap-1.5">
          <KeyRound size={11} /> Secret token
        </label>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="••••••••••••"
          autoComplete="off"
          className={qtInputClass}
          style={qtInputStyle}
        />

        {/* Remember-device toggle */}
        <button
          role="switch"
          aria-checked={remember}
          onClick={() => setRemember((r) => !r)}
          className="flex items-center justify-between gap-3 rounded-lg p-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)]"
          style={{ background: "var(--qt-surface-2)", border: "1px solid var(--qt-border-strong)" }}
        >
          <span className="qt-num text-[10px] font-bold text-left" style={{ color: "var(--qt-text)" }}>
            Remember this device
            <span className="block font-normal mt-0.5" style={{ color: "var(--qt-text-faint)", fontSize: "8.5px" }}>
              {remember
                ? "Token sealed at rest with a non-exportable device key (WebCrypto)"
                : "Memory only — you'll re-enter the token next session"}
            </span>
          </span>
          <span
            className="relative shrink-0 w-8 h-[18px] rounded-full transition-colors duration-150"
            style={{ background: remember ? "var(--qt-accent-dim)" : "var(--qt-surface-3)", border: "1px solid var(--qt-border-strong)" }}
          >
            <span
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full transition-all duration-150"
              style={{
                left: remember ? "calc(100% - 16px)" : "2px",
                background: remember ? "var(--qt-accent)" : "var(--qt-text-faint)",
              }}
            />
          </span>
        </button>

        <p className="qt-num text-[8.5px] flex items-start gap-1.5" style={{ color: "var(--qt-text-faint)" }}>
          <ShieldCheck size={11} className="shrink-0 mt-px" style={{ color: "var(--qt-accent)" }} />
          Sent as X-Admin-Key per action; a rejected token wipes the vault and
          re-prompts. Encryption protects the token at rest on this device — it
          cannot protect against scripts running on this page; rotate the server
          secret if you suspect compromise.
        </p>

        <button
          onClick={handleSubmit}
          disabled={!value.trim()}
          className="qt-num w-full py-2.5 rounded-lg text-xs font-bold tracking-[0.12em] transition-opacity disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)] outline-none"
          style={{
            background: "var(--qt-accent-dim)",
            color: "var(--qt-text)",
            border: "1px solid var(--qt-accent)",
          }}
        >
          UNLOCK & AUTHORIZE
        </button>
      </div>
    </QtDialog>
  );
}
