// The web push adapter encrypts the notification so only the subscriber can read it, signs it with our VAPID key,
// and tells the caller when a subscription is gone. A local server plays the browser's push service.
import webPush from "web-push";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createWebPushSender, PushPayloadTooLargeError, type PushSender } from "../../src/push/index.js";
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
      // The local push service is plain http on loopback, which a real endpoint never is.
      allowAnyEndpoint: true,
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
    const push = service.received.find((received) => received.path === "/push/asha");
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
    try {
      for (const status of [404, 410]) {
        service.answerWith(status);
        expect(
          await sender.send({ endpoint: service.endpoint("old"), ...subscriber.keys }, { title: "t", body: "b" }),
        ).toBe("gone");
      }
    } finally {
      service.answerWith(201);
    }
  });

  it("throws on any other failure, so the job retries", async () => {
    const subscriber = createSubscriber();
    try {
      service.answerWith(500);
      await expect(
        sender.send({ endpoint: service.endpoint("busy"), ...subscriber.keys }, { title: "t", body: "b" }),
      ).rejects.toThrow(/500/);
    } finally {
      service.answerWith(201);
    }
  });

  it("refuses VAPID keys that are not a P-256 key pair, when it is created", () => {
    expect(() =>
      createWebPushSender({ publicKey: "short", privateKey: vapid.privateKey, subject: "mailto:a@b.c" }),
    ).toThrow(/VAPID/);
    expect(() =>
      createWebPushSender({ publicKey: vapid.publicKey, privateKey: vapid.privateKey, subject: "support" }),
    ).toThrow(/subject/);
  });

  it("refuses a VAPID private key that does not belong to the public key", () => {
    const other = webPush.generateVAPIDKeys();
    expect(() =>
      createWebPushSender({ publicKey: vapid.publicKey, privateKey: other.privateKey, subject: "mailto:a@b.c" }),
    ).toThrow(/VAPID/);
  });

  describe("endpoints", () => {
    const strict = () =>
      createWebPushSender({ publicKey: vapid.publicKey, privateKey: vapid.privateKey, subject: "mailto:a@b.c" });

    it("never calls an endpoint that isn't https on a known push service", async () => {
      const subscriber = createSubscriber();
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      try {
        for (const endpoint of [service.endpoint("local"), "https://169.254.169.254/x", "https://push.example/x"]) {
          await expect(strict().send({ endpoint, ...subscriber.keys }, { title: "t", body: "b" })).resolves.toBe(
            "gone",
          );
        }
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
      expect(service.received.filter((received) => received.path === "/push/local")).toEqual([]);
    });

    it("does not follow a redirect to somewhere else", async () => {
      const subscriber = createSubscriber();
      try {
        service.answerWith(302);
        await expect(
          sender.send({ endpoint: service.endpoint("moved"), ...subscriber.keys }, { title: "t", body: "b" }),
        ).rejects.toThrow();
      } finally {
        service.answerWith(201);
      }
      expect(service.received.filter((received) => received.path === "/elsewhere")).toEqual([]);
    });
  });

  describe("payload size", () => {
    it("sends a payload that just fits", async () => {
      const subscriber = createSubscriber();
      const overhead = JSON.stringify({ title: "t", body: "" }).length;
      const body = "é".repeat(Math.floor((3993 - overhead) / 2));
      const payload = { title: "t", body };
      expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThanOrEqual(3993);
      expect(await sender.send({ endpoint: service.endpoint("big"), ...subscriber.keys }, payload)).toBe("sent");
    });

    it("refuses one that is too big for a push service, as a permanent failure", async () => {
      const subscriber = createSubscriber();
      const error = await sender
        .send({ endpoint: service.endpoint("huge"), ...subscriber.keys }, { title: "t", body: "é".repeat(2000) })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(PushPayloadTooLargeError);
      expect(error).toMatchObject({ code: "PUSH_PAYLOAD_TOO_LARGE" });
      expect(service.received.filter((received) => received.path === "/push/huge")).toEqual([]);
    });
  });
});
