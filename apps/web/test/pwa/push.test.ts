// @vitest-environment node
// What the service worker does with a push, decided from facts alone (src/service-worker/push.ts): the notification
// it shows from the delivery's payload ({ title, body, url }); something honest for a payload it can't read, since a
// browser must show one for every push; and where a tap leads: the push's path in the app, else home, never another
// site, bringing forward a window already there rather than opening another.
import { describe, expect, it, vi } from "vitest";
import words from "@/i18n/messages/en-IN/notifications.json";
import { notificationFor, openFromNotification, tapTarget } from "@/service-worker/push";

const ORIGIN = "https://app.example.in";
const opened = {
  title: "Opened: Quotation SAMPLE-2026-0001",
  body: "The link you shared has just been opened.",
  url: "/settings/documents",
};

describe("notificationFor", () => {
  it("shows the push's title and text, and keeps its path for the tap", () => {
    expect(notificationFor(JSON.stringify(opened))).toEqual({
      title: opened.title,
      options: { body: opened.body, icon: "/icons/icon-192.png", data: { path: "/settings/documents" } },
    });
  });

  it("leads home from a push without a path in the app", () => {
    for (const url of [
      undefined,
      "https://evil.example/x",
      "//evil.example/x",
      "/\\evil.example",
      "/api/auth/sign-out",
    ]) {
      expect(notificationFor(JSON.stringify({ ...opened, url })).options.data, String(url)).toEqual({ path: "/" });
    }
  });

  it("still shows something for a push it can't read", () => {
    for (const payload of [null, "not json", "42", JSON.stringify({ title: 7, body: ["x"] })]) {
      expect(notificationFor(payload), String(payload)).toEqual({
        title: words.push.fallbackTitle,
        options: { body: words.push.fallbackBody, icon: "/icons/icon-192.png", data: { path: "/" } },
      });
    }
  });
});

describe("tapTarget", () => {
  it("is the notification's path on the app's own address, or home", () => {
    expect(tapTarget({ path: "/staff" }, ORIGIN)).toBe(`${ORIGIN}/staff`);
    for (const data of [undefined, null, {}, { path: "//evil.example" }, { path: 42 }]) {
      expect(tapTarget(data, ORIGIN), JSON.stringify(data)).toBe(`${ORIGIN}/`);
    }
  });
});

describe("openFromNotification", () => {
  function appWindow(url: string) {
    const window = { url, focus: vi.fn(() => Promise.resolve(window)) };
    return window;
  }
  function clientsWith(...windows: ReturnType<typeof appWindow>[]) {
    return { matchAll: vi.fn(() => Promise.resolve(windows)), openWindow: vi.fn(() => Promise.resolve(null)) };
  }
  const target = `${ORIGIN}/settings/documents`;

  it("brings forward a window of the app already on that page", async () => {
    const there = appWindow(target);
    const clients = clientsWith(appWindow(`${ORIGIN}/`), there);
    await openFromNotification(clients, target);
    expect(there.focus).toHaveBeenCalledOnce();
    expect(clients.openWindow).not.toHaveBeenCalled();
  });

  it("opens a new window rather than move another one of the app, which may hold unsaved work", async () => {
    const elsewhere = appWindow(`${ORIGIN}/staff`);
    const clients = clientsWith(elsewhere);
    await openFromNotification(clients, target);
    expect(elsewhere.focus).not.toHaveBeenCalled();
    expect(clients.openWindow).toHaveBeenCalledWith(target);
  });

  it("opens a window when the app has none", async () => {
    const none = clientsWith();
    await openFromNotification(none, target);
    expect(none.openWindow).toHaveBeenCalledWith(target);
  });
});
