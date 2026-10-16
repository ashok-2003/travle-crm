"use client";

// The last step of every sign-in: forget whatever an earlier session left on this device, then open the app with a
// full page load, so nothing from before survives in memory either. This browser's push subscription goes too,
// whoever it was for: a shared phone must not keep the last person's pushes, and unsubscribing needs no network. A
// sign-out still owed is owed no more: the old session's cookie is gone, and settling it now would sign the new
// session out on its first page.
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { signedInAgain } from "@/data/owed-sign-out";
import { wipeLocalData } from "@/data/session";
import { reportProblem } from "@/lib/report-problem";
import { forgetThisBrowsersPush } from "@/notifications/push/forget-push";

/** Wipes, then opens next. `open` is the browser's full page load; tests pass their own. */
export async function finishSignIn(
  queryClient: QueryClient,
  next: string,
  open: (path: string) => void = (path) => {
    window.location.assign(path);
  },
  forgetPush: () => Promise<void> = forgetThisBrowsersPush,
): Promise<void> {
  signedInAgain();
  const pushForgotten = forgetPush().catch(reportProblem);
  try {
    await wipeLocalData(queryClient);
  } catch {
    // Storage that refuses the wipe (IndexedDB blocked) can't have saved a copy either, and the data layer shows a
    // saved copy only to the person it was saved for. Staying here would leave the person signed in but stuck.
  }
  await pushForgotten;
  open(next);
}

export function useFinishSignIn(): (next: string) => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback((next) => finishSignIn(queryClient, next), [queryClient]);
}
