// Leaving a session: the api ends it, and every copy of the organization's data on this device goes with it, the
// query cache in memory and in IndexedDB, in this tab and in every other tab of the app (spec 11).
import type { QueryClient } from "@tanstack/react-query";
import type { AuthClient } from "./auth-client";
import { deletePersistedQueries } from "./persistence";

const CHANNEL = "travel-crm-session";

interface SignOutMessage {
  type: "signed-out";
}

/** Other versions of the app may share the channel, so messages are checked, not trusted. */
function isSignOutMessage(data: unknown): data is SignOutMessage {
  return data !== null && typeof data === "object" && (data as { type?: unknown }).type === "signed-out";
}

/** Empties the cache, then removes its saved copy, so no in-flight query can write it back. */
export async function wipeLocalData(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries();
  queryClient.clear();
  await deletePersistedQueries();
}

function channel(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
}

/** Tells the app's other tabs that this device signed out. */
export function announceSignOut(): void {
  const sender = channel();
  sender?.postMessage({ type: "signed-out" } satisfies SignOutMessage);
  sender?.close();
}

/** Calls onSignedOutElsewhere when another tab signs out. Returns the unsubscribe function. */
export function listenForSignOut(onSignedOutElsewhere: () => void): () => void {
  const receiver = channel();
  if (!receiver) return () => undefined;
  receiver.onmessage = (event: MessageEvent<unknown>) => {
    if (isSignOutMessage(event.data)) onSignedOutElsewhere();
  };
  return () => {
    receiver.close();
  };
}

/**
 * Signs out: the api ends the session, then local data is wiped and other tabs are told, whether or not the api
 * answered (offline, the cookie stays until the session expires, but nothing readable is left on the device).
 */
export async function signOut(queryClient: QueryClient, auth: AuthClient): Promise<void> {
  try {
    await auth.signOut();
  } finally {
    await wipeLocalData(queryClient);
    announceSignOut();
  }
}
