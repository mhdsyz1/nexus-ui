"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

interface QtDialogProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

/** Minimal themed modal — Escape and overlay click close it. */
export function QtDialog({ open, title, subtitle, onClose, children }: QtDialogProps) {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgb(0 0 0 / 0.75)", backdropFilter: "blur(3px)" }}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="qt-card w-full max-w-md p-5 flex flex-col gap-4"
            style={{ background: "var(--qt-surface)", borderColor: "var(--qt-border-strong)" }}
            initial={reduced ? false : { opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex items-start justify-between pb-3" style={{ borderBottom: "1px solid var(--qt-border)" }}>
              <div>
                <h3 className="qt-num text-sm font-bold tracking-wide" style={{ color: "var(--qt-accent)" }}>
                  {title}
                </h3>
                {subtitle && (
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--qt-text-muted)" }}>
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="p-1 rounded focus-visible:ring-2 focus-visible:ring-[var(--qt-accent)] outline-none"
                style={{ color: "var(--qt-text-muted)" }}
              >
                <X size={15} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Shared input styling */
export const qtInputClass =
  "w-full p-2.5 rounded-lg text-sm outline-none focus:ring-1 focus:ring-[var(--qt-accent)] qt-num";
export const qtInputStyle = {
  background: "var(--qt-surface-2)",
  border: "1px solid var(--qt-border-strong)",
  color: "var(--qt-text)",
} as const;
