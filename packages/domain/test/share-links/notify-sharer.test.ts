// When a shared link is opened, the person who shared it is told: in the bell, and by email and push. A link the
// system made tells nobody, nor does one shared by someone who has since left, and a listener that runs again for the
// same event tells them once. However long the link's label, the title fits.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runListenerJob, type DomainEvent } from "../../src/jobs/index.js";
import { systemActor, type Actor } from "../../src/kernel/index.js";
import { setPreference } from "../../src/notifications/index.js";
import {
  createShareLink,
  findShareLink,
  notifySharerListener,
  recordShareLinkOpen,
} from "../../src/share-links/index.js";
import { deliver, useDeliveryKit } from "../notifications/delivery-kit.js";
import { eventsOfType, personIn } from "../notifications/test-support.js";

describe("telling the sharer a link was opened", () => {
  const kit = useDeliveryKit("Notify sharer");

  const listener = () =>
    notifySharerListener({
      memberContacts: (organizationId, userIds) => kit.dependencies().memberContacts(organizationId, userIds),
    });

  /** Shares a record as actor, opens the link, and runs the listener on the event the open published. */
  async function shareOpenAndListen(actor: Actor, label: string) {
    const link = await kit.db.forOrg(actor.organizationId, (tx) =>
      createShareLink(tx, actor, { recordType: "issued_document", recordId: randomUUID(), label }),
    );
    const opened = await findShareLink(kit.db, link.token);
    await recordShareLinkOpen(kit.db, opened, { ipAddress: "203.0.113.5", userAgent: "Mozilla/5.0", preview: false });
    const event = await kit.db.forOrg(actor.organizationId, (tx) =>
      tx.outboxEvent.findFirstOrThrow({
        where: { type: "share-link.opened", payload: { path: ["shareLinkId"], equals: link.shareLinkId } },
      }),
    );
    const data = { organizationId: actor.organizationId, eventId: event.id, eventType: event.type };
    const outcome = await runListenerJob({ db: kit.db, listener: listener(), data });
    return { data, event, outcome };
  }

  const notificationsFor = (userId: string) =>
    kit.db.forOrg(kit.organizationId, (tx) => tx.notification.findMany({ where: { recipientUserId: userId } }));

  /** The event that asks for a notification's delivery. */
  async function deliveryOf(notificationId: string | undefined): Promise<DomainEvent> {
    const events = await eventsOfType(kit.db, kit.organizationId, "notification.created");
    const event = events.find((candidate) => candidate.payload.notificationId === notificationId);
    if (!event) throw new Error(`no delivery event for notification ${String(notificationId)}`);
    return event;
  }

  it("puts a notification in the sharer's bell, to be emailed and pushed, keyed on the event", async () => {
    const agent = personIn(kit.organizationId, kit.addMember("asha@agency.example"));
    const { outcome, event } = await shareOpenAndListen(agent, "Quotation DOC-2026-0007");
    expect(outcome).toBe("handled");
    const notifications = await notificationsFor(agent.userId);
    expect(notifications).toMatchObject([
      {
        kind: "share-link.opened",
        title: "Opened: Quotation DOC-2026-0007",
        body: "The link you shared has just been opened.",
        sourceEventId: event.id,
      },
    ]);
    expect((await deliveryOf(notifications[0]?.id)).payload).toEqual({
      notificationId: notifications[0]?.id,
      channels: ["email", "push"],
    });
  });

  it("tells nobody about a link the system made", async () => {
    const system = systemActor(kit.organizationId);
    expect((await shareOpenAndListen(system, "Voucher DOC-2026-0008")).outcome).toBe("handled");
    const titled = await kit.db.forOrg(kit.organizationId, (tx) =>
      tx.notification.findMany({ where: { title: "Opened: Voucher DOC-2026-0008" } }),
    );
    expect(titled).toEqual([]);
  });

  it("tells nobody about a link shared by someone who has left: no bell, no email, no push", async () => {
    // Not an active member: memberContacts leaves them out, as it does anyone removed or banned.
    const leaver = personIn(kit.organizationId);
    expect((await shareOpenAndListen(leaver, "Quotation DOC-2026-0010")).outcome).toBe("handled");
    expect(await notificationsFor(leaver.userId)).toEqual([]);
  });

  it("puts an opted-out sharer's notification in the bell, and pushes it, but doesn't email it", async () => {
    const agent = personIn(kit.organizationId, kit.addMember("ravi@agency.example"));
    await kit.db.forOrg(kit.organizationId, (tx) =>
      setPreference(tx, agent, { channel: "email", kind: "share-link.opened", optedOut: true }),
    );
    await kit.subscribe(agent.userId, "phone");
    await shareOpenAndListen(agent, "Quotation DOC-2026-0011");
    const [notification] = await notificationsFor(agent.userId);
    expect(notification?.title).toBe("Opened: Quotation DOC-2026-0011");

    await deliver(kit, await deliveryOf(notification?.id));
    expect(kit.email.sent).toEqual([]);
    expect(kit.push.sent.map((sent) => sent.payload.title)).toEqual(["Opened: Quotation DOC-2026-0011"]);
  });

  it("fits a long label into the title with an ellipsis, never splitting a character", async () => {
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}";
    const ksha = "\u0915\u094D\u0937";
    const labels = {
      longest: `Quotation ${"x".repeat(190)}`,
      // The cut falls on the emoji: both halves of the surrogate pair go, not just one.
      emojiAtTheCut: `${"a".repeat(110)}\u{1F600}${"b".repeat(88)}`,
      // A family emoji is four emoji joined by zero-width joiners, and "ksha" a conjunct of three code points: each
      // is one character to a reader, so it goes whole or stays whole.
      familyAtTheCut: `${"a".repeat(105)}${family}${"b".repeat(84)}`,
      conjunctAtTheCut: `${"a".repeat(109)}${ksha}${"b".repeat(88)}`,
      justFits: "q".repeat(112),
    };
    const titles: Record<string, string | undefined> = {};
    for (const [name, label] of Object.entries(labels)) {
      const agent = personIn(kit.organizationId, kit.addMember(`${name.toLowerCase()}@agency.example`));
      expect((await shareOpenAndListen(agent, label)).outcome).toBe("handled");
      titles[name] = (await notificationsFor(agent.userId))[0]?.title;
    }
    expect(titles.longest).toBe(`Opened: Quotation ${"x".repeat(101)}…`);
    expect(titles.emojiAtTheCut).toBe(`Opened: ${"a".repeat(110)}…`);
    expect(titles.familyAtTheCut).toBe(`Opened: ${"a".repeat(105)}…`);
    expect(titles.conjunctAtTheCut).toBe(`Opened: ${"a".repeat(109)}…`);
    expect(titles.justFits).toBe(`Opened: ${labels.justFits}`);
    for (const title of Object.values(titles)) {
      expect(title?.length).toBeLessThanOrEqual(120);
      expect(title?.isWellFormed()).toBe(true);
    }
  });

  it("tells the sharer once, however often the listener runs for the same event", async () => {
    const agent = personIn(kit.organizationId, kit.addMember("meera@agency.example"));
    const { data, event } = await shareOpenAndListen(agent, "Quotation DOC-2026-0009");
    expect(await runListenerJob({ db: kit.db, listener: listener(), data })).toBe("already-handled");
    // Even a run that gets past the processed-event record (two overlapping deliveries) adds nothing.
    await listener().handle(
      {
        id: event.id,
        organizationId: event.organizationId,
        type: event.type,
        payload: event.payload as Record<string, string>,
        occurredAt: event.occurredAt,
      },
      kit.context(),
    );
    expect(await notificationsFor(agent.userId)).toHaveLength(1);
  });
});
