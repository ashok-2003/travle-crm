// Leaving a session, and forgetting what it left on this device: the query cache in memory and its saved copy, and
// the pages the service worker kept, in this tab and in every other tab of the app (spec 11).
import type { QueryClient } from "@tanstack/react-query";
import { reportProblem } from "@/lib/report-problem";
import type { AuthClient } from "./auth-client";
import { endSession } from "./owed-sign-out";
import { deleteSavedCopies, stopSaving } from "./persistence";

const CHANNEL = "travel-crm-session";
/** The service worker's copies of pages (src/service-worker/strategy.ts): "pages-v1", and any later version. */
const PAGE_CACHE_PREFIX = "pages-";
/** Marks this page's messages: BroadcastChannel also delivers them to the other channel objects in this tab. */
const THIS_PAGE = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

interface SignOutMessage {
  type: "signed-out";
  from: string;
}

/** Other versions of the app may share the channel, so messages are checked, not trusted. */
function isSignOutMessage(data: unknown): data is SignOutMessage {
  return data !== null && typeof data === "object" && (data as { type?: unknown }).type === "signed-out";
}

async function deletePageCaches(): Promise<void> {
  // Cache Storage exists only on secure origins (and not in jsdom).
  if (typeof caches === "undefined") return;
  const names = (await caches.keys()).filter((name) => name.startsWith(PAGE_CACHE_PREFIX));
  await Promise.all(names.map((name) => caches.delete(name)));
}

/** Runs each step once the one before has finished, failed or not. Returns the failures. */
async function inOrder(steps: (() => unknown)[]): Promise<unknown[]> {
  const failures: unknown[] = [];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      failures.push(error);
    }
  }
  return failures;
}

/**
 * Forgets what this device holds of the organization, each step finished before the next starts: saving stops (so
 * no save can land afterwards), the query and mutation caches empty, the saved copy goes, then the service worker's
 * pages. It never rejects, because every caller loads another page next either way: a step that fails is reported
 * once, and the steps after it still run.
 */
export async function wipeLocalData(queryClient: QueryClient): Promise<void> {
  const failures = await inOrder([
    () => stopSaving(queryClient),
    async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
    },
    deleteSavedCopies,
    deletePageCaches,
  ]);
  if (failures.length > 0) reportProblem(failures[0]);
}

function channel(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
}

/** Tells the app's other tabs that this device signed out. */
export function announceSignOut(): void {
  const sender = channel();
  sender?.postMessage({ type: "signed-out", from: THIS_PAGE } satisfies SignOutMessage);
  sender?.close();
}

/** Calls onSignedOutElsewhere when another tab signs out. Returns the unsubscribe function. */
export function listenForSignOut(onSignedOutElsewhere: () => void): () => void {
  const receiver = channel();
  if (!receiver) return () => undefined;
  receiver.onmessage = (event: MessageEvent<unknown>) => {
    if (isSignOutMessage(event.data) && event.data.from !== THIS_PAGE) onSignedOutElsewhere();
  };
  return () => {
    receiver.close();
  };
}

/**
 * Signs out in the order that leaves least behind: this device forgets the organization's data, the other tabs are
 * told, and only then is the api asked to end the session, for at most 5 seconds (auth-client.ts). If it can't be
 * reached, the sign-out is owed and the next page settles it first (owed-sign-out.ts). It never rejects; the caller
 * opens the sign-in page next.
 */
export async function signOut(queryClient: QueryClient, auth: Pick<AuthClient, "signOut">): Promise<void> {
  await wipeLocalData(queryClient);
  try {
    announceSignOut();
  } catch (error) {
    reportProblem(error);
  }
  await endSession(auth);
}
