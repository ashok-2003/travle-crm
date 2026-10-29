// The call a person just started from this device, kept in the tab (never in an address: it names the customer) so that
// when they come back to the app, "How did the call go?" opens (release 5, scope 3.4). Forgotten after 30 minutes, once
// shown, and with the rest of the tab's data at sign-out (lib/tab-storage.ts).
import { keepTabValue, readTabValue } from "@/lib/tab-storage";

const KEY = "pending-call";
/** How long after tapping Call the question still follows the person back. */
export const PENDING_CALL_MINUTES = 30;

export interface PendingCall {
  leadId: string;
  name: string;
}

/** Remembers that a call to this lead was just started. */
export function rememberDial(call: PendingCall, now = Date.now()): void {
  keepTabValue(KEY, JSON.stringify({ ...call, at: now }));
}

/** The call that was started and not yet written up, if it was started recently; asking for it forgets it. */
export function takePendingCall(now = Date.now()): PendingCall | null {
  const stored = readTabValue(KEY);
  if (stored === null) return null;
  keepTabValue(KEY, "");
  try {
    const call: unknown = JSON.parse(stored);
    if (typeof call !== "object" || call === null) return null;
    const { leadId, name, at } = call as Record<string, unknown>;
    if (typeof leadId !== "string" || typeof name !== "string" || typeof at !== "number") return null;
    return now - at <= PENDING_CALL_MINUTES * 60_000 ? { leadId, name } : null;
  } catch {
    return null;
  }
}
