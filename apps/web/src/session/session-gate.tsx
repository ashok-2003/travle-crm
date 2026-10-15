"use client";

// The way into the app shell. me.get says who is signed in; until it answers the screen shows a skeleton, from the
// saved cache at once when there is one. Signed out, the data layer sends the person to sign in; with a password
// change or two-factor setup pending, they go to take it; platform staff, who belong to no organization, are told
// this app isn't theirs.
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/data/trpc";
import { pendingStepRoute } from "@/lib/routes";
import { SignOutButton } from "@/shell/sign-out";
import { isSignedInMember, MeProvider } from "./me-context";

export function SessionGate({ children }: { children: ReactNode }) {
  const t = useTranslations("shell.session");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const me = useQuery(trpc.me.get.queryOptions());
  const pendingStep = me.data?.pendingStep ?? null;

  useEffect(() => {
    if (pendingStep) window.location.replace(pendingStepRoute(pendingStep));
  }, [pendingStep]);

  if (me.data === undefined) {
    if (me.isError) {
      return (
        <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void me.refetch()} />
      );
    }
    return (
      <Delayed>
        <div role="status" aria-busy="true" aria-label={t("loading")} className="flex min-h-dvh">
          <Skeleton className="hidden w-58 md:block" />
          <div className="flex flex-1 flex-col gap-4 p-6">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-40 w-full max-w-[720px]" />
          </div>
        </div>
      </Delayed>
    );
  }
  if (pendingStep) return null;
  if (!isSignedInMember(me.data)) {
    return (
      <div className="mx-auto flex max-w-[40ch] flex-col items-center gap-4 px-4 py-16 text-center">
        <p>{t("notStaff")}</p>
        <SignOutButton />
      </div>
    );
  }
  return <MeProvider me={me.data}>{children}</MeProvider>;
}
