"use client";

// The way into the app shell. me.get says who is signed in; until it answers the screen shows a skeleton (a saved
// copy is restored first when it is that person's: data/page-data.ts). Signed out, the data layer sends the person
// to sign in; with a password change or two-factor setup pending, they go to take it, except support signed in as
// them, who can't, and is told so with the banner's way to stop; platform staff, who belong to no organization, go to
// the console; anyone else in no organization is told this app isn't theirs.
import { useQuery } from "@tanstack/react-query";
import { BuildingIcon, UserLockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { Delayed } from "@/components/delayed";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ServerWaking } from "@/components/server-waking";
import { Skeleton } from "@/components/ui/skeleton";
import { isServerWaking, wakingRetry } from "@/data/server-waking";
import { useTRPC } from "@/data/trpc";
import { replacePage } from "@/lib/navigate";
import { pendingStepRoute, routes } from "@/lib/routes";
import { SignOutButton } from "@/shell/sign-out";
import { StopImpersonatingButton } from "@/shell/stop-impersonating";
import { isPlatformStaff, isSignedInMember, MeProvider } from "./me-context";

export function SessionGate({ children }: { children: ReactNode }) {
  const t = useTranslations("shell.session");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  // A sleeping api is waited for, saying so, before the gate says the organization didn't load.
  const me = useQuery(trpc.me.get.queryOptions(undefined, wakingRetry));
  const pendingStep = me.data?.pendingStep ?? null;
  // Only the member can take their step: support signed in as them is shown it instead.
  const stepToTake = me.data?.impersonatedBy ? null : pendingStep;
  const platformStaff = me.data !== undefined && isPlatformStaff(me.data);

  useEffect(() => {
    if (stepToTake) replacePage(pendingStepRoute(stepToTake));
    else if (platformStaff) replacePage(routes.console);
  }, [stepToTake, platformStaff]);

  if (me.data === undefined) {
    if (me.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={me.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void me.refetch()}
        />
      );
    }
    if (me.failureCount > 0 && isServerWaking(me.failureReason)) return <ServerWaking standalone />;
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
  if (stepToTake || platformStaff) return null;
  if (pendingStep) {
    return (
      <EmptyState
        icon={UserLockIcon}
        message={t(`impersonatedStep.${pendingStep}`, { name: me.data.user.name })}
        action={<StopImpersonatingButton />}
        standalone
      />
    );
  }
  if (!isSignedInMember(me.data)) {
    return <EmptyState icon={BuildingIcon} message={t("notStaff")} action={<SignOutButton />} standalone />;
  }
  return <MeProvider me={me.data}>{children}</MeProvider>;
}
