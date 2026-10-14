// The in-memory push sender records pushes and can play a subscription the push service has forgotten.
import { describe, expect, it } from "vitest";
import { createMemoryPushSender } from "../../src/push/index.js";

describe("memory push sender", () => {
  it('records pushes, and answers "gone" for endpoints marked gone', async () => {
    const sender = createMemoryPushSender();
    const subscription = { endpoint: "https://push.example/a", p256dh: "key", auth: "secret" };
    expect(await sender.send(subscription, { title: "Hi", body: "There" })).toBe("sent");
    sender.markGone("https://push.example/a");
    expect(await sender.send(subscription, { title: "Again", body: "There" })).toBe("gone");
    expect(sender.sent.map((push) => push.payload.title)).toEqual(["Hi"]);
  });

  it("can fail the next sends, as a push service having a bad moment would", async () => {
    const sender = createMemoryPushSender();
    const subscription = { endpoint: "https://push.example/a", p256dh: "key", auth: "secret" };
    sender.failNext(1);
    await expect(sender.send(subscription, { title: "Hi", body: "There" })).rejects.toThrow(/unavailable/);
    expect(await sender.send(subscription, { title: "Hi", body: "There" })).toBe("sent");
    expect(sender.sent).toHaveLength(1);
  });
});
