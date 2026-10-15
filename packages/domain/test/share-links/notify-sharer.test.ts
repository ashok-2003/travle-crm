// When a shared link is opened, the person who shared it is told: in the bell, and by email and push. A link the
// system made tells nobody, and a listener that runs again for the same event tells them once.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { runListenerJob, type ListenerContext } from "../../src/jobs/index.js";
import { systemActor, type Actor } from "../../src/kernel/index.js";
import { createShareLink, notifySharerListener, openShareLink } from "../../src/share-links/index.js";

describe("telling the sharer a link was opened", () => {
  let platform: PlatformClient;
  let db: Database;
  let agent: Actor;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    const organizationId = await createTestOrganization(platform, "Notify sharer");
    agent = { organizationId, userId: randomUUID(), source: "web", impersonatedBy: null };
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  /** Shares a record as actor, opens the link, and runs the listener on the event the open published. */
  async function shareOpenAndListen(actor: Actor, label: string) {
    const link = await db.forOrg(actor.organizationId, (tx) =>
      createShareLink(tx, actor, { recordType: "issued_document", recordId: randomUUID(), label }),
    );
    await openShareLink(db, link.token, { ipAddress: "203.0.113.5", userAgent: "Mozilla/5.0", preview: false });
    const event = await db.forOrg(actor.organizationId, (tx) =>
      tx.outboxEvent.findFirstOrThrow({
        where: { type: "share-link.opened", payload: { path: ["shareLinkId"], equals: link.shareLinkId } },
      }),
    );
    const data = { organizationId: actor.organizationId, eventId: event.id, eventType: event.type };
    const outcome = await runListenerJob({ db, listener: notifySharerListener(), data });
    return { data, event, outcome };
  }

  const notificationsTitled = (title: string) =>
    db.forOrg(agent.organizationId, (tx) => tx.notification.findMany({ where: { title } }));

  it("puts a notification in the sharer's bell, to be emailed and pushed, keyed on the event", async () => {
    const { outcome, event } = await shareOpenAndListen(agent, "Quotation DOC-2026-0007");
    expect(outcome).toBe("handled");
    const notifications = await notificationsTitled("Opened: Quotation DOC-2026-0007");
    expect(notifications).toMatchObject([
      {
        recipientUserId: agent.userId,
        kind: "share-link.opened",
        body: "The link you shared has just been opened.",
        sourceEventId: event.id,
      },
    ]);
    const delivery = await db.forOrg(agent.organizationId, (tx) =>
      tx.outboxEvent.findMany({ where: { type: "notification.created" } }),
    );
    expect(delivery.map((published) => published.payload)).toContainEqual({
      notificationId: notifications[0]?.id,
      channels: ["email", "push"],
    });
  });

  it("tells nobody about a link the system made", async () => {
    const system = systemActor(agent.organizationId);
    expect((await shareOpenAndListen(system, "Voucher DOC-2026-0008")).outcome).toBe("handled");
    expect(await notificationsTitled("Opened: Voucher DOC-2026-0008")).toEqual([]);
  });

  it("tells the sharer once, however often the listener runs for the same event", async () => {
    const { data, event } = await shareOpenAndListen(agent, "Quotation DOC-2026-0009");
    expect(await runListenerJob({ db, listener: notifySharerListener(), data })).toBe("already-handled");
    // Even a run that gets past the processed-event record (two overlapping deliveries) adds nothing.
    const context: ListenerContext = {
      actor: systemActor(agent.organizationId),
      forOrg: (fn) => db.forOrg(agent.organizationId, fn),
    };
    await notifySharerListener().handle(
      {
        id: event.id,
        organizationId: event.organizationId,
        type: event.type,
        payload: event.payload as Record<string, string>,
        occurredAt: event.occurredAt,
      },
      context,
    );
    expect(await notificationsTitled("Opened: Quotation DOC-2026-0009")).toHaveLength(1);
  });
});
