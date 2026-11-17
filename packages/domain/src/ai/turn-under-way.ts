// Whether a chat's AI turn is under way: the worker marked it queued or thinking, a few minutes ago at most. A mark older
// than that is one the worker never cleared (it stopped mid-way), and is no turn: not for the inbox, nor for the scoring
// job that waits on it.

/** After this long a turn still marked is one the worker never finished. */
export const TURN_STALE_MS = 3 * 60_000;

export function turnUnderWay(
  state: { turnState: string | null; turnAt: Date | null } | null,
  now: Date,
): "queued" | "thinking" | null {
  if (state?.turnAt == null || now.getTime() - state.turnAt.getTime() >= TURN_STALE_MS) return null;
  return state.turnState === "queued" || state.turnState === "thinking" ? state.turnState : null;
}
