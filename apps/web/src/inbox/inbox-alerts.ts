// The Inbox's sound and desktop alerts (inbox revamp spec, part 1 item 5), all in the browser: nothing is sent to the
// server for them. Both are off until the member turns them on (alerts-menu.tsx), and kept in this browser's localStorage.
// An alert is for a customer's new message in a chat of the member's own, or an unassigned one for whoever takes those,
// when that chat isn't the one in front of them; two tabs of the Inbox alert once. A chat is unassigned when its person has
// no lead or no lead anyone owns, never because the member can't see its lead. The sound is made with the Web Audio API, no
// file; a desktop notification goes through the service worker where one is ready (the only way on Android's Chrome), else
// the page's own Notification.
import type { ConversationHeader } from "@travel-crm/contracts/inbox";
import { useSyncExternalStore } from "react";
import { inboxRoute } from "@/lib/routes";
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

/** Told in this tab when a switch changes (other tabs hear the storage event). */
const ALERTS_CHANGED = "travel-crm:inbox-alerts";

export function keepAlert(kind: AlertKind, on: boolean): void {
  try {
    if (on) window.localStorage.setItem(SETTING_KEYS[kind], "on");
    else window.localStorage.removeItem(SETTING_KEYS[kind]);
  } catch {
    // Blocked storage: the switch lasts while the page is open.
  }
  window.dispatchEvent(new Event(ALERTS_CHANGED));
}

/** Whether an alert would be given at all: the sound on, or desktop notifications on and allowed. */
export function anyAlertOn(): boolean {
  return alertIsOn("sound") || (alertIsOn("desktop") && notificationPermission() === "granted");
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
export function useAnyAlertOn(): boolean {
  return useSyncExternalStore(watchAlerts, anyAlertOn, () => false);
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
