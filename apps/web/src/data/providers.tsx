"use client";

// The data layer for every screen: the query cache, saved to IndexedDB, and the tRPC client. A refusal that means
// "sign in again" or "do this first" moves the person there; signing out in another tab wipes this one too.
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useEffect, useState, type ReactNode } from "react";
import { isPublicRoute, pendingStepRoute, signInRoute } from "@/lib/routes";
import { createQueryPersister } from "./persistence";
import { createQueryClient, QUERY_CACHE_MAX_AGE } from "./query-client";
import { listenForSignOut, wipeLocalData } from "./session";
import { createApiClient, TRPCProvider } from "./trpc";

/** Changes with every build, so a cache saved by an older version of the app is thrown away, not misread. */
const cacheVersion = process.env.NEXT_PUBLIC_CACHE_VERSION ?? "development";

/** A full page load: it also drops everything the old page held in memory. */
function goTo(path: string): void {
  window.location.assign(path);
}

export function DataProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    const client = createQueryClient({
      onSignedOut: () => {
        if (isPublicRoute(window.location.pathname)) return;
        void wipeLocalData(client).finally(() => {
          goTo(signInRoute(window.location.pathname));
        });
      },
      onPendingStep: (step) => {
        if (window.location.pathname !== pendingStepRoute(step)) goTo(pendingStepRoute(step));
      },
    });
    return client;
  });
  const [persister] = useState(createQueryPersister);
  const [apiClient] = useState(createApiClient);

  useEffect(
    () =>
      listenForSignOut(() => {
        void wipeLocalData(queryClient).finally(() => {
          goTo(signInRoute());
        });
      }),
    [queryClient],
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: QUERY_CACHE_MAX_AGE, buster: cacheVersion }}
      // What was restored shows at once; then every query refreshes in the background, because the saved copy can be
      // older than its timestamps say (it's written at most once a second, so a change just before a reload is lost).
      onSuccess={() => void queryClient.invalidateQueries()}
    >
      <TRPCProvider trpcClient={apiClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </PersistQueryClientProvider>
  );
}
