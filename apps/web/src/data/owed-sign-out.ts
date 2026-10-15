// A sign-out the api hasn't confirmed. It is owed from before the call goes out, because the page leaves without
// waiting for it: offline, or if the call never lands, the previous person's session cookie could open their
// organization again. So the next page settles it before anything asks the api who is signed in (page-data.ts), and
// so does coming back online. The marker in localStorage holds no data, only that a sign-out is owed.
import type { AuthClient } from "./auth-client";

const KEY = "travel-crm.sign-out-owed";

/** Records that a sign-out is owed, before asking the api for it. */
export function oweSignOut(): void {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Blocked storage: nothing can be remembered. The device is still wiped.
  }
}

export function isSignOutOwed(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Asks the api to end the session, within signOut's time limit. Returns whether that is settled: the api answered,
 * other than with a fault or "too many requests", which a later try may get past. Until then the sign-out is owed.
 */
export async function endSession(auth: Pick<AuthClient, "signOut">): Promise<boolean> {
  const result = await auth.signOut();
  const settled = result.ok || (result.status >= 400 && result.status < 500 && result.status !== 429);
  try {
    if (settled) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, "1");
  } catch {
    // Blocked storage: nothing can be remembered. The device was still wiped.
  }
  return settled;
}
