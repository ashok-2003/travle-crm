// When to offer turning push on (the owner, 2026-11-17): on a device whose push is off, right after every sign-in
// (which drops this browser's subscription, account/finish-sign-in.ts) and then at most once a day by the device's own
// day. What it keeps is two values in this browser's localStorage, no personal data: that a sign-in just happened, and
// the day the offer was last shown. Storage can be blocked: then nothing is kept, and the offer is made each time.
import type { PushState } from "./push-device";

const SIGNED_IN_KEY = "travel-crm.push-offer.signed-in";
const DAY_KEY = "travel-crm.push-offer.day";

/** The device's calendar day as yyyy-mm-dd: "once a day" is the person's day, not UTC's. */
export function localDay(now: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Pure: offer on a device whose push is off, after a sign-in or when it wasn't offered today. */
export function shouldOfferPush(input: {
  state: PushState;
  justSignedIn: boolean;
  offeredOn: string | null;
  today: string;
}): boolean {
  return input.state === "off" && (input.justSignedIn || input.offeredOn !== input.today);
}

/** Called by every sign-in, after the wipe. */
export function markSignedIn(): void {
  try {
    window.localStorage.setItem(SIGNED_IN_KEY, "1");
  } catch {
    // Blocked or full: the next offer then follows the day's rule alone.
  }
}

/** Whether a sign-in just happened; reading it forgets it, so one sign-in is one offer. */
export function consumeSignedIn(): boolean {
  try {
    const signedIn = window.localStorage.getItem(SIGNED_IN_KEY) !== null;
    window.localStorage.removeItem(SIGNED_IN_KEY);
    return signedIn;
  } catch {
    return false;
  }
}

export function wasOfferedOn(): string | null {
  try {
    return window.localStorage.getItem(DAY_KEY);
  } catch {
    return null;
  }
}

export function markOffered(day: string): void {
  try {
    window.localStorage.setItem(DAY_KEY, day);
  } catch {
    // Blocked or full: it is offered again next time the app opens.
  }
}
