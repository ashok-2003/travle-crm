"use client";

// The way into the console. whoAmI says who is signed in; until it answers the screen shows a skeleton. Anyone who
// isn't platform staff (an agency's member, support while impersonating) is told the console isn't theirs. A 401 or
// a pending step is the data layer's to act on (console-providers.tsx), so nothing shows meanwhile; any other failure
// says so with a Retry.
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { refusalOf } from "@/data/api-error";
import { useConsoleTRPC } from "../data/console-trpc";
import { ConsoleSignOutButton } from "../shell/console-sign-out";
import { StaffProvider } from "./staff-context";

/** Refusals the data layer answers by loading another page. */
const LEAVING = new Set(["CHANGE_PASSWORD", "SET_UP_TWO_FACTOR"]);

export function ConsoleGate({ children }: { children: ReactNode }) {
  const t = useTranslations("console.gate");
  const tCommon = useTranslations("common");
  const trpc = useConsoleTRPC();
  const whoAmI = useQuery(trpc.whoAmI.queryOptions());

  if (whoAmI.data) return <StaffProvider staff={whoAmI.data}>{children}</StaffProvider>;
  if (whoAmI.isError) {
    const refusal = refusalOf(whoAmI.error);
    if (refusal?.status === 401 || LEAVING.has(refusal?.reason ?? "")) return null;
    if (refusal?.reason === "PLATFORM_ONLY") {
      return (
        <div className="mx-auto flex max-w-[40ch] flex-col items-center gap-4 px-4 py-16 text-center">
          <p>{t("notStaff")}</p>
          <ConsoleSignOutButton />
        </div>
      );
    }
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
