// One channel or browser failing doesn't stop the others, and failures that can never succeed aren't retried.
import { type EmailSender } from "@travel-crm/integrations/email";
import { PushPayloadTooLargeError } from "@travel-crm/integrations/push";
import { describe, expect, it } from "vitest";
import { deliverNotificationListener } from "../../src/notifications/index.js";
import { deliver, failing, useDeliveryKit } from "./delivery-kit.js";

const permanent = (reason: Error): EmailSender => ({ send: () => Promise.reject(reason) });

describe("delivery failures", () => {
  const kit = useDeliveryKit("Failures");

  it("still pushes when the email can never be sent, and does not retry it", async () => {
    const asha = kit.addMember("asha@agency.example");
    const endpoint = await kit.subscribe(asha, "phone");
    const { id, event } = await kit.notifyMember(asha);

    await deliver(kit, event, { email: permanent(new RangeError("The email's subject has a line break")) });

    expect(kit.push.sent.map((sent) => sent.subscription.endpoint)).toEqual([endpoint]);
    expect((await kit.row(id)).emailedAt).toBeNull();
    expect(kit.logs).toEqual([expect.stringContaining(id)]);
    expect(kit.logs.join()).not.toContain("asha@agency.example");
  });

  it("does not retry an SMTP rejection with a 5xx response", async () => {
    const { event } = await kit.notifyMember(kit.addMember("asha@agency.example"), { channels: ["email"] });
    const rejected = Object.assign(new Error("Sending the email failed: EENVELOPE (SMTP 550)"), {
      code: "EENVELOPE",
      responseCode: 550,
    });

    await expect(deliver(kit, event, { email: permanent(rejected) })).resolves.toBeUndefined();
    expect(kit.logs.join()).toContain("EENVELOPE");
    expect(kit.logs.join()).toContain("550");
  });

  it("retries a login failure or a refused greeting, though they are 5xx: the credentials may be fixed", async () => {
    const { event } = await kit.notifyMember(kit.addMember("asha@agency.example"), { channels: ["email"] });
    for (const [code, responseCode] of [
      ["EAUTH", 535],
      ["EPROTOCOL", 554],
      ["ECONNECTION", undefined],
    ] as const) {
      const refused = Object.assign(new Error(`failed ${code}`), { code, responseCode });
      await expect(deliver(kit, event, { email: permanent(refused) }), code).rejects.toThrow(`failed ${code}`);
    }
    expect(kit.logs).toEqual([]);
  });

  it("records a permanent failure, so a later delivery neither retries nor logs it again, and still pushes", async () => {
    const asha = kit.addMember("asha@agency.example");
    const endpoint = await kit.subscribe(asha, "phone");
    const { id, event } = await kit.notifyMember(asha);
    let attempts = 0;
    const refusing: EmailSender = {
      send: () => {
        attempts += 1;
        return Promise.reject(new RangeError("The email's subject has a line break"));
      },
    };
    kit.push.failNext(1);

    await expect(deliver(kit, event, { email: refusing })).rejects.toThrow(/unavailable/);
    expect(await kit.row(id)).toMatchObject({ emailClaimedAt: null, emailedAt: null });
    expect((await kit.row(id)).emailFailedAt).toBeInstanceOf(Date);

    await deliver(kit, event, { email: refusing });

    expect(attempts).toBe(1);
    expect(kit.logs).toHaveLength(1);
    expect(kit.push.sent.map((sent) => sent.subscription.endpoint)).toEqual([endpoint]);
  });

  it("records a push nobody could take as failed rather than sent, and deletes the forgotten browsers", async () => {
    const asha = kit.addMember(null);
    const phone = await kit.subscribe(asha, "phone");
    const { id, event } = await kit.notifyMember(asha, { channels: ["push"] });
    kit.push.markGone(phone);

    await deliver(kit, event);

    const row = await kit.row(id);
    expect(row.pushedAt).toBeNull();
    expect(row.pushFailedAt).toBeInstanceOf(Date);
    expect(
      await kit.db.forOrg(kit.organizationId, (tx) => tx.pushSubscription.count({ where: { userId: asha } })),
    ).toBe(0);
  });

  it("keeps a push that arrived even if forgetting a gone browser fails, and says so by ids only", async () => {
    const asha = kit.addMember(null);
    const phone = await kit.subscribe(asha, "phone");
    await kit.subscribe(asha, "laptop");
    const { id, event } = await kit.notifyMember(asha, { channels: ["push"] });
    kit.push.markGone(phone);

    await deliverNotificationListener(kit.dependencies()).handle(event, failing(kit, "pushSubscription"));

    expect((await kit.row(id)).pushedAt).toBeInstanceOf(Date);
    expect(kit.push.sent).toHaveLength(1);
    expect(kit.logs).toEqual([expect.stringContaining(id)]);
    expect(kit.logs.join()).not.toContain("db down");
  });

  it("reports a claim it could not release, and still raises the send's own error", async () => {
    const { id, event } = await kit.notifyMember(kit.addMember("asha@agency.example"), { channels: ["email"] });
    const down: EmailSender = { send: () => Promise.reject(new Error("SMTP is down")) };

    await expect(
      deliverNotificationListener(kit.dependencies({ email: down })).handle(event, failing(kit, "releasing")),
    ).rejects.toThrow("SMTP is down");

    expect(kit.logs).toEqual([expect.stringContaining(id)]);
  });

  it("retries an SMTP failure with a 4xx response, and one with no response at all", async () => {
    const { event } = await kit.notifyMember(kit.addMember("asha@agency.example"), { channels: ["email"] });
    const busy = Object.assign(new Error("busy"), { responseCode: 451 });
    await expect(deliver(kit, event, { email: permanent(busy) })).rejects.toThrow("busy");
    await expect(deliver(kit, event, { email: permanent(new Error("timed out")) })).rejects.toThrow("timed out");
  });

  it("still emails when the push fails, and retries only the push", async () => {
    const asha = kit.addMember("asha@agency.example");
    await kit.subscribe(asha, "phone");
    const { id, event } = await kit.notifyMember(asha);
    kit.push.failNext(1);

    await expect(deliver(kit, event)).rejects.toThrow(/unavailable/);
    expect(kit.email.sent).toHaveLength(1);
    expect(await kit.row(id)).toMatchObject({ pushedAt: null, pushClaimedAt: null });

    await deliver(kit, event);
    expect(kit.email.sent).toHaveLength(1);
    expect(kit.push.sent).toHaveLength(1);
  });

  it("counts the push as done when one browser got it, and does not push to that browser again", async () => {
    const asha = kit.addMember(null);
    await kit.subscribe(asha, "phone");
    await kit.subscribe(asha, "laptop");
    const { id, event } = await kit.notifyMember(asha, { channels: ["push"] });
    kit.push.failNext(1);

    await deliver(kit, event);
    expect(kit.push.sent).toHaveLength(1);
    expect((await kit.row(id)).pushedAt).toBeInstanceOf(Date);

    await deliver(kit, event);
    expect(kit.push.sent).toHaveLength(1);
  });

  it("does not retry a push that is too big for any push service", async () => {
    const asha = kit.addMember(null);
    await kit.subscribe(asha, "phone");
    const { id, event } = await kit.notifyMember(asha, { channels: ["push"] });
    const tooBig = { send: () => Promise.reject(new PushPayloadTooLargeError(5000)) };

    await expect(deliver(kit, event, { push: tooBig })).resolves.toBeUndefined();
    expect((await kit.row(id)).pushedAt).toBeNull();
    expect(kit.logs).toEqual([expect.stringContaining(id)]);
  });
});
