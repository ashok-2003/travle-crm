// One page's data: the query cache and the tRPC client, how the page opens and how it leaves. Opening settles a
// sign-out the api never heard, then restores the saved copy only if it belongs to whoever me.get says is signed in.
// Leaving stops everything rendering, wipes the device's data, then loads another page: on a 401, on another tab's
// sign-out, on signing out here, and when me.get names someone else than the data the page holds.
import type { AppRouter } from "@travel-crm/api";
import { hashKey, hydrate, onlineManager } from "@tanstack/react-query";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { loadPage, replacePage } from "@/lib/navigate";
import { reportProblem } from "@/lib/report-problem";
import { isPublicRoute, pendingStepRoute, routes, signInRoute } from "@/lib/routes";
import { refusalOf } from "./api-error";
import { authClient, onSessionEnded, type AuthClient } from "./auth-client";
import { settleOwedSignOut } from "./owed-sign-out";
import { isMeAnswer, ownerOf, sameOwner, type CopyOwner } from "./owner";
import { createQueryCopy } from "./persistence";
import { createQueryClient } from "./query-client";
import { listenForSignOut, signOut, wipeLocalData } from "./session";
import { createApiClient } from "./trpc";

/**
 * Whether the device says it is offline: the browser's own flag, or TanStack's onlineManager, which learns only from
 * online and offline events, so on a cold start offline it still believes it is online.
 */
function deviceIsOffline(): boolean {
  return !navigator.onLine || !onlineManager.isOnline();
}

const currentPage = () => `${window.location.pathname}${window.location.search}`;

export interface PageDataOptions {
  /** The build: a copy saved by another build is never read. */
  buster: string;
  /** Called once, as the page starts leaving: from then on nothing may render. */
  onLeaving: () => void;
  auth?: Pick<AuthClient, "signOut">;
}

export function createPageData({ buster, onLeaving, auth = authClient }: PageDataOptions) {
  const apiClient = createApiClient();
  /** Whose data this page holds: set by the first me.get answer, or by a copy restored while it can't be asked. */
  let owner: CopyOwner | null = null;
  let leaving = false;
  let opened: Promise<boolean> | undefined;

  /** Nothing renders from here on; forget runs (by default the wipe), and only then does `to` load. */
  async function leave(to: string, forget: () => Promise<void> = () => wipeLocalData(queryClient)): Promise<void> {
    if (leaving) return;
    leaving = true;
    onLeaving();
    await forget();
    loadPage(to);
  }

  /** The session is gone (a tRPC or a Better Auth 401): wipe, sign in, come back. A signed-out screen stays put. */
  function sessionEnded(): void {
    if (!isPublicRoute(window.location.pathname)) void leave(signInRoute(currentPage()));
  }

  const queryClient = createQueryClient({
    onSignedOut: sessionEnded,
    // In place of this page, so Back doesn't return to a screen that showed data, as SessionGate does.
    onPendingStep: (step) => {
      if (window.location.pathname !== pendingStepRoute(step)) replacePage(pendingStepRoute(step));
    },
  });
  const meQuery = createTRPCOptionsProxy<AppRouter>({ client: apiClient, queryClient }).me.get.queryOptions();
  const meQueryHash = hashKey(meQuery.queryKey);
  const copy = createQueryCopy(queryClient, { owner: () => owner, buster });

  /** me.get answered from the api. The page's data is that person's; data held for anyone else goes at once. */
  function onMeAnswered(me: unknown): void {
    if (!isMeAnswer(me)) return;
    const answer = ownerOf(me);
    if (owner === null) owner = answer;
    else if (!sameOwner(owner, answer)) void leave(routes.home);
  }

  /**
   * Who me.get says is signed in, asked once and waited for however long it takes: "nobody" on a 401 (which also
   * leaves), "offline" when the device says so, before or after asking, and "unknown" when the api failed though the
   * device is online.
   */
  async function whoIsSignedIn(): Promise<CopyOwner | "nobody" | "offline" | "unknown"> {
    if (deviceIsOffline()) return "offline";
    try {
      return ownerOf(await queryClient.query({ ...meQuery, retry: false }));
    } catch (error) {
      if (refusalOf(error)?.status === 401) return "nobody";
      return deviceIsOffline() ? "offline" : "unknown";
    }
  }

  async function restoreSavedCopy(): Promise<void> {
    const saved = await copy.read();
    if (!saved) return;
    const signedIn = await whoIsSignedIn();
    // Online but unanswered: nothing saved shows. The screens ask again, and show the failure with a Retry.
    if (signedIn === "unknown") return;
    // Offline nobody can be asked, so the device shows what it saved for its last person. If me.get later names
    // someone else, the page leaves then.
    const expected = signedIn === "offline" ? (owner ?? saved.owner) : signedIn;
    if (expected === "nobody" || !sameOwner(expected, saved.owner)) {
      await copy.remove();
      return;
    }
    owner ??= saved.owner;
    hydrate(queryClient, saved.clientState);
  }

  async function open(): Promise<boolean> {
    const openedAt = Date.now();
    // On a cold start offline the browser knows, but TanStack hasn't heard an "offline" event and believes it's
    // online: queries would fail instead of waiting, and coming back online would refresh nothing. Tell it.
    if (!navigator.onLine) onlineManager.setOnline(false);
    if (!(await settleOwedSignOut(auth))) {
      // The previous person's session may still be alive, so nothing may ask the api who is signed in: a signed-out
      // screen opens as it is (it asks nothing), any other sends the person to sign in.
      if (isPublicRoute(window.location.pathname)) return true;
      loadPage(routes.signIn);
      return false;
    }
    // A copy that can't be read must not keep the app from opening; it is reported and nothing is restored.
    await restoreSavedCopy().catch(reportProblem);
    // What was restored shows at once and refreshes in the background, because the copy can be older than its
    // timestamps say (it's written at most once a second, so a change just before a reload is lost).
    void queryClient.invalidateQueries({ predicate: (query) => query.state.dataUpdatedAt <= openedAt });
    return true;
  }

  return {
    queryClient,
    apiClient,
    /** Resolves true once screens may load data (false: another page is loading). Runs once however often called. */
    open: (): Promise<boolean> => (opened ??= open()),
    startSaving: () => {
      copy.startSaving();
    },
    /** Signs out: the screen goes at once, and the sign-in page loads once the device is wiped (session.ts). */
    signOut: () => leave(routes.signIn, () => signOut(queryClient, auth)),
    /** Listens for other tabs signing out, me.get's answers, Better Auth 401s and the connection returning. */
    listen(): () => void {
      const stopListening = listenForSignOut(() => {
        // A signed-out screen holds nothing to hide; the person may be typing into it.
        if (isPublicRoute(window.location.pathname)) void wipeLocalData(queryClient);
        else void leave(routes.signIn);
      });
      const stopWatching = queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== "updated" || event.query.queryHash !== meQueryHash) return;
        // A fetch's answer; setQueryData is a "manual" success, and restoring a copy is no success at all.
        if (event.action.type === "success" && event.action.manual !== true) onMeAnswered(event.action.data);
      });
      const settleOnceOnline = () => {
        void settleOwedSignOut(auth);
      };
      window.addEventListener("online", settleOnceOnline);
      const stopHearingAuth = onSessionEnded(sessionEnded);
      return () => {
        stopListening();
        stopWatching();
        stopHearingAuth();
        window.removeEventListener("online", settleOnceOnline);
      };
    },
  };
}

export type PageData = ReturnType<typeof createPageData>;
