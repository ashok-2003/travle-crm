// This browser's web push (spec 9.4): what it can do, and turning push on or off for the person signed in. A
// subscription lives in two places, the browser's push service and the api (whose worker sends to it), and both change
// together. Only a production build registers the service worker (pwa/register-service-worker.ts), so only there can
// push be turned on; on an iPhone, only the app added to the Home Screen has push at all.
import type { PushSubscriptionInput } from "@travel-crm/contracts/notifications";
import type { PushApi } from "./push-api";

/** "no-worker": no service worker for this page (yet). "blocked": the person told the browser no. */
export type PushState = "unsupported" | "no-worker" | "blocked" | "off" | "on";

function hasPush(): boolean {
  return "serviceWorker" in navigator && typeof PushManager !== "undefined" && typeof Notification !== "undefined";
}

export async function pushState(): Promise<PushState> {
  if (!hasPush()) return "unsupported";
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return "no-worker";
  if (Notification.permission === "denied") return "blocked";
  return (await registration.pushManager.getSubscription()) === null ? "off" : "on";
}

/** The VAPID public key's bytes, as subscribe() takes them: the api gives it in base64url. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

/** What the api keeps of a subscription: PushSubscription.toJSON(), its keys base64url. */
function inputOf(subscription: PushSubscription): PushSubscriptionInput {
  const { expirationTime, keys } = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    expirationTime: expirationTime ?? null,
    keys: { p256dh: keys?.p256dh ?? "", auth: keys?.auth ?? "" },
  };
}

/**
 * Asks the browser's permission, subscribes with the api's key and saves the subscription for the person. When the
 * api refuses it, the browser is unsubscribed again, so the two never disagree, and the refusal is thrown.
 */
export async function turnPushOn(api: PushApi): Promise<PushState> {
  const state = await pushState();
  if (state !== "off" && state !== "on") return state;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      // Every push shows a notification: browsers allow nothing else.
      userVisibleOnly: true,
      applicationServerKey: keyBytes(await api.publicKey()),
    }));
  try {
    await api.subscribe(inputOf(subscription));
  } catch (error) {
    await subscription.unsubscribe().catch(() => false);
    throw error;
  }
  return "on";
}

/**
 * Removes this browser's subscription from the api and from its push service. The browser is off afterwards even if
 * the api couldn't be told: its push service has forgotten it, so the api's next push to it is refused and the api
 * deletes it then (ADR 0014).
 */
export async function turnPushOff(api: PushApi): Promise<PushState> {
  if (!hasPush()) return "unsupported";
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = (await registration?.pushManager.getSubscription()) ?? null;
  if (subscription !== null) {
    await Promise.allSettled([api.unsubscribe(subscription.endpoint), subscription.unsubscribe()]);
  }
  return pushState();
}
