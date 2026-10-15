// One page's data: the query cache and the tRPC client, how the page opens and how it leaves. Opening settles a
// sign-out the api never heard, then restores the saved copy only if it belongs to whoever me.get says is signed in.
// Leaving stops everything rendering, wipes the device's data, then loads another page. A page whose me.get later
// names someone else than the data it holds leaves too.
import type { AppRouter } from "@travel-crm/api";
import { hashKey, hydrate, onlineManager } from "@tanstack/react-query";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { loadPage } from "@/lib/navigate";
import { reportProblem } from "@/lib/report-problem";
import { isPublicRoute, pendingStepRoute, routes, signInRoute } from "@/lib/routes";
import { refusalOf } from "./api-error";
import { authClient, type AuthClient } from "./auth-client";
import { endSession, isSignOutOwed } from "./owed-sign-out";
import { isMeAnswer, ownerOf, sameOwner, type CopyOwner } from "./owner";
import { createQueryCopy } from "./persistence";
import { createQueryClient } from "./query-client";
import { listenForSignOut, wipeLocalData } from "./session";
import { createApiClient } from "./trpc";

/** How long opening waits for me.get to say whose a saved copy may be. After that it shows, as it would offline. */
export const OWNER_CHECK_TIMEOUT = 3_000;

/** promise's value, or undefined if it takes longer than ms. */
async function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: number | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = window.setTimeout(resolve, ms);
  });
  try {
    return await Promise.race([promise, late]);
  } finally {
    window.clearTimeout(timer);
  }
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

  async function leave(to: string): Promise<void> {
    if (leaving) return;
    leaving = true;
    onLeaving();
    await wipeLocalData(queryClient);
    loadPage(to);
  }

  const queryClient = createQueryClient({
    onSignedOut: () => {
      if (!isPublicRoute(window.location.pathname)) void leave(signInRoute(currentPage()));
    },
    onPendingStep: (step) => {
      if (window.location.pathname !== pendingStepRoute(step)) loadPage(pendingStepRoute(step));
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

  /** Who me.get says is signed in: "nobody" on a 401, "unknown" offline, slow or failing. A 401 also leaves. */
  async function whoIsSignedIn(): Promise<CopyOwner | "nobody" | "unknown"> {
    if (!onlineManager.isOnline()) return "unknown";
    try {
      const me = await within(queryClient.query(meQuery), OWNER_CHECK_TIMEOUT);
      return me === undefined ? "unknown" : ownerOf(me);
    } catch (error) {
      return refusalOf(error)?.status === 401 ? "nobody" : "unknown";
    }
  }

  async function restoreSavedCopy(): Promise<void> {
    const saved = await copy.read();
    if (!saved) return;
    const signedIn = await whoIsSignedIn();
    // Unknown: show what this device saved, as offline. If me.get later names someone else, the page leaves then.
    const expected = signedIn === "unknown" ? (owner ?? saved.owner) : signedIn;
    if (expected === "nobody" || !sameOwner(expected, saved.owner)) {
      await copy.remove();
      return;
    }
    owner ??= saved.owner;
    hydrate(queryClient, saved.clientState);
  }

  async function open(): Promise<boolean> {
    const openedAt = Date.now();
    if (isSignOutOwed() && !(await endSession(auth))) {
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
    /** Listens for other tabs signing out, me.get's answers and the connection returning. Returns the unsubscribe. */
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
      const settleOwedSignOut = () => {
        if (isSignOutOwed()) void endSession(auth);
      };
      window.addEventListener("online", settleOwedSignOut);
      return () => {
        stopListening();
        stopWatching();
        window.removeEventListener("online", settleOwedSignOut);
      };
    },
  };
}

export type PageData = ReturnType<typeof createPageData>;
