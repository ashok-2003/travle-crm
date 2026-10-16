"use client";

// The data layer for every screen: the query cache, saved to IndexedDB for the person it belongs to, and the tRPC
// client. Screens wait until the page has opened (page-data.ts), so nothing shows before it is known whose data may
// show; once the page starts leaving no screen renders, so none shows data in the middle of a wipe. A leave that takes
// a while (signing out waits up to 3s for push) says it is signing out.
import { IsRestoringProvider, QueryClientProvider } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Delayed } from "@/components/delayed";
import { Spinner } from "@/components/ui/spinner";
import { createPageData, type PageData } from "./page-data";
import { TRPCProvider } from "./trpc";

/** Changes with every build, so a cache saved by an older version of the app is thrown away, not misread. */
const cacheVersion = process.env.NEXT_PUBLIC_CACHE_VERSION ?? "development";

const PageDataContext = createContext<PageData | null>(null);

/** This page's data layer, for what must go through it: signing out (shell/sign-out.tsx). */
export function usePageData(): PageData {
  const page = useContext(PageDataContext);
  if (!page) throw new Error("usePageData() is for components inside DataProviders");
  return page;
}

/** In place of every screen while the page leaves: no one's data, only that the next page is on its way. */
function Leaving() {
  const t = useTranslations("common");
  return (
    <Delayed>
      <p role="status" className="flex min-h-dvh items-center justify-center gap-2 text-muted-foreground">
        <Spinner />
        {t("signingOut")}
      </p>
    </Delayed>
  );
}

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
    <PageDataContext value={page}>
      <QueryClientProvider client={page.queryClient}>
        {/* While restoring, TanStack's own flag, queries wait instead of fetching. */}
        <IsRestoringProvider value={opening}>
          <TRPCProvider trpcClient={page.apiClient} queryClient={page.queryClient}>
            {leaving ? <Leaving /> : children}
          </TRPCProvider>
        </IsRestoringProvider>
      </QueryClientProvider>
    </PageDataContext>
  );
}
