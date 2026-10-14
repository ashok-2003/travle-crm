// Sends web push with our VAPID key. web-push encrypts the payload and signs the request; the request itself goes
// out with fetch, which (unlike web-push's own sender) also reaches a plain-HTTP endpoint in tests.
import webPush from "web-push";
import type { PushSender } from "./push-sender.js";

export interface WebPushSettings {
  /** The VAPID public key, base64url: the web app subscribes with it too. */
  publicKey: string;
  privateKey: string;
  /** How a push service reaches us about problems: "mailto:..." or an https URL. */
  subject: string;
}

/** A day: an unread notification about something older than that is noise. */
const TIME_TO_LIVE_SECONDS = 24 * 60 * 60;

function assertVapidSettings(settings: WebPushSettings): void {
  const decodedLength = (key: string) => Buffer.from(key, "base64url").length;
  if (decodedLength(settings.publicKey) !== 65 || decodedLength(settings.privateKey) !== 32) {
    throw new RangeError("The VAPID keys must be a P-256 key pair in base64url (as web-push generateVAPIDKeys makes)");
  }
  if (!/^(mailto:|https:\/\/)/.test(settings.subject)) {
    throw new RangeError('The VAPID subject must be a "mailto:" address or an https URL');
  }
}

export function createWebPushSender(settings: WebPushSettings): PushSender {
  assertVapidSettings(settings);
  return {
    send: async (subscription, payload) => {
      const request = webPush.generateRequestDetails(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(payload),
        {
          vapidDetails: settings,
          TTL: TIME_TO_LIVE_SECONDS,
          contentEncoding: "aes128gcm",
        },
      );
      const response = await fetch(request.endpoint, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      if (response.status === 404 || response.status === 410) return "gone";
      if (!response.ok) {
        throw new Error(`The push service answered ${String(response.status)} ${response.statusText}`);
      }
      return "sent";
    },
  };
}
