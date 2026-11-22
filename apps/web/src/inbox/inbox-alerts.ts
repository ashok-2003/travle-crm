// The Inbox's sound and desktop alerts (inbox revamp spec, part 1 item 5), all in the browser: nothing is sent to the
// server for them. Both are off until the member turns them on (alerts-menu.tsx), and kept in this browser's localStorage
// for that member alone (another member signing in on the same computer starts with both off; a sign-out forgets them).
// An alert is for a customer's new message in a chat of the member's own, or an unassigned one for whoever takes those,
// when that chat isn't the one in front of them; two tabs of the Inbox alert once. A chat is unassigned when its person has
// no lead or no lead anyone owns, never because the member can't see its lead. The sound is made with the Web Audio API, no
// file, and only by a tab the browser lets sound (one the member has clicked in, whose audio runs); a desktop notification
// goes through the service worker where one is ready (the only way on Android's Chrome), else the page's own Notification.
import type { ConversationHeader } from "@travel-crm/contracts/inbox";
import { useSyncExternalStore } from "react";
import { inboxRoute } from "@/lib/routes";
import { holds, type SignedInMember } from "@/session/me-context";

export type AlertKind = "sound" | "desktop";

/** Everything the alerts keep in localStorage starts with this, so a sign-out forgets it all. */
const PREFIX = "travel-crm.inbox.alerts.";
/** A switch, for one member: the switches are a person's, not the computer's. */
const settingKey = (userId: string, kind: AlertKind) => `${PREFIX}${userId}.${kind}`;
/** The last alert any tab gave, and the last chime any tab sounded, as "<chat id>@<time>". */
const LAST_ALERT_KEY = `${PREFIX}last`;
const LAST_CHIME_KEY = `${PREFIX}chime`;
const SAME_ALERT_MS = 3_000;

export function alertIsOn(userId: string, kind: AlertKind): boolean {
  try {
    return window.localStorage.getItem(settingKey(userId, kind)) === "on";
  } catch {
    return false;
  }
}

/** Forgets every switch and mark of the alerts on this browser (a sign-out's wipe). */
export function forgetAlerts(): void {
  try {
    const storage = window.localStorage;
    const kept = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
      (key): key is string => key?.startsWith(PREFIX) === true,
    );
    for (const key of kept) storage.removeItem(key);
  } catch {
    // Blocked storage kept nothing.
  }
}

/** Told in this tab when a switch changes (other tabs hear the storage event). */
const ALERTS_CHANGED = "travel-crm:inbox-alerts";

export function keepAlert(userId: string, kind: AlertKind, on: boolean): void {
  try {
    if (on) window.localStorage.setItem(settingKey(userId, kind), "on");
    else window.localStorage.removeItem(settingKey(userId, kind));
  } catch {
    // Blocked storage: the switch lasts while the page is open.
  }
  window.dispatchEvent(new Event(ALERTS_CHANGED));
}

/** Whether an alert would be given at all: the sound on, or desktop notifications on and allowed. */
export function anyAlertOn(userId: string): boolean {
  return alertIsOn(userId, "sound") || (alertIsOn(userId, "desktop") && notificationPermission() === "granted");
}

function watchAlerts(changed: () => void): () => void {
  window.addEventListener(ALERTS_CHANGED, changed);
  window.addEventListener("storage", changed);
  return () => {
    window.removeEventListener(ALERTS_CHANGED, changed);
    window.removeEventListener("storage", changed);
  };
}

/** anyAlertOn, kept up to date as the member switches them in this tab or another. */
export function useAnyAlertOn(userId: string): boolean {
  return useSyncExternalStore(
    watchAlerts,
    () => anyAlertOn(userId),
    () => false,
  );
}

/** Whether the member's sound is on, kept up to date as for useAnyAlertOn. */
export function useSoundOn(userId: string): boolean {
  return useSyncExternalStore(
    watchAlerts,
    () => alertIsOn(userId, "sound"),
    () => false,
  );
}

/** Whether this tab takes what is kept under `key` for this chat now: no other tab took it a moment ago. */
function claim(key: string, conversationId: string, now: number): boolean {
  try {
    const [chat, at] = (window.localStorage.getItem(key) ?? "").split("@");
    if (chat === conversationId && now - Number(at) < SAME_ALERT_MS) return false;
    window.localStorage.setItem(key, `${conversationId}@${String(now)}`);
  } catch {
    // Blocked storage: each tab takes it for itself.
  }
  return true;
}

/** Whether this tab gives the alert for a message in this chat now: no other tab gave one for it a moment ago. */
export const claimAlert = (conversationId: string, now: number = Date.now()) =>
  claim(LAST_ALERT_KEY, conversationId, now);

/** Whether this tab sounds the chime another asked for: the first tab that may sound takes it. */
export const claimChime = (conversationId: string, now: number = Date.now()) =>
  claim(LAST_CHIME_KEY, conversationId, now);

/**
 * Whether the member takes unassigned chats: they assign leads, or their inbox scope covers chats nobody owns, as the
 * list's Unassigned filter decides (every chat, or every lead's).
 */
export function takesUnassigned(me: SignedInMember): boolean {
  if (me.member.role.isOwner || holds(me, "leads:assign")) return true;
  const scopeOf = (permission: string) => me.member.permissions.find((grant) => grant.permission === permission)?.scope;
  return scopeOf("inbox:view") === "all" || scopeOf("leads:view") === "all";
}

/**
 * Whether a customer's message in this chat is the member's to hear of: a lead of theirs, or no lead anyone owns and
 * unassigned chats theirs to take. A lead someone else owns makes the chat theirs, though this member may not see it.
 */
export function alertsMember(me: SignedInMember, header: Pick<ConversationHeader, "liveLead">): boolean {
  const lead = header.liveLead;
  if (lead?.mine === true) return true;
  return lead?.assigned !== true && takesUnassigned(me);
}

let audio: AudioContext | null = null;

/** Whether the browser has let this tab play sound: a person has clicked or typed in it (no such tab is ever unblocked). */
function activated(): boolean {
  const activation = (navigator as { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return activation?.hasBeenActive !== false;
}

/**
 * The tab's one audio context, made and resumed inside a click or a key (the switch, the first click on a page), so the
 * browser lets it sound from then on. Never made in a tab nobody has clicked: it would only stay silent.
 */
export function readySound(): AudioContext | null {
  if (!activated()) return null;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

/** Whether this tab can sound the chime now: its audio runs (the browser has let it). */
export function soundReady(): boolean {
  return readySound()?.state === "running";
}

/** A soft two-note chime, half a second long; false, and nothing queued, when this tab can't sound now. */
export function playChime(): boolean {
  if (!soundReady() || audio === null) return false;
  const context = audio;
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
  return true;
}

/** Whether this browser can show desktop notifications, and what the member let it do. */
export function notificationPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

/**
 * Shows "New message from …" for a chat, which opens it: through the service worker when one is ready (its click opens
 * `data.path`, as a push's does), else as the page's own notification, whose click comes back to this tab.
 */
export async function showChatNotice(title: string, conversationId: string, open: () => void): Promise<void> {
  // Tagged by the chat: a second notice for it replaces the first, never shows beside it.
  const tag = conversationId;
  const worker = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (worker?.active != null) {
    await worker.showNotification(title, { tag, data: { path: inboxRoute(conversationId) } });
    return;
  }
  const notice = new Notification(title, { tag });
  notice.onclick = () => {
    window.focus();
    open();
    notice.close();
  };
}
