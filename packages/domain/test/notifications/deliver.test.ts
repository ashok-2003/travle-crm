// The delivery listener sends each notification by email and push as asked, from the organization's name with its
// Reply-To, respecting opt-outs, never twice, and never to someone who has left.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import {
  createMemoryEmailSender,
  senderNameFor,
  type EmailSender,
  type MemoryEmailSender,
} from "@travel-crm/integrations/email";
import { createMemoryPushSender, type MemoryPushSender } from "@travel-crm/integrations/push";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import type { MemberContact, OrganizationProfile } from "../../src/identity/index.js";
import type { ListenerContext } from "../../src/jobs/index.js";
import { systemActor } from "../../src/kernel/index.js";
import {
  deliverNotificationListener,
  notify,
  savePushSubscription,
  setPreference,
  type DeliveryDependencies,
} from "../../src/notifications/index.js";
import { eventsOfType, personIn } from "./test-support.js";

const asha = "0199e7a0-0000-7000-8000-00000000a5a0";
const ravi = "0199e7a0-0000-7000-8000-00000000ba01";
const leaver = "0199e7a0-0000-7000-8000-00000000dead";

describe("delivering notifications", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let email: MemoryEmailSender;
  let push: MemoryPushSender;
  let profile: OrganizationProfile;
  const contacts: MemberContact[] = [
    { userId: asha, name: "Asha Owner", email: "asha@agency.example" },
    { userId: ravi, name: "Ravi", email: null },
  ];

  const dependencies = (overrides: Partial<DeliveryDependencies> = {}): DeliveryDependencies => ({
    email,
    push,
    organizationProfile: () => Promise.resolve(profile),
    memberContacts: (_organizationId, userIds) =>
      Promise.resolve(contacts.filter((contact) => userIds.includes(contact.userId))),
    appUrl: "https://app.example",
    ...overrides,
  });

  const context = (): ListenerContext => ({
    actor: systemActor(organizationId),
    forOrg: (fn) => db.forOrg(organizationId, fn),
  });

  /** Notifies one person and runs the delivery listener on the event that produced, as the worker would. */
  async function notifyAndDeliver(recipientUserId: string, deliveryDependencies = dependencies()) {
    const [id] = await db.forOrg(organizationId, (tx) =>
      notify(tx, systemActor(organizationId), {
        recipientUserIds: [recipientUserId],
        kind: "share-link.opened",
        title: "Quotation opened",
        body: "Meera opened Quotation QT-2026-0042",
        link: "/quotes/42",
        channels: ["email", "push"],
      }),
    );
    const event = (await eventsOfType(db, organizationId, "notification.created")).find(
      (candidate) => candidate.payload.notificationId === id,
    );
    if (!id || !event) throw new Error("notify() published no delivery event");
    const listener = deliverNotificationListener(deliveryDependencies);
    await listener.handle(event, context());
    return { id, event, listener };
  }

  const notificationRow = (id: string) =>
    db.forOrg(organizationId, (tx) => tx.notification.findUniqueOrThrow({ where: { id } }));

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 4 });
    organizationId = await createTestOrganization(platform, "Deliveries");
  });

  beforeEach(() => {
    email = createMemoryEmailSender();
    push = createMemoryPushSender();
    profile = {
      id: organizationId,
      name: "Sharma Travels",
      code: "SHARMA",
      timeZone: "Asia/Kolkata",
      contactEmail: "hello@sharma.example",
    };
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("emails from the organization's name with its Reply-To and a way to opt out, and pushes every browser", async () => {
    for (const endpoint of ["https://push.example/asha-phone", "https://push.example/asha-laptop"]) {
      await db.forOrg(organizationId, (tx) =>
        savePushSubscription(tx, personIn(organizationId, asha), {
          endpoint,
          keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
        }),
      );
    }

    const { id } = await notifyAndDeliver(asha);

    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]).toMatchObject({
      to: { name: "Asha Owner", address: "asha@agency.example" },
      fromName: senderNameFor("Sharma Travels"),
      replyTo: "hello@sharma.example",
      subject: "Quotation opened",
      headers: { "List-Unsubscribe": "<https://app.example/settings/notifications>" },
    });
    expect(email.sent[0]?.text).toContain("https://app.example/quotes/42");
    expect(push.sent.map((sent) => sent.subscription.endpoint).sort()).toEqual([
      "https://push.example/asha-laptop",
      "https://push.example/asha-phone",
    ]);
    expect(push.sent[0]?.payload).toEqual({
      title: "Quotation opened",
      body: "Meera opened Quotation QT-2026-0042",
      url: "/quotes/42",
    });
    const row = await notificationRow(id);
    expect(row.emailedAt).toBeInstanceOf(Date);
    expect(row.pushedAt).toBeInstanceOf(Date);
  });

  it("sends nothing again when the same delivery runs twice", async () => {
    const { event, listener } = await notifyAndDeliver(asha);
    const sentEmails = email.sent.length;
    const sentPushes = push.sent.length;

    await listener.handle(event, context());

    expect(email.sent).toHaveLength(sentEmails);
    expect(push.sent).toHaveLength(sentPushes);
  });

  it("sends once when the same delivery runs twice at the same time", async () => {
    const slowEmail: EmailSender = {
      send: async (message) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        await email.send(message);
      },
    };
    const [id] = await db.forOrg(organizationId, (tx) =>
      notify(tx, systemActor(organizationId), {
        recipientUserIds: [asha],
        kind: "share-link.opened",
        title: "Quotation opened",
        body: "Meera opened Quotation QT-2026-0042",
        channels: ["email", "push"],
      }),
    );
    const event = (await eventsOfType(db, organizationId, "notification.created")).find(
      (candidate) => candidate.payload.notificationId === id,
    );
    if (!event) throw new Error("notify() published no delivery event");
    const listener = deliverNotificationListener(dependencies({ email: slowEmail }));

    await Promise.all([listener.handle(event, context()), listener.handle(event, context())]);

    expect(email.sent).toHaveLength(1);
  });

  it("leaves Reply-To out when the organization has no contact email", async () => {
    profile = { ...profile, contactEmail: null };
    await notifyAndDeliver(asha);
    expect(email.sent[0]?.replyTo).toBeUndefined();
  });

  it("respects opt-outs: a kind's own setting wins over every kind", async () => {
    const person = personIn(organizationId, asha);
    await db.forOrg(organizationId, (tx) => setPreference(tx, person, { channel: "email", kind: "*", optedOut: true }));
    await db.forOrg(organizationId, (tx) => setPreference(tx, person, { channel: "push", kind: "*", optedOut: true }));
    await db.forOrg(organizationId, (tx) =>
      setPreference(tx, person, { channel: "email", kind: "share-link.opened", optedOut: false }),
    );

    await notifyAndDeliver(asha);

    expect(email.sent).toHaveLength(1);
    expect(push.sent).toHaveLength(0);
    for (const channel of ["email", "push"] as const) {
      await db.forOrg(organizationId, (tx) => setPreference(tx, person, { channel, kind: "*", optedOut: false }));
    }
  });

  it("never emails staff without email, and still pushes to them", async () => {
    await db.forOrg(organizationId, (tx) =>
      savePushSubscription(tx, personIn(organizationId, ravi), {
        endpoint: "https://push.example/ravi",
        keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) },
      }),
    );
    await notifyAndDeliver(ravi);
    expect(email.sent).toEqual([]);
    expect(push.sent.map((sent) => sent.subscription.endpoint)).toEqual(["https://push.example/ravi"]);
  });

  it("sends nothing to someone who has left the organization", async () => {
    const { id } = await notifyAndDeliver(leaver);
    expect(email.sent).toEqual([]);
    expect(push.sent).toEqual([]);
    expect((await notificationRow(id)).emailedAt).toBeNull();
  });

  it("deletes a subscription the push service has forgotten, and keeps the others", async () => {
    push.markGone("https://push.example/asha-phone");
    await notifyAndDeliver(asha);
    const endpoints = await db.forOrg(organizationId, (tx) =>
      tx.pushSubscription.findMany({ where: { userId: asha }, select: { endpoint: true } }),
    );
    expect(endpoints).toEqual([{ endpoint: "https://push.example/asha-laptop" }]);
  });

  it("fails when email fails, so the job retries, and the retry sends it", async () => {
    const down: EmailSender = { send: () => Promise.reject(new Error("SMTP is down")) };
    await expect(notifyAndDeliver(asha, dependencies({ email: down }))).rejects.toThrow("SMTP is down");
    const event = (await eventsOfType(db, organizationId, "notification.created")).at(-1);
    const notificationId = event?.payload.notificationId;
    if (!event || typeof notificationId !== "string") throw new Error("no event");
    expect((await notificationRow(notificationId)).emailedAt).toBeNull();

    await deliverNotificationListener(dependencies()).handle(event, context());
    expect(email.sent).toHaveLength(1);
  });

  it("does nothing for a notification that isn't in the event's organization", async () => {
    const { event } = await notifyAndDeliver(asha);
    const otherOrganizationId = await createTestOrganization(platform, "Other deliveries");
    email = createMemoryEmailSender();
    await deliverNotificationListener(dependencies()).handle(
      { ...event, organizationId: otherOrganizationId },
      { actor: systemActor(otherOrganizationId), forOrg: (fn) => db.forOrg(otherOrganizationId, fn) },
    );
    expect(email.sent).toEqual([]);
  });
});
