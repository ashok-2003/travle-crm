"use client";

// The console's data layer, inside the app's (data/providers.tsx, which settles an owed sign-out before anything
// asks who is signed in): a query cache of its own, in memory only and never saved to IndexedDB, since the console
// sees every organization, and the console's tRPC client. A refused call takes platform staff where the console's
// api says, coming back to this page afterwards: a 401 to sign in, a pending step to its screen.
import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createQueryClient } from "@/data/query-client";
import { loadPage, replacePage } from "@/lib/navigate";
import { currentPage, pendingStepRoute, signInRoute } from "@/lib/routes";
import { ConsoleTRPCProvider, createConsoleClient } from "./console-trpc";

export function ConsoleProviders({ children }: { children: ReactNode }) {
  const [consoleClient] = useState(createConsoleClient);
  const [queryClient] = useState(() => {
    const client = createQueryClient({
      // A full page load, which also drops this cache from memory.
      onSignedOut: () => {
        client.clear();
        loadPage(signInRoute(currentPage()));
      },
      // In place of this page, as the app does, so Back doesn't return to a screen that couldn't load.
      onPendingStep: (step) => {
        replacePage(pendingStepRoute(step, currentPage()));
      },
    });
    return client;
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ConsoleTRPCProvider trpcClient={consoleClient} queryClient={queryClient}>
        {children}
      </ConsoleTRPCProvider>
    </QueryClientProvider>
  );
}
