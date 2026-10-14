// Sends web push with our VAPID key. web-push encrypts the payload and signs the request; the request itself goes
// out with fetch, which (unlike web-push's own sender) also reaches a plain-HTTP endpoint in tests.
import { createECDH } from "node:crypto";
import webPush from "web-push";
import { isKnownPushEndpoint } from "./push-endpoint.js";
import { MAX_PUSH_PAYLOAD_BYTES, PushPayloadTooLargeError, type PushSender } from "./push-sender.js";

export interface WebPushSettings {
  /** The VAPID public key, base64url: the web app subscribes with it too. */
  publicKey: string;
  privateKey: string;
  /** How a push service reaches us about problems: "mailto:..." or an https URL. */
  subject: string;
  /** Tests only: lets a plain-http local server stand in for a push service. Never set it in production. */
  allowAnyEndpoint?: boolean | undefined;
}

/** A day: an unread notification about something older than that is noise. */
const TIME_TO_LIVE_SECONDS = 24 * 60 * 60;

/** A push service that doesn't answer shouldn't hold a worker. */
const TIMEOUT_MS = 10_000;

function assertVapidSettings(settings: WebPushSettings): void {
  const decodedLength = (key: string) => Buffer.from(key, "base64url").length;
  if (decodedLength(settings.publicKey) !== 65 || decodedLength(settings.privateKey) !== 32) {
    throw new RangeError("The VAPID keys must be a P-256 key pair in base64url (as web-push generateVAPIDKeys makes)");
  }
  const derived = createECDH("prime256v1");
  derived.setPrivateKey(Buffer.from(settings.privateKey, "base64url"));
  if (!derived.getPublicKey().equals(Buffer.from(settings.publicKey, "base64url"))) {
    throw new RangeError("The VAPID private key does not belong to the public key");
  }
  if (!/^(mailto:|https:\/\/)/.test(settings.subject)) {
    throw new RangeError('The VAPID subject must be a "mailto:" address or an https URL');
  }
}

export function createWebPushSender(settings: WebPushSettings): PushSender {
  assertVapidSettings(settings);
  return {
    send: async (subscription, payload) => {
      // A stored endpoint that is not a known push service is dropped like a forgotten one, and never called.
      if (settings.allowAnyEndpoint !== true && !isKnownPushEndpoint(subscription.endpoint)) return "gone";
      const body = JSON.stringify(payload);
      const bytes = Buffer.byteLength(body);
      if (bytes > MAX_PUSH_PAYLOAD_BYTES) throw new PushPayloadTooLargeError(bytes);
      const request = webPush.generateRequestDetails(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        body,
        {
          vapidDetails: { publicKey: settings.publicKey, privateKey: settings.privateKey, subject: settings.subject },
          TTL: TIME_TO_LIVE_SECONDS,
          contentEncoding: "aes128gcm",
        },
      );
      const response = await fetch(request.endpoint, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.status === 404 || response.status === 410) return "gone";
      if (!response.ok) {
        throw new Error(`The push service answered ${String(response.status)} ${response.statusText}`);
      }
      return "sent";
    },
  };
}
