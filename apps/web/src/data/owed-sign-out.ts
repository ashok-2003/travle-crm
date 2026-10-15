// A sign-out the api hasn't confirmed. It is owed from before the call goes out, because the page leaves without
// waiting for it: offline, or if the call never lands, the previous person's session cookie could open their
// organization again. So the next page settles it before anything asks the api who is signed in (page-data.ts), and
// so does coming back online. The leaving page's own call usually lands after that page has gone, so the sign-in
// page mostly settles it a second time, harmlessly. A sign-in that succeeds clears what is owed (signedInAgain): the
// old session's cookie is gone, and a sign-out sent now would end the new session. The marker in localStorage holds
// no data, only that a sign-out is owed.

const KEY = "travel-crm.sign-out-owed";

/** What settling needs of the auth client (auth-client.ts), which in turn waits for settling before a sign-in. */
interface SignsOut {
  signOut(): Promise<{ ok: true } | { ok: false; status: number }>;
}

/** This page's settle call while it is under way, so a sign-in can wait for its answer. */
let settling: Promise<boolean> | undefined;

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

function forget(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Blocked storage held no marker either.
  }
}

/**
 * Asks the api to end the session, within signOut's time limit. Returns whether that is settled: the api answered,
 * other than with a fault or "too many requests", which a later try may get past. Settled clears what is owed; not
 * settled leaves the marker as it is, so a sign-in that cleared it while the call was out isn't owed again.
 */
export async function endSession(auth: SignsOut): Promise<boolean> {
  const result = await auth.signOut();
  const settled = result.ok || (result.status >= 400 && result.status < 500 && result.status !== 429);
  if (settled) forget();
  return settled;
}

/** Settles an owed sign-out, if one is owed: true when nothing is owed any more. One call at a time per page. */
export function settleOwedSignOut(auth: SignsOut): Promise<boolean> {
  if (!isSignOutOwed()) return Promise.resolve(true);
  settling ??= endSession(auth).finally(() => {
    settling = undefined;
  });
  return settling;
}

/**
 * Waits until no settle call is under way. A sign-in waits for this first: the old session's answer deletes the
 * session cookie by name, so landing after a new sign-in's answer it would delete the new cookie.
 */
export async function settledBeforeSigningIn(): Promise<void> {
  await settling;
}

/** A sign-in succeeded: nothing is owed any more, and nothing may sign the new session out on the old one's behalf. */
export function signedInAgain(): void {
  forget();
}
