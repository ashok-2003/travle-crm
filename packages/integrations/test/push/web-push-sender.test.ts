// The web push adapter encrypts the notification so only the subscriber can read it, signs it with our VAPID key,
// and tells the caller when a subscription is gone. A local server plays the browser's push service.
import webPush from "web-push";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWebPushSender, type PushSender } from "../../src/push/index.js";
import { createSubscriber, startPushService, type PushService } from "../support/push-service.js";

describe("web push sender", () => {
  const vapid = webPush.generateVAPIDKeys();
  let service: PushService;
  let sender: PushSender;

  beforeAll(async () => {
    service = await startPushService();
    sender = createWebPushSender({
      publicKey: vapid.publicKey,
      privateKey: vapid.privateKey,
      subject: "mailto:support@example.test",
    });
  });

  afterAll(async () => {
    await service.close();
  });

  it("delivers a notification only the subscriber can read, signed with our key", async () => {
    const subscriber = createSubscriber();
    const payload = { title: "Quotation opened", body: "Meera opened QT-2026-0042", url: "/quotes/42" };

    const result = await sender.send({ endpoint: service.endpoint("asha"), ...subscriber.keys }, payload);

    expect(result).toBe("sent");
    const [push] = service.received;
    expect(push).toMatchObject({ method: "POST", path: "/push/asha" });
    expect(push?.headers["content-encoding"]).toBe("aes128gcm");
    expect(push?.headers.ttl).toBe("86400");
    expect(push?.headers.authorization).toMatch(
      new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${vapid.publicKey}$`),
    );
    expect(JSON.parse(subscriber.decrypt(push?.body ?? Buffer.alloc(0)))).toEqual(payload);
  });

  it('answers "gone" when the push service has forgotten the subscription', async () => {
    const subscriber = createSubscriber();
    for (const status of [404, 410]) {
      service.answerWith(status);
      expect(
        await sender.send({ endpoint: service.endpoint("old"), ...subscriber.keys }, { title: "t", body: "b" }),
      ).toBe("gone");
    }
    service.answerWith(201);
  });

  it("throws on any other failure, so the job retries", async () => {
    const subscriber = createSubscriber();
    service.answerWith(500);
    await expect(
      sender.send({ endpoint: service.endpoint("busy"), ...subscriber.keys }, { title: "t", body: "b" }),
    ).rejects.toThrow(/500/);
    service.answerWith(201);
  });

  it("refuses VAPID keys that are not a P-256 key pair, when it is created", () => {
    expect(() =>
      createWebPushSender({ publicKey: "short", privateKey: vapid.privateKey, subject: "mailto:a@b.c" }),
    ).toThrow(/VAPID/);
    expect(() =>
      createWebPushSender({ publicKey: vapid.publicKey, privateKey: vapid.privateKey, subject: "support" }),
    ).toThrow(/subject/);
  });
});
