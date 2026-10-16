"use client";

// The way into the console. whoAmI says who is signed in; until it answers the screen shows a skeleton. Anyone who
// isn't platform staff (an agency's member, support while impersonating) is told the console isn't theirs, with the
// way out: Stop for support, which gives support's own session back, and Sign out for anyone else. A 401 or a pending
// step is the data layer's to act on (console-providers.tsx), so nothing shows meanwhile; any other failure says so
// with a Retry.
import { useQuery } from "@tanstack/react-query";
import { ShieldUserIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Delayed } from "@/components/delayed";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { refusalOf } from "@/data/api-error";
import { usePageData } from "@/data/providers";
import { refusalDestination } from "@/data/query-client";
import { useTRPC } from "@/data/trpc";
import { StopImpersonatingButton } from "@/shell/stop-impersonating";
import { useConsoleTRPC } from "../data/console-trpc";
import { ConsoleSignOutButton } from "../shell/console-sign-out";
import { StaffProvider } from "./staff-context";

/**
 * The console isn't theirs. Signing out would end support's impersonation and strand support's own session. me.get
 * is the app's call, in the app's cache: its 401 signs out as the app does, and Stop wipes what the app holds.
 */
function NotStaff() {
  const t = useTranslations("console.gate");
  const { queryClient } = usePageData();
  const me = useQuery(useTRPC().me.get.queryOptions(), queryClient);
  const impersonating = Boolean(me.data?.impersonatedBy);
  let action;
  if (impersonating) action = <StopImpersonatingButton queryClient={queryClient} />;
  else if (!me.isPending) action = <ConsoleSignOutButton />;
  return (
    <EmptyState icon={ShieldUserIcon} message={impersonating ? t("impersonating") : t("notStaff")} action={action} />
  );
}

export function ConsoleGate({ children }: { children: ReactNode }) {
  const t = useTranslations("console.gate");
  const tCommon = useTranslations("common");
  const trpc = useConsoleTRPC();
  const whoAmI = useQuery(trpc.whoAmI.queryOptions());

  if (whoAmI.data) return <StaffProvider staff={whoAmI.data}>{children}</StaffProvider>;
  if (whoAmI.isError) {
    if (refusalDestination(whoAmI.error)) return null;
    if (refusalOf(whoAmI.error)?.reason === "PLATFORM_ONLY") return <NotStaff />;
    return (
      <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void whoAmI.refetch()} />
    );
  }
  return (
    <Delayed>
      <div role="status" aria-busy="true" aria-label={t("loading")} className="flex min-h-dvh">
        <Skeleton className="hidden w-58 md:block" />
        <div className="flex flex-1 flex-col gap-4 p-6">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-40 w-full max-w-[1200px]" />
        </div>
      </div>
    </Delayed>
  );
}
