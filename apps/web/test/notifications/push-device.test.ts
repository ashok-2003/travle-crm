// This browser's push (spec 9.4), with a stand-in for the browser's push machinery (fake-push-browser.ts): what the
// preferences page can say about it; turning it on (the browser's permission, a subscription with the api's VAPID key,
// saved to the api, and taken back if the api refuses); turning it off (from the api and from the push service); and
// signing out's removal, which never throws and never waits long.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FORGET_PUSH_TIME_LIMIT_MS,
  forgetThisBrowsersPush,
  forgetThisDevicesPush,
} from "@/notifications/push/forget-push";
import type { PushApi } from "@/notifications/push/push-api";
import { pushState, turnPushOff, turnPushOn } from "@/notifications/push/push-device";
import { fakePushBrowser, THIS_PHONE, type FakePushBrowser } from "./fake-push-browser";

/** A VAPID public key as the api gives it: a P-256 point (65 bytes, the first 4) in base64url. */
const PUBLIC_KEY = `B${"A".repeat(86)}`;

function fakeApi(changes: Partial<PushApi> = {}): PushApi & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    publicKey: () => Promise.resolve(PUBLIC_KEY),
    subscribe: (subscription) => {
      calls.push(["subscribe", subscription]);
      return Promise.resolve();
    },
    unsubscribe: (endpoint) => {
      calls.push(["unsubscribe", endpoint]);
      return Promise.resolve();
    },
    ...changes,
  };
}

let browser: FakePushBrowser | undefined;

