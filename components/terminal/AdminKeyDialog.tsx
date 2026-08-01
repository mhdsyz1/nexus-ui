"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useTerminalStore } from "@/lib/quant/store";
import { QtDialog, qtInputClass, qtInputStyle } from "./QtDialog";

/**
 * Replaces every legacy window.prompt. Opens whenever a command-plane
 * action needs a key and none is stored; resolves the pending
 * adminFetch promise on submit. Phase 6 restyles this into the full
 * AuthVault (encrypted at rest, remember-device toggle) behind the
 * same requestAdminKey() contract.
 */
export function AdminKeyDialog() {
  const open = useTerminalStore((s) => s.keyPromptOpen);
  const submit = useTerminalStore((s) => s.submitAdminKey);
  const cancel = useTerminalStore((s) => s.cancelAdminKey);
  const [value, setValue] = useState("");

  const handleSubmit = () => {
    if (!value.trim()) return;
    submit(value);
    setValue("");
  };

  return (
    <QtDialog
      open={open}
      title="AUTHORIZE COMMAND"
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
          className={qtInputClass}
          style={qtInputStyle}
        />
        <p className="text-[10px]" style={{ color: "var(--qt-text-faint)" }}>
          Stored on this device and sent as X-Admin-Key. A rejected key is
          cleared automatically and you will be asked again.
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
          AUTHORIZE
        </button>
      </div>
    </QtDialog>
  );
}
