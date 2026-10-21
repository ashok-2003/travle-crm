// A service account Google told to wait (S37, S8): no request is made for it until the hold ends. Kept in the worker's
// memory, shared by the dispatcher and the checks of that process; a restart forgets a hold for a minute. A hold the
// account keeps earning doubles from 60 seconds to 10 minutes, and a request that works clears it.
const BASE_HOLD_SECONDS = 60;
const MAX_HOLD_SECONDS = 600;

export interface AccountHolds {
  /** Holds the account for Google's Retry-After (60 seconds when absent), doubling while it keeps happening. */
  backOff(accountIndex: number, now: Date, retryAfterSeconds: number | null): Date;
  /** The account asked nothing it could not answer: its streak ends. */
  recovered(accountIndex: number): void;
  isHeld(accountIndex: number, now: Date): boolean;
  /** When the account may be asked again; null when it is not held. */
  heldUntil(accountIndex: number, now: Date): Date | null;
}

export function createAccountHolds(): AccountHolds {
  const until = new Map<number, Date>();
  const streak = new Map<number, number>();
  const heldUntil = (accountIndex: number, now: Date) => {
    const end = until.get(accountIndex);
    return end !== undefined && end > now ? end : null;
  };
  return {
    backOff(accountIndex, now, retryAfterSeconds) {
      const times = streak.get(accountIndex) ?? 0;
      streak.set(accountIndex, times + 1);
      const seconds = Math.min(MAX_HOLD_SECONDS, (retryAfterSeconds ?? BASE_HOLD_SECONDS) * 2 ** times);
      const end = new Date(now.getTime() + seconds * 1000);
      until.set(accountIndex, end);
      return end;
    },
    recovered(accountIndex) {
      streak.delete(accountIndex);
    },
    isHeld: (accountIndex, now) => heldUntil(accountIndex, now) !== null,
    heldUntil,
  };
}
