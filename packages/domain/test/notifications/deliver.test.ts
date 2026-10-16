// The delivery listener sends each notification by email and push as asked, from the organization's name with its
// Reply-To, respecting opt-outs, never to someone who has left, and independently per channel.
import { randomUUID } from "node:crypto";
import { createTestOrganization } from "@travel-crm/db/testing";
import { senderNameFor, type EmailSender } from "@travel-crm/integrations/email";
import { MAX_PUSH_PAYLOAD_BYTES } from "@travel-crm/integrations/push";
import { describe, expect, it, onTestFinished } from "vitest";
import { systemActor } from "../../src/kernel/index.js";
import { deliverNotificationListener, setPreference } from "../../src/notifications/index.js";
import { deliver, useDeliveryKit } from "./delivery-kit.js";
import { personIn } from "./test-support.js";

describe("delivering notifications", () => {
  const kit = useDeliveryKit("Deliveries");

  it("emails from the organization's name with its Reply-To and a way to opt out, and pushes every browser", async () => {
    const asha = kit.addMember("asha@agency.example");
    const phone = await kit.subscribe(asha, "phone");
    const laptop = await kit.subscribe(asha, "laptop");
    const { id, event } = await kit.notifyMember(asha);

    await deliver(kit, event);

    expect(kit.email.sent).toHaveLength(1);
    expect(kit.email.sent[0]).toMatchObject({
      to: { name: "Asha Owner", address: "asha@agency.example" },
      fromName: senderNameFor("Sharma Travels"),
      replyTo: "hello@sharma.example",
      subject: "Quotation opened",
      headers: { "List-Unsubscribe": "<https://app.example/account/notifications>" },
    });
    expect(kit.email.sent[0]?.text).toContain("https://app.example/quotes/42");
    expect(kit.push.sent.map((sent) => sent.subscription.endpoint).sort()).toEqual([laptop, phone].sort());
    expect(kit.push.sent[0]?.payload).toEqual({
      title: "Quotation opened",
      body: "Meera opened Quotation QT-2026-0042",
      url: "/quotes/42",
    });
    const row = await kit.row(id);
    expect(row.emailedAt).toBeInstanceOf(Date);
    expect(row.pushedAt).toBeInstanceOf(Date);
  });

  it("sends nothing again when the same delivery runs twice", async () => {
    const asha = kit.addMember("asha@agency.example");
    await kit.subscribe(asha, "phone");
    const { event } = await kit.notifyMember(asha);
    await deliver(kit, event);

    await deliver(kit, event);

    expect(kit.email.sent).toHaveLength(1);
    expect(kit.push.sent).toHaveLength(1);
  });

  it("leaves Reply-To out when the organization has no contact email", async () => {
    kit.profile = { ...kit.profile, contactEmail: null };
    const { event } = await kit.notifyMember(kit.addMember("asha@agency.example"));
    await deliver(kit, event);
    expect(kit.email.sent[0]?.replyTo).toBeUndefined();
  });

  it("respects opt-outs: a kind's own setting wins over every kind", async () => {
    const asha = kit.addMember("asha@agency.example");
    await kit.subscribe(asha, "phone");
    const person = personIn(kit.organizationId, asha);
    onTestFinished(async () => {
      for (const channel of ["email", "push"] as const) {
        await kit.db.forOrg(kit.organizationId, (tx) =>
          setPreference(tx, person, { channel, kind: "*", optedOut: false }),
        );
      }
    });
    await kit.db.forOrg(kit.organizationId, (tx) =>
      setPreference(tx, person, { channel: "email", kind: "*", optedOut: true }),
    );
    await kit.db.forOrg(kit.organizationId, (tx) =>
      setPreference(tx, person, { channel: "push", kind: "*", optedOut: true }),
    );
    await kit.db.forOrg(kit.organizationId, (tx) =>
      setPreference(tx, person, { channel: "email", kind: "share-link.opened", optedOut: false }),
    );
    const { event } = await kit.notifyMember(asha);

    await deliver(kit, event);

    expect(kit.email.sent).toHaveLength(1);
    expect(kit.push.sent).toHaveLength(0);
  });

  it("sends no email to someone who opted out of that very kind, though they allowed every kind", async () => {
    const asha = kit.addMember("asha@agency.example");
    const person = personIn(kit.organizationId, asha);
    await kit.db.forOrg(kit.organizationId, (tx) =>
      setPreference(tx, person, { channel: "email", kind: "*", optedOut: false }),
    );
    await kit.db.forOrg(kit.organizationId, (tx) =>
      setPreference(tx, person, { channel: "email", kind: "share-link.opened", optedOut: true }),
    );
    const { event } = await kit.notifyMember(asha, { channels: ["email"] });

    await deliver(kit, event);

    expect(kit.email.sent).toEqual([]);
  });

  it("never emails staff without email, and still pushes to them", async () => {
    const ravi = kit.addMember(null);
    const endpoint = await kit.subscribe(ravi, "ravi");
    const { event } = await kit.notifyMember(ravi);

    await deliver(kit, event);

    expect(kit.email.sent).toEqual([]);
    expect(kit.push.sent.map((sent) => sent.subscription.endpoint)).toEqual([endpoint]);
  });

  it("sends nothing to someone who has left the organization", async () => {
    const { id, event } = await kit.notifyMember(randomUUID());
    await deliver(kit, event);
    expect(kit.email.sent).toEqual([]);
    expect(kit.push.sent).toEqual([]);
    expect((await kit.row(id)).emailedAt).toBeNull();
  });

  it("deletes a subscription the push service has forgotten, and keeps the others", async () => {
    const asha = kit.addMember("asha@agency.example");
    const forgotten = await kit.subscribe(asha, "phone");
    const kept = await kit.subscribe(asha, "laptop");
    kit.push.markGone(forgotten);
    const { event } = await kit.notifyMember(asha);

    await deliver(kit, event);

    const endpoints = await kit.db.forOrg(kit.organizationId, (tx) =>
      tx.pushSubscription.findMany({ where: { userId: asha }, select: { endpoint: true } }),
    );
    expect(endpoints).toEqual([{ endpoint: kept }]);
  });

  it("fails when email fails, so the job retries, and the retry sends it", async () => {
    const asha = kit.addMember("asha@agency.example");
    const { id, event } = await kit.notifyMember(asha, { channels: ["email"] });
    const down: EmailSender = { send: () => Promise.reject(new Error("SMTP is down")) };

    await expect(deliver(kit, event, { email: down })).rejects.toThrow("SMTP is down");
    expect(await kit.row(id)).toMatchObject({ emailedAt: null, emailClaimedAt: null });

    await deliver(kit, event);
    expect(kit.email.sent).toHaveLength(1);
  });

  it("does nothing for a notification that isn't in the event's organization", async () => {
    const asha = kit.addMember("asha@agency.example");
    await kit.subscribe(asha, "phone");
    const { event } = await kit.notifyMember(asha);
    const otherOrganizationId = await createTestOrganization(kit.platform, "Other deliveries");

    await deliverNotificationListener(kit.dependencies()).handle(
      { ...event, organizationId: otherOrganizationId },
      { actor: systemActor(otherOrganizationId), forOrg: (fn) => kit.db.forOrg(otherOrganizationId, fn) },
    );

    expect(kit.email.sent).toEqual([]);
    expect(kit.push.sent).toEqual([]);
  });

  it("shortens a long notification so every push fits, and still pushes", async () => {
    const ravi = kit.addMember(null);
    const endpoint = await kit.subscribe(ravi, "ravi");
    const { event } = await kit.notifyMember(ravi, {
      title: "🙂".repeat(120),
      body: "🙂".repeat(1000),
      channels: ["push"],
    });

    await deliver(kit, event);

    const sent = kit.push.sent.find((candidate) => candidate.subscription.endpoint === endpoint);
    expect(Buffer.byteLength(JSON.stringify(sent?.payload))).toBeLessThanOrEqual(MAX_PUSH_PAYLOAD_BYTES);
    expect(sent?.payload.body.endsWith("…")).toBe(true);
    expect(sent?.payload.body.isWellFormed()).toBe(true);
  });

  it("retries a push after a transient failure, and pushes once it works", async () => {
    const ravi = kit.addMember(null);
    const endpoint = await kit.subscribe(ravi, "ravi");
    const { id, event } = await kit.notifyMember(ravi, { channels: ["push"] });
    kit.push.failNext(1);

    await expect(deliver(kit, event)).rejects.toThrow(/unavailable/);
    expect(await kit.row(id)).toMatchObject({ pushedAt: null, pushClaimedAt: null });
    await deliver(kit, event);

    expect(kit.push.sent.map((sent) => sent.subscription.endpoint)).toEqual([endpoint]);
    expect((await kit.row(id)).pushedAt).toBeInstanceOf(Date);
  });
});
