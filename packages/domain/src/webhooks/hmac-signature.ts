// The signature check most providers use (Razorpay, Meta): an HMAC-SHA256 of the raw body, sent in a header.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { WebhookRequest } from "./provider.js";

export interface HmacSignatureOptions {
  /** The shared secret the provider signs with. */
  secret: string;
  /** The header carrying the signature, e.g. "x-razorpay-signature". */
  header: string;
  /** Text before the signature, e.g. "sha256=" in Meta's x-hub-signature-256. */
  prefix?: string;
  encoding: "hex" | "base64";
}

/** A WebhookProvider.verify that compares the header's signature with the body's in constant time. */
export function hmacSha256Signature(options: HmacSignatureOptions): (request: WebhookRequest) => boolean {
  // An HMAC with an empty key is computable by anyone, so an unset secret must not become "verify everything".
  if (options.secret === "") throw new RangeError("A webhook signature secret can't be empty");
  const prefix = options.prefix ?? "";
  return ({ headers, rawBody }) => {
    const sent = headers.get(options.header);
    if (sent?.startsWith(prefix) !== true) return false;
    const expected = createHmac("sha256", options.secret).update(rawBody, "utf8").digest();
    // A malformed signature decodes to fewer bytes, and timingSafeEqual needs equal lengths.
    const given = Buffer.from(sent.slice(prefix.length), options.encoding);
    return given.length === expected.length && timingSafeEqual(given, expected);
  };
}
