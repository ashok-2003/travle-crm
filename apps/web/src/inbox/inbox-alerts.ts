// The Inbox's sound and desktop alerts (inbox revamp spec, part 1 item 5), all in the browser: nothing is sent to the
// server for them. Both are off until the member turns them on (alerts-menu.tsx), and kept in this browser's localStorage.
// An alert is for a customer's new message in a chat of the member's own, or an unassigned one for whoever takes those,
// when that chat isn't the one in front of them; two tabs of the Inbox alert once. The sound is made with the Web Audio
// API, no file.
import type { ConversationHeader } from "@travel-crm/contracts/inbox";
import { holds, type SignedInMember } from "@/session/me-context";

export type AlertKind = "sound" | "desktop";

const SETTING_KEYS: Record<AlertKind, string> = {
  sound: "travel-crm.inbox.alerts.sound",
  desktop: "travel-crm.inbox.alerts.desktop",
};
/** The last alert any tab gave, as "<chat id>@<time>", so another tab gives none for the same message. */
const LAST_ALERT_KEY = "travel-crm.inbox.alerts.last";
const SAME_ALERT_MS = 3_000;

export function alertIsOn(kind: AlertKind): boolean {
  try {
    return window.localStorage.getItem(SETTING_KEYS[kind]) === "on";
  } catch {
    return false;
  }
}

export function keepAlert(kind: AlertKind, on: boolean): void {
  try {
    if (on) window.localStorage.setItem(SETTING_KEYS[kind], "on");
    else window.localStorage.removeItem(SETTING_KEYS[kind]);
  } catch {
    // Blocked storage: the switch lasts while the page is open.
  }
}

/** Whether this tab gives the alert for a message in this chat now: no other tab gave one for it a moment ago. */
export function claimAlert(conversationId: string, now: number = Date.now()): boolean {
  try {
    const [chat, at] = (window.localStorage.getItem(LAST_ALERT_KEY) ?? "").split("@");
    if (chat === conversationId && now - Number(at) < SAME_ALERT_MS) return false;
    window.localStorage.setItem(LAST_ALERT_KEY, `${conversationId}@${String(now)}`);
  } catch {
    // Blocked storage: each tab alerts for itself.
  }
  return true;
}

/**
 * Whether the member takes unassigned chats: they assign leads, or their inbox scope covers chats nobody owns, as the
 * list's Unassigned filter decides (every chat, or every lead's).
 */
export function takesUnassigned(me: SignedInMember): boolean {
  if (me.member.role.isOwner || holds(me, "leads:assign")) return true;
  const scopeOf = (permission: string) => me.member.permissions.find((grant) => grant.permission === permission)?.scope;
  return scopeOf("inbox:view") === "all" || scopeOf("leads:view") === "all";
}

/** Whether a customer's message in this chat is the member's to hear of: their lead's, or unassigned and theirs to take. */
export function alertsMember(me: SignedInMember, header: Pick<ConversationHeader, "lead">): boolean {
  const owner = header.lead?.ownerUserId ?? null;
  return owner === null ? takesUnassigned(me) : owner === me.user.id;
}

let audio: AudioContext | null = null;

/** The page's one audio context; resuming it inside a click lets later sounds play without one. */
export function readySound(): AudioContext | null {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

/** A soft two-note chime, half a second long. */
export function playChime(): void {
  const context = readySound();
  if (context === null) return;
  const start = context.currentTime;
  [880, 1318.5].forEach((frequency, index) => {
    const tone = context.createOscillator();
    const volume = context.createGain();
    const at = start + index * 0.12;
    tone.type = "sine";
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0.0001, at);
    volume.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    tone.connect(volume).connect(context.destination);
    tone.start(at);
    tone.stop(at + 0.5);
  });
}

/** Whether this browser can show desktop notifications, and what the member let it do. */
export function notificationPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}
