"use client";

// The data layer for every screen: the query cache, saved to IndexedDB for the person it belongs to, and the tRPC
// client. Screens wait until the page has opened (page-data.ts), so nothing shows before it is known whose data may
// show; once the page starts leaving nothing renders, so no screen shows data in the middle of a wipe.
import { IsRestoringProvider, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { createPageData } from "./page-data";
import { TRPCProvider } from "./trpc";

/** Changes with every build, so a cache saved by an older version of the app is thrown away, not misread. */
const cacheVersion = process.env.NEXT_PUBLIC_CACHE_VERSION ?? "development";

export function DataProviders({ children }: { children: ReactNode }) {
  const [leaving, setLeaving] = useState(false);
  const [page] = useState(() =>
    createPageData({
      buster: cacheVersion,
      onLeaving: () => {
        setLeaving(true);
      },
    }),
  );
  const [opening, setOpening] = useState(true);

  // Listening starts first, so the me.get answer that opening asks for is seen.
  useEffect(() => page.listen(), [page]);
  useEffect(() => {
    let mounted = true;
    void page.open().then((ready) => {
      if (mounted && ready) setOpening(false);
    });
    return () => {
      mounted = false;
    };
  }, [page]);
  useEffect(() => {
    if (!opening) page.startSaving();
  }, [page, opening]);

  return (
    <QueryClientProvider client={page.queryClient}>
      {/* While restoring, TanStack's own flag, queries wait instead of fetching. */}
      <IsRestoringProvider value={opening}>
        <TRPCProvider trpcClient={page.apiClient} queryClient={page.queryClient}>
          {leaving ? null : children}
        </TRPCProvider>
      </IsRestoringProvider>
    </QueryClientProvider>
  );
}
