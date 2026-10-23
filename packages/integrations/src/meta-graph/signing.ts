// Meta's signed values, for the api that checks them and for tests that make them (spec 2, 10, 12): the webhook's
// X-Hub-Signature-256 and the data-deletion callback's signed_request. Both are HMAC-SHA256 with the app secret.
import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_SIGNATURE_PREFIX = "sha256=";

/** The header value Meta sends for this raw body. */
export function signWebhookBody(rawBody: string | Uint8Array, appSecret: string): string {
  return WEBHOOK_SIGNATURE_PREFIX + createHmac("sha256", appSecret).update(rawBody).digest("hex");
}

/** A test helper bound to one app secret. */
export function webhookSigner(appSecret: string) {
  return { sign: (rawBody: string | Uint8Array) => signWebhookBody(rawBody, appSecret) };
}

const base64Url = (bytes: Uint8Array | Buffer) => Buffer.from(bytes).toString("base64url");

export interface SignedRequestPayload {
  algorithm: string;
  /** Unix seconds after which the request is no longer honoured. */
  expires?: number;
  issued_at?: number;
  /** The app-scoped user id. */
  user_id: string;
}

/** A signed_request as Meta's data-deletion callback sends it: `<signature>.<payload>`, both base64url. */
export function makeSignedRequest(payload: SignedRequestPayload, appSecret: string): string {
  const encoded = base64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  const signature = createHmac("sha256", appSecret).update(encoded).digest();
  return `${base64Url(signature)}.${encoded}`;
}

/**
 * The payload of a signed_request, or null for anything that is not one: malformed, signed with another secret,
 * another algorithm, or expired (`expires` honoured when present). Constant-time on the signature.
 */
export function readSignedRequest(signedRequest: string, appSecret: string, now: Date): SignedRequestPayload | null {
  const parts = signedRequest.split(".");
  const [signature, encoded] = parts;
  if (parts.length !== 2 || !signature || !encoded) return null;
  const given = Buffer.from(signature, "base64url");
  const expected = createHmac("sha256", appSecret).update(encoded).digest();
  if (given.byteLength !== expected.byteLength || !timingSafeEqual(given, expected)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const { algorithm, user_id: userId, expires, issued_at: issuedAt } = payload as Record<string, unknown>;
  if (typeof algorithm !== "string" || algorithm.toUpperCase() !== "HMAC-SHA256") return null;
  if (typeof userId !== "string" || userId === "") return null;
  if (expires !== undefined && (typeof expires !== "number" || expires * 1000 <= now.getTime())) return null;
  if (issuedAt !== undefined && typeof issuedAt !== "number") return null;
  return {
    algorithm,
    user_id: userId,
    ...(expires === undefined ? {} : { expires }),
    ...(issuedAt === undefined ? {} : { issued_at: issuedAt }),
  };
}

export interface LeadgenChange {
  leadgenId: string;
  pageId: string;
  formId: string;
  createdTime?: number;
  adId?: string;
}

/** The body of a leadgen delivery with these changes: ids only, as Meta sends (spec 2). */
export function leadgenDeliveryBody(changes: readonly LeadgenChange[], time = 1_761_213_600): string {
  const byPage = new Map<string, LeadgenChange[]>();
  for (const change of changes) byPage.set(change.pageId, [...(byPage.get(change.pageId) ?? []), change]);
  return JSON.stringify({
    object: "page",
    entry: [...byPage.entries()].map(([pageId, pageChanges]) => ({
      id: pageId,
      time,
      changes: pageChanges.map((change) => ({
        field: "leadgen",
        value: {
          leadgen_id: change.leadgenId,
          page_id: change.pageId,
          form_id: change.formId,
          created_time: change.createdTime ?? time,
          ad_id: change.adId ?? "0",
          adgroup_id: "0",
        },
      })),
    })),
  });
}
