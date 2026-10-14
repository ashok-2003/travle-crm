// A notification is shortened to fit a push service by whole characters as people see them, never mid-emoji.
import { MAX_PUSH_PAYLOAD_BYTES } from "@travel-crm/integrations/push";
import { describe, expect, it } from "vitest";
import { fitPushPayload } from "../../src/notifications/push-payload.js";

const size = (payload: object) => Buffer.byteLength(JSON.stringify(payload));
const family = "👨‍👩‍👧‍👦";
const flag = "🇮🇳";

describe("fitPushPayload", () => {
  it("leaves a payload that fits alone", () => {
    const payload = { title: "Opened", body: "Meera opened it", url: "/quotes/42" };
    expect(fitPushPayload(payload)).toEqual(payload);
  });

  it("cuts the body to the most that fits, with an ellipsis, and keeps the title and link", () => {
    const fitted = fitPushPayload({ title: "Opened", body: "x".repeat(10_000), url: "/quotes/42" });
    expect(size(fitted)).toBeLessThanOrEqual(MAX_PUSH_PAYLOAD_BYTES);
    expect(MAX_PUSH_PAYLOAD_BYTES - size(fitted)).toBeLessThan(5);
    expect(fitted).toMatchObject({ title: "Opened", url: "/quotes/42" });
    expect(fitted.body.endsWith("…")).toBe(true);
  });

  it("never splits a family or a flag, or leaves half a surrogate pair", () => {
    for (const unit of [family, flag, "🙂", "é"]) {
      const fitted = fitPushPayload({ title: "t", body: unit.repeat(2000) });
      expect(fitted.body.isWellFormed()).toBe(true);
      const kept = fitted.body.slice(0, -1);
      expect(kept.length % unit.length, unit).toBe(0);
      expect(kept === unit.repeat(kept.length / unit.length)).toBe(true);
    }
  });

  it("cuts a title that is itself oversized first, leaving the body", () => {
    const fitted = fitPushPayload({ title: "T".repeat(5000), body: "Meera opened it" });
    expect(size(fitted)).toBeLessThanOrEqual(MAX_PUSH_PAYLOAD_BYTES);
    expect(fitted.body).toBe("Meera opened it");
    expect(fitted.title.endsWith("…")).toBe(true);
  });
});
