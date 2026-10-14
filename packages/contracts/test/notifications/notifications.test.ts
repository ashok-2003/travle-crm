// The notification contracts refuse what must never reach the database or a browser: links that leave the web app,
// push endpoints that aren't https, unknown keys, and malformed kinds.
import { describe, expect, it } from "vitest";
import {
  listNotificationsInput,
  markReadInput,
  notificationCreatedEvent,
  notificationPreferenceInput,
  notifyInput,
  pushSubscriptionInput,
  removePushSubscriptionInput,
} from "../../src/notifications/index.js";

const id = "0199e7a0-0000-7000-8000-000000000001";
const notification = { recipientUserIds: [id], kind: "share-link.opened", title: "Opened", body: "Meera opened it" };

describe("notification contracts", () => {
  it("accepts a notification for some people, of a kind, with an optional link inside the web app", () => {
    expect(notifyInput.parse({ ...notification, link: "/quotes/42", channels: ["email"] })).toMatchObject({
      link: "/quotes/42",
      channels: ["email"],
    });
    expect(notifyInput.parse(notification).channels).toEqual([]);
  });

  it("refuses links that could leave the web app", () => {
    for (const link of ["https://evil.example", "//evil.example/path", "quotes/42", "/quotes 42", "/\\evil.example"]) {
      expect(notifyInput.safeParse({ ...notification, link }).success, link).toBe(false);
    }
  });

  it('refuses kinds that are not "<entity>.<what happened>", empty titles and repeated channels', () => {
    expect(notifyInput.safeParse({ ...notification, kind: "Opened" }).success).toBe(false);
    expect(notifyInput.safeParse({ ...notification, title: "  " }).success).toBe(false);
    expect(notifyInput.safeParse({ ...notification, title: "x".repeat(121) }).success).toBe(false);
    expect(notifyInput.safeParse({ ...notification, channels: ["email", "email"] }).success).toBe(false);
    expect(notifyInput.safeParse({ ...notification, channels: ["sms"] }).success).toBe(false);
    expect(notifyInput.safeParse({ ...notification, recipientUserIds: ["not-a-uuid"] }).success).toBe(false);
  });

  it("pages the bell 1 to 50 at a time, 20 by default", () => {
    expect(listNotificationsInput.parse({})).toEqual({ limit: 20 });
    expect(listNotificationsInput.parse({ cursor: id, limit: 50 })).toEqual({ cursor: id, limit: 50 });
    expect(listNotificationsInput.safeParse({ limit: 51 }).success).toBe(false);
    expect(listNotificationsInput.safeParse({ limit: 0 }).success).toBe(false);
  });

  it("marks some notifications read, or all of them, but not neither", () => {
    expect(markReadInput.safeParse({ notificationIds: [id] }).success).toBe(true);
    expect(markReadInput.safeParse({ all: true }).success).toBe(true);
    expect(markReadInput.safeParse({}).success).toBe(false);
    expect(markReadInput.safeParse({ all: false }).success).toBe(false);
    expect(markReadInput.safeParse({ notificationIds: [] }).success).toBe(false);
  });

  it("turns email or push off for one kind or for every kind", () => {
    expect(notificationPreferenceInput.safeParse({ channel: "email", kind: "*", optedOut: true }).success).toBe(true);
    expect(
      notificationPreferenceInput.safeParse({ channel: "push", kind: "share-link.opened", optedOut: false }).success,
    ).toBe(true);
    // The in-app bell can't be turned off: it is the record that the thing happened.
    expect(notificationPreferenceInput.safeParse({ channel: "in-app", kind: "*", optedOut: true }).success).toBe(false);
  });

  it("takes a browser's subscription as PushSubscription.toJSON() gives it, from an https push service only", () => {
    const keys = { p256dh: "B".repeat(87), auth: "A".repeat(22) };
    const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", expirationTime: null, keys };
    expect(pushSubscriptionInput.parse(subscription)).toEqual(subscription);
    expect(pushSubscriptionInput.safeParse({ ...subscription, endpoint: "http://push.example/abc" }).success).toBe(
      false,
    );
    expect(
      pushSubscriptionInput.safeParse({ ...subscription, keys: { ...keys, auth: "not base64url!" } }).success,
    ).toBe(false);
    expect(removePushSubscriptionInput.safeParse({ endpoint: subscription.endpoint }).success).toBe(true);
  });

  it("checks the notification.created payload the delivery listener reads", () => {
    expect(notificationCreatedEvent.parse({ notificationId: id, channels: ["email", "push"] })).toEqual({
      notificationId: id,
      channels: ["email", "push"],
    });
    expect(notificationCreatedEvent.safeParse({ notificationId: id, channels: [] }).success).toBe(false);
  });
});
