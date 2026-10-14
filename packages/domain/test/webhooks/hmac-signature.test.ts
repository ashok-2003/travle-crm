// The HMAC-SHA256 check most providers use (Razorpay, Meta): the signature of the raw body, in a header.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hmacSha256Signature } from "../../src/webhooks/index.js";

const secret = "webhook-test-secret";
const body = '{"id":"evt_1","type":"payment.captured","note":"₹12,50,000"}';
const sign = (text: string, encoding: "hex" | "base64", key = secret) =>
  createHmac("sha256", key).update(text, "utf8").digest(encoding);
const request = (headers: Record<string, string>, rawBody = body) => ({ headers: new Headers(headers), rawBody });

describe("hmacSha256Signature", () => {
  const hexWithPrefix = hmacSha256Signature({
    secret,
    header: "x-hub-signature-256",
    prefix: "sha256=",
    encoding: "hex",
  });
  const base64 = hmacSha256Signature({ secret, header: "x-signature", encoding: "base64" });

  it("accepts the signature of the exact raw body, in hex after a prefix or in base64", () => {
    expect(hexWithPrefix(request({ "x-hub-signature-256": `sha256=${sign(body, "hex")}` }))).toBe(true);
    expect(hexWithPrefix(request({ "x-hub-signature-256": `sha256=${sign(body, "hex").toUpperCase()}` }))).toBe(true);
    expect(base64(request({ "x-signature": sign(body, "base64") }))).toBe(true);
  });

  it("refuses another secret, another body, a missing header, a missing prefix or a mangled signature", () => {
    const signature = sign(body, "hex");
    expect(hexWithPrefix(request({ "x-hub-signature-256": `sha256=${sign(body, "hex", "other")}` }))).toBe(false);
    expect(hexWithPrefix(request({ "x-hub-signature-256": `sha256=${signature}` }, `${body} `))).toBe(false);
    expect(hexWithPrefix(request({}))).toBe(false);
    expect(hexWithPrefix(request({ "x-hub-signature-256": signature }))).toBe(false);
    expect(hexWithPrefix(request({ "x-hub-signature-256": `sha256=${signature.slice(0, 40)}` }))).toBe(false);
    expect(hexWithPrefix(request({ "x-hub-signature-256": "sha256=not-hex-at-all" }))).toBe(false);
  });

  it("refuses to be built with an empty secret, which would accept forged signatures", () => {
    expect(() => hmacSha256Signature({ secret: "", header: "x-signature", encoding: "hex" })).toThrow(RangeError);
  });
});
