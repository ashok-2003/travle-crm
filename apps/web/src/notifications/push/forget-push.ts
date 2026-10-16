// Signing out's part in push (data/session.ts): this browser's subscription goes, from the api while the session can
// still say whose it is and from its push service, so a shared phone gets no more of this person's pushes. Best
// effort and time-limited, so the sign-in page never waits long for it; it rejects only when the browser itself
// fails, which signing out reports.
import { pushApi, type PushApi } from "./push-api";
import { turnPushOff } from "./push-device";

/** How long signing out waits for the api and the push service. */
export const FORGET_PUSH_TIME_LIMIT_MS = 3_000;

export async function forgetThisDevicesPush(api: PushApi = pushApi()): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeUp = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, FORGET_PUSH_TIME_LIMIT_MS);
  });
  try {
    await Promise.race([turnPushOff(api), timeUp]);
  } finally {
    clearTimeout(timer);
  }
}
