// Signing out's and signing in's part in push (data/session.ts, account/finish-sign-in.ts): this browser's subscription
// goes, so a shared phone gets no more of the last person's pushes. Signing out also tells the api, while the session
// can still say whose it is; signing in only unsubscribes the browser, which needs no network. Best effort and
// time-limited, so the next page never waits long; each rejects only when the browser itself fails.
import { pushApi, type PushApi } from "./push-api";
import { turnPushOff, unsubscribeThisBrowser } from "./push-device";

/** How long signing out or in waits for the api and the push service. */
export const FORGET_PUSH_TIME_LIMIT_MS = 3_000;

async function withinTimeLimit(work: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeUp = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, FORGET_PUSH_TIME_LIMIT_MS);
  });
  try {
    await Promise.race([work, timeUp]);
  } finally {
    clearTimeout(timer);
  }
}

export const forgetThisDevicesPush = (api: PushApi = pushApi()): Promise<void> => withinTimeLimit(turnPushOff(api));

export const forgetThisBrowsersPush = (): Promise<void> => withinTimeLimit(unsubscribeThisBrowser());
