"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useEffect, useState, type ReactNode } from "react";
import { useTerminalStore } from "./store";

/**
 * Server-state root + toast layer + eager vault hydration.
 * Hydrating on mount means remembered devices unlock the Red Folder
 * schedule (and skip the key prompt) immediately, not on first action.
 */
export function QuantProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            refetchOnWindowFocus: true,
            staleTime: 2_000,
          },
        },
      }),
  );

  useEffect(() => {
    void useTerminalStore.getState().ensureHydrated();
  }, []);

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        position="top-right"
        offset={{ top: 52 }} // clear the 44px status bar
        gap={8}
        toastOptions={{
          style: {
            background: "var(--qt-surface-2)",
            border: "1px solid var(--qt-border-strong)",
            color: "var(--qt-text)",
            fontFamily: "var(--qt-font-data)",
            fontSize: "12px",
            borderRadius: "10px",
          },
          classNames: {
            success: "qt-toast-success",
            error: "qt-toast-error",
          },
        }}
      />
    </QueryClientProvider>
  );
}
