"use client";

import { create } from "zustand";
import { ADMIN_KEY_STORAGE } from "./constants";
import type { TerminalView } from "./types";

/**
 * Client state only. All server data lives in TanStack Query.
 *
 * AuthVault seam (Phase 2 shim → Phase 6 upgrade):
 * `requestAdminKey()` resolves the stored key immediately, or opens
 * the AdminKeyDialog and resolves with the submitted key (null if
 * cancelled). Phase 6 swaps plaintext localStorage for the
 * WebCrypto-encrypted vault behind this SAME contract — callers
 * will not change.
 */

function readStoredKey(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ADMIN_KEY_STORAGE);
}

interface TerminalStore {
  activeView: TerminalView;
  setActiveView: (v: TerminalView) => void;

  keyPromptOpen: boolean;
  requestAdminKey: () => Promise<string | null>;
  submitAdminKey: (key: string) => void;
  cancelAdminKey: () => void;
  /** Called on 401/403 so a rotated token re-prompts next action */
  clearAdminKey: () => void;
}

let keyResolver: ((key: string | null) => void) | null = null;

export const useTerminalStore = create<TerminalStore>((set) => ({
  activeView: "TERMINAL",
  setActiveView: (activeView) => set({ activeView }),

  keyPromptOpen: false,

  requestAdminKey: () => {
    const stored = readStoredKey();
    if (stored) return Promise.resolve(stored);
    return new Promise<string | null>((resolve) => {
      keyResolver = resolve;
      set({ keyPromptOpen: true });
    });
  },

  submitAdminKey: (key) => {
    const trimmed = key.trim();
    if (typeof window !== "undefined" && trimmed) {
      window.localStorage.setItem(ADMIN_KEY_STORAGE, trimmed);
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
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ADMIN_KEY_STORAGE);
    }
  },
}));

export function getAdminKeySync(): string | null {
  return readStoredKey();
}
