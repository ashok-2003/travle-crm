// One channel or browser failing doesn't stop the others, and failures that can never succeed aren't retried.
import { type EmailSender } from "@travel-crm/integrations/email";
import { PushPayloadTooLargeError } from "@travel-crm/integrations/push";
import { describe, expect, it } from "vitest";
import { deliver, useDeliveryKit } from "./delivery-kit.js";

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
    const rejected = Object.assign(new Error("Sending the email failed: EENVELOPE (SMTP 550)"), { responseCode: 550 });

    await expect(deliver(kit, event, { email: permanent(rejected) })).resolves.toBeUndefined();
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
