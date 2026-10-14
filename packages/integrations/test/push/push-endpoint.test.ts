// Only https endpoints on the browsers' own push services are trusted: a subscription comes from a signed-in user,
// and the worker would otherwise POST to whatever address they gave.
import { describe, expect, it } from "vitest";
import { isKnownPushEndpoint } from "../../src/push/index.js";

describe("isKnownPushEndpoint", () => {
  it("accepts the push services of the major browsers", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://push.services.mozilla.com/wpush/v1/abc",
      "https://db5p.notify.windows.com/w/?token=abc",
      "https://web.push.apple.com/abc",
      "https://api.push.apple.com/3/device/abc",
    ]) {
      expect(isKnownPushEndpoint(endpoint), endpoint).toBe(true);
    }
  });

  it("refuses plain http, internal addresses, unknown hosts, look-alikes and things that are not URLs", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://127.0.0.1/push",
      "https://localhost/push",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/push",
      "https://10.0.0.5/push",
      "https://push.example/abc",
      "https://fcm.googleapis.com.evil.example/abc",
      "https://evilnotify.windows.com/abc",
      "https://user@fcm.googleapis.com@evil.example/abc",
      "javascript:alert(1)",
      "not a url",
    ]) {
      expect(isKnownPushEndpoint(endpoint), endpoint).toBe(false);
    }
  });
});
