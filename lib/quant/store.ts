"use client";

import { create } from "zustand";
import type { TerminalView } from "./types";

/**
 * Client state only. All server data lives in TanStack Query.
 * The AuthVault slice lands here in Phase 6 — the seam is reserved.
 */
interface TerminalStore {
  activeView: TerminalView;
  setActiveView: (v: TerminalView) => void;
}

export const useTerminalStore = create<TerminalStore>((set) => ({
  activeView: "TERMINAL",
  setActiveView: (activeView) => set({ activeView }),
}));
