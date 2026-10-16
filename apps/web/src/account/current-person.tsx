"use client";

// For the screens outside the app shell that still need a signed-in person (changing a password, setting up
// two-factor): who they are, from me.get, and where they go once a step is done, by what the api still asks of them,
// then back to the ?next= page they were sent from (the console sends platform staff with one).
import type { MeOutput, PendingStep } from "@travel-crm/contracts/identity";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, type ReactNode } from "react";
import { ErrorState } from "@/components/error-state";
import { useTRPC } from "@/data/trpc";
import { isConsolePath, pendingStepRoute, routes } from "@/lib/routes";
import { isPlatformStaff } from "@/session/me-context";
import { AccountSkeleton } from "./account-skeleton";
import { nextPath } from "./next-path";

/**
 * Renders its children with me.get's answer. Until then a skeleton; if it failed with nothing to show (offline, or
 * a server fault after the retries), what failed and Try again (DESIGN.md section 6), never an endless skeleton.
 */
export function CurrentPersonGate({ children }: { children: (me: MeOutput) => ReactNode }) {
  const t = useTranslations("account.steps");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  const me = useQuery(trpc.me.get.queryOptions());
  if (me.data !== undefined) return children(me.data);
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
  return <AccountSkeleton />;
}

/**
 * The page this step was opened to come back to: the ?next= page, by nextPath's rules, or null when none was given.
 * A step opened with one is the app's (or the console's) to insist on, so it offers no way around.
 */
export function useReturnPath(): string | null {
  const searchParams = useSearchParams();
  return searchParams.has("next") ? nextPath(searchParams) : null;
}

/**
 * Whether the api insists on the step, by me.get rather than by the address, so a typed ?next= claims nothing. A
 * member's is the step me.get names. Platform staff's are the console api's, which me.get doesn't name: their
 * two-factor is due while it is off, and their password when the console sent them here to replace it.
 */
export function isStepDue(me: MeOutput, step: PendingStep, returnPath: string | null): boolean {
  if (!isPlatformStaff(me)) return me.pendingStep === step;
  if (step === "SET_UP_TWO_FACTOR") return !me.user.twoFactorEnabled;
  return returnPath !== null && isConsolePath(returnPath);
}

/** Asks me.get again, then opens the next pending step or, with none left, the ?next= page, else the home screen. */
export function useContinueAfterStep(): () => Promise<void> {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const returnPath = useReturnPath();
  return useCallback(async () => {
    const me = await queryClient.query({ ...trpc.me.get.queryOptions(), staleTime: 0 });
    if (me.pendingStep) router.replace(pendingStepRoute(me.pendingStep, returnPath ?? undefined));
    else router.replace(returnPath ?? routes.home);
  }, [trpc, queryClient, router, returnPath]);
}
