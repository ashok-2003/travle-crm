// The webhook signature and the deletion callback's signed_request: accepted when right, null or false for anything else.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  leadgenDeliveryBody,
  makeSignedRequest,
  readSignedRequest,
  signWebhookBody,
} from "../../src/meta-graph/index.js";

const secret = "app-secret-for-tests";
const now = new Date("2026-10-23T10:00:00Z");

describe("signWebhookBody", () => {
  it("is sha256= and the HMAC-SHA256 hex of the raw body", () => {
    const body = leadgenDeliveryBody([{ leadgenId: "L1", pageId: "P1", formId: "F1" }]);
    expect(signWebhookBody(body, secret)).toBe(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
    expect(signWebhookBody(body, "other")).not.toBe(signWebhookBody(body, secret));
  });
});

describe("leadgenDeliveryBody", () => {
  it("carries ids only, one entry per Page, one change per lead", () => {
    const body = JSON.parse(
      leadgenDeliveryBody([
        { leadgenId: "L1", pageId: "P1", formId: "F1" },
        { leadgenId: "L2", pageId: "P1", formId: "F2" },
        { leadgenId: "L3", pageId: "P2", formId: "F3" },
      ]),
    ) as { object: string; entry: { id: string; changes: { field: string; value: Record<string, unknown> }[] }[] };
    expect(body.object).toBe("page");
    expect(body.entry.map((entry) => entry.changes.length)).toEqual([2, 1]);
    expect(body.entry[0]?.changes[0]).toMatchObject({
      field: "leadgen",
      value: { leadgen_id: "L1", page_id: "P1", form_id: "F1" },
    });
  });
});

describe("readSignedRequest", () => {
  const payload = { algorithm: "HMAC-SHA256", user_id: "u-1", issued_at: 1_761_213_000, expires: 1_792_800_000 };

  it("reads a valid signed request", () => {
    expect(readSignedRequest(makeSignedRequest(payload, secret), secret, now)).toEqual(payload);
  });

  it("refuses another secret, an altered payload, an expired one, another algorithm and malformed input", () => {
    const good = makeSignedRequest(payload, secret);
    expect(readSignedRequest(good, "other", now)).toBeNull();
    const signature = good.split(".")[0] ?? "";
    const forged = Buffer.from(JSON.stringify({ ...payload, user_id: "u-2" })).toString("base64url");
    expect(readSignedRequest(`${signature}.${forged}`, secret, now)).toBeNull();
    expect(
      readSignedRequest(makeSignedRequest({ ...payload, expires: 1_792_000_000 }, secret), secret, now),
    ).toBeNull();
    expect(
      readSignedRequest(makeSignedRequest({ ...payload, algorithm: "HMAC-SHA1" }, secret), secret, now),
    ).toBeNull();
    for (const bad of ["", "nodot", "a.b.c", ".", "x.y"]) expect(readSignedRequest(bad, secret, now)).toBeNull();
  });

  it("honours a request with no expiry", () => {
    const open = { algorithm: payload.algorithm, user_id: payload.user_id };
    expect(readSignedRequest(makeSignedRequest(open, secret), secret, now)?.user_id).toBe("u-1");
  });
});
