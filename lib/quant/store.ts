"use client";

import { create } from "zustand";
import { clearVault, hydrateVault, sealToken } from "./vault";
import type { TerminalView } from "./types";

/**
 * Client state only. All server data lives in TanStack Query.
 *
 * AUTH VAULT (Phase 5 final): the promise-based contract is
 * UNCHANGED from Phase 2 — adminFetch and every component still
 * call requestAdminKey()/clearAdminKey() exactly as before. What
 * changed underneath: plaintext localStorage is gone; the token is
 * sealed with a non-extractable WebCrypto device key (lib/quant/
 * vault.ts) when "remember this device" is on, or held in memory
 * only for the session when it's off.
 */

interface TerminalStore {
  activeView: TerminalView;
  setActiveView: (v: TerminalView) => void;

  /** In-memory token cache (single source once hydrated) */
  cachedToken: string | null;
  vaultHydrated: boolean;
  keyPromptOpen: boolean;

  /** Idempotent eager hydration — called once from QuantProviders */
  ensureHydrated: () => Promise<void>;
  requestAdminKey: () => Promise<string | null>;
  submitAdminKey: (key: string, remember: boolean) => void;
  cancelAdminKey: () => void;
  /** Called on 401/403 so a rotated token re-prompts next action */
  clearAdminKey: () => void;
}

let keyResolver: ((key: string | null) => void) | null = null;
let hydration: Promise<void> | null = null;

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  activeView: "TERMINAL",
  setActiveView: (activeView) => set({ activeView }),

  cachedToken: null,
  vaultHydrated: false,
  keyPromptOpen: false,

  ensureHydrated: () => {
    if (get().vaultHydrated) return Promise.resolve();
    hydration ??= hydrateVault()
      .then((token) => set({ cachedToken: token, vaultHydrated: true }))
      .catch(() => set({ vaultHydrated: true }));
    return hydration;
  },

  requestAdminKey: async () => {
    await get().ensureHydrated();
    const cached = get().cachedToken;
    if (cached) return cached;
    return new Promise<string | null>((resolve) => {
      keyResolver = resolve;
      set({ keyPromptOpen: true });
    });
  },

  submitAdminKey: (key, remember) => {
    const trimmed = key.trim();
    if (trimmed) {
      set({ cachedToken: trimmed });
      if (remember) {
        void sealToken(trimmed).catch(() => {
          /* seal failure → session continues memory-only */
        });
      }
    }
    keyResolver?.(trimmed || null);
    keyResolver = null;
    set({ keyPromptOpen: false });
  },

  cancelAdminKey: () => {
    keyResolver?.(null);
    keyResolver = null;
    set({ keyPromptOpen: false });
  },

  clearAdminKey: () => {
    set({ cachedToken: null });
    void clearVault();
  },
}));
