// When to offer "turn on notifications" (the owner, 2026-11-17): on a device whose push is off, right after a sign-in,
// and otherwise at most once a day, by the device's own day. Storage can fail, and then the offer is simply made.
import { afterEach, describe, expect, it } from "vitest";
import {
  consumeSignedIn,
  forgetTurnedOffByChoice,
  rememberTurnedOffByChoice,
  turnedOffByChoice,
  localDay,
  markOffered,
  markSignedIn,
  shouldOfferPush,
  wasOfferedOn,
} from "@/notifications/push/push-offer";

afterEach(() => {
  window.localStorage.clear();
});

describe("shouldOfferPush", () => {
  const base = { state: "off", justSignedIn: false, offeredOn: null, today: "2026-11-17" } as const;

  it("offers on a device whose push is off and that was not offered today", () => {
    expect(shouldOfferPush(base)).toBe(true);
    expect(shouldOfferPush({ ...base, offeredOn: "2026-11-16" })).toBe(true);
  });

  it("does not offer twice in a day", () => {
    expect(shouldOfferPush({ ...base, offeredOn: "2026-11-17" })).toBe(false);
  });

  it("offers right after a sign-in, even when it was offered today", () => {
    expect(shouldOfferPush({ ...base, justSignedIn: true, offeredOn: "2026-11-17" })).toBe(true);
  });

  it.each(["unsupported", "no-worker", "blocked", "on"] as const)("never offers when the state is %s", (state) => {
    expect(shouldOfferPush({ ...base, state, justSignedIn: true })).toBe(false);
  });
});

describe("the offer's memory", () => {
  it("keeps the sign-in until it is consumed, once", () => {
    expect(consumeSignedIn()).toBe(false);
    markSignedIn();
    expect(consumeSignedIn()).toBe(true);
    expect(consumeSignedIn()).toBe(false);
  });

  it("keeps the day it was offered", () => {
    expect(wasOfferedOn()).toBeNull();
    markOffered("2026-11-17");
    expect(wasOfferedOn()).toBe("2026-11-17");
  });

  it("keeps that the person turned push off, until they turn it on again", () => {
    expect(turnedOffByChoice()).toBe(false);
    rememberTurnedOffByChoice();
    expect(turnedOffByChoice()).toBe(true);
    forgetTurnedOffByChoice();
    expect(turnedOffByChoice()).toBe(false);
  });

  it("names the device's own day, not UTC's", () => {
    expect(localDay(new Date(2026, 10, 17, 0, 30))).toBe("2026-11-17");
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("works on without storage", () => {
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", { configurable: true, get: blocked });
    try {
      expect(() => {
        markSignedIn();
        markOffered("2026-11-17");
        rememberTurnedOffByChoice();
        forgetTurnedOffByChoice();
      }).not.toThrow();
      expect(turnedOffByChoice()).toBe(false);
      expect(consumeSignedIn()).toBe(false);
      expect(wasOfferedOn()).toBeNull();
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});