afterEach(() => {
  browser?.restore();
  browser = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("pushState", () => {
  it("says what this browser can do", async () => {
    expect(await pushState()).toBe("unsupported");
    browser = fakePushBrowser({ registered: false });
    expect(await pushState()).toBe("no-worker");
    browser.restore();
    browser = fakePushBrowser({ permission: "denied" });
    expect(await pushState()).toBe("blocked");
    browser.restore();
    browser = fakePushBrowser({ permission: "granted" });
    expect(await pushState()).toBe("off");
    browser.restore();
    browser = fakePushBrowser({ permission: "granted", subscribed: true });
    expect(await pushState()).toBe("on");
  });
});

describe("turnPushOn", () => {
  it("asks the browser, subscribes with the api's key and saves the subscription", async () => {
    browser = fakePushBrowser();
    const api = fakeApi();
    expect(await turnPushOn(api)).toBe("on");
    const [options] = browser.subscribedWith;
    expect(options?.userVisibleOnly).toBe(true);
    const key = new Uint8Array(options?.applicationServerKey as Uint8Array);
    expect([key.length, key[0]]).toEqual([65, 4]);
    expect(api.calls).toEqual([
      [
        "subscribe",
        { endpoint: THIS_PHONE, expirationTime: null, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } },
      ],
    ]);
  });

  it("puts the browser's question before anything is awaited, as Safari and iOS need", async () => {
    browser = fakePushBrowser();
    const turning = turnPushOn(fakeApi());
    expect(browser.asked).toBe(1);
    await turning;
  });

  it("does not ask again once the person has answered", async () => {
    browser = fakePushBrowser({ permission: "granted" });
    expect(await turnPushOn(fakeApi())).toBe("on");
    expect(browser.asked).toBe(0);
  });

  it("fails as the browser does when a subscription comes without its keys", async () => {
    browser = fakePushBrowser({ keys: false });
    const api = fakeApi();
    await expect(turnPushOn(api)).rejects.toBeInstanceOf(DOMException);
    expect(api.calls).toEqual([]);
    expect(browser.subscription()).toBeNull();
  });

  it("does nothing more when the person dismisses or refuses the browser's question", async () => {
    browser = fakePushBrowser({ prompt: "default" });
    expect(await turnPushOn(fakeApi())).toBe("off");
    browser.restore();
    browser = fakePushBrowser({ prompt: "denied" });
    expect(await turnPushOn(fakeApi())).toBe("blocked");
    expect(browser.subscribedWith).toEqual([]);
  });

  it("takes the subscription back when the api refuses it, and says so", async () => {
    browser = fakePushBrowser();
    const refusal = new Error("refused");
    await expect(turnPushOn(fakeApi({ subscribe: () => Promise.reject(refusal) }))).rejects.toBe(refusal);
    expect(browser.subscription()).toBeNull();
  });
});

describe("turnPushOff", () => {
  it("removes the subscription from the api and the push service", async () => {
    browser = fakePushBrowser({ permission: "granted", subscribed: true });
    const api = fakeApi();
    expect(await turnPushOff(api)).toBe("off");
    expect(api.calls).toEqual([["unsubscribe", THIS_PHONE]]);
    expect(browser.unsubscribed).toBe(1);
  });

  it("still turns this browser off when the api can't be told, and reports that", async () => {
    const reported = vi.fn();
    vi.stubGlobal("reportError", reported);
    browser = fakePushBrowser({ permission: "granted", subscribed: true });
    const offline = new TypeError("offline");
    expect(await turnPushOff(fakeApi({ unsubscribe: () => Promise.reject(offline) }))).toBe("off");
    expect(browser.subscription()).toBeNull();
    expect(reported).toHaveBeenCalledWith(offline);
  });

  it("starts the browser's own removal before asking the api, so it doesn't depend on the network", async () => {
    browser = fakePushBrowser({ permission: "granted", subscribed: true });
    const atApi: (number | undefined)[] = [];
    const api = fakeApi({
      unsubscribe: () => {
        atApi.push(browser?.unsubscribed);
        return new Promise(() => undefined);
      },
    });
    void turnPushOff(api);
    await vi.waitFor(() => {
      expect(atApi).toEqual([1]);
    });
  });

  it("fails when the browser can't forget the subscription", async () => {
    browser = fakePushBrowser({
      permission: "granted",
      subscribed: true,
      unsubscribe: () => Promise.reject(new DOMException("no", "AbortError")),
    });
    await expect(turnPushOff(fakeApi())).rejects.toBeInstanceOf(DOMException);
  });
});

describe("forgetThisBrowsersPush", () => {
  it("removes the subscription from the push service and asks the api nothing", async () => {
    browser = fakePushBrowser({ permission: "granted", subscribed: true });
    await forgetThisBrowsersPush();
    expect(browser.subscription()).toBeNull();
    expect(browser.unsubscribed).toBe(1);
  });

  it("asks nothing of a browser without a subscription, or without push at all", async () => {
    await forgetThisBrowsersPush();
    browser = fakePushBrowser({ permission: "granted" });
    await forgetThisBrowsersPush();
    expect(browser.unsubscribed).toBe(0);
  });
});

describe("forgetThisDevicesPush", () => {
  it("asks nothing of a browser without a subscription, or without push at all", async () => {
    const api = fakeApi();
    await forgetThisDevicesPush(api);
    browser = fakePushBrowser({ permission: "granted" });
    await forgetThisDevicesPush(api);
    expect(api.calls).toEqual([]);
  });

  it("removes this browser's subscription, and never throws", async () => {
    browser = fakePushBrowser({ permission: "granted", subscribed: true });
    const api = fakeApi({ unsubscribe: () => Promise.reject(new TypeError("offline")) });
    await expect(forgetThisDevicesPush(api)).resolves.toBeUndefined();
    expect(browser.unsubscribed).toBe(1);
  });

  it("stops waiting for an api or a push service that doesn't answer", async () => {
    vi.useFakeTimers();
    browser = fakePushBrowser({
      permission: "granted",
      subscribed: true,
      unsubscribe: () => new Promise(() => undefined),
    });
    const forgotten = vi.fn();
    void forgetThisDevicesPush(fakeApi({ unsubscribe: () => new Promise(() => undefined) })).then(forgotten);
    await vi.advanceTimersByTimeAsync(FORGET_PUSH_TIME_LIMIT_MS - 1);
    expect(forgotten).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(forgotten).toHaveBeenCalledOnce();
  });
});
