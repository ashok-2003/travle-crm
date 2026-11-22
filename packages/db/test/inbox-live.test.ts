// The Inbox's live updates (migration 20261218800000_inbox_live): saving a WhatsApp message or changing what a chat's row
// shows notifies inbox_live on commit, with ids and a word for what changed only; nothing else notifies, and a rolled-back
// change tells nobody. The listener opens its connection again when it is lost, and says so.
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import type { OrgTx } from "../src/for-org.js";
import {
  INBOX_LIVE_CHANNEL,
  listenerName,
  listenForNotifications,
  type NotificationListener,
} from "../src/notifications.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

const digits = () => String(Math.floor(Math.random() * 1e10)).padStart(10, "0");

async function until(check: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Waited in vain for ${what}`);
}

describe("inbox_live", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let superuser: pg.Client;
  let listener: NotificationListener;
  let organizationId: string;
  const heard: string[] = [];
  let reconnected = 0;
  let markers = 0;

  /** Everything heard after `work`, up to a marker sent once it is done (notifications arrive in commit order). */
  async function heardAfter(work: () => Promise<unknown>): Promise<Record<string, unknown>[]> {
    const from = heard.length;
    await work().catch(() => undefined);
    markers += 1;
    const marker = `marker-${String(markers)}`;
    await superuser.query("SELECT pg_notify($1, $2)", [INBOX_LIVE_CHANNEL, marker]);
    await until(() => heard.includes(marker), marker);
    return heard
      .slice(from, heard.indexOf(marker))
      .filter((payload) => !payload.startsWith("marker-"))
      .map((payload) => JSON.parse(payload) as Record<string, unknown>);
  }

  const inOrganization = <T>(work: (tx: OrgTx) => Promise<T>) => db.forOrg(organizationId, work);

  async function aChat(): Promise<string> {
    return inOrganization(async (tx) => {
      const connection = await tx.whatsappConnection.create({
        data: {
          integratedNumber: `91${digits()}`,
          displayNumber: "+910000000000",
          mode: "new_number",
          status: "disconnected",
        },
      });
      const chat = await tx.whatsappConversation.create({
        data: { connectionId: connection.id, phoneE164: `+91${digits()}` },
      });
      return chat.id;
    });
  }

  const aMessage = (conversationId: string, fields: Record<string, unknown>) =>
    inOrganization((tx) =>
      tx.whatsappMessage.create({
        data: { conversationId, kind: "text", body: "Hello", occurredAt: new Date(), ...fields } as never,
      }),
    );

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    superuser = new pg.Client({ connectionString: urls.superuser });
    await superuser.connect();
    organizationId = await createTestOrganization(platform, "Inbox live");
    listener = listenForNotifications(
      urls.runtime,
      INBOX_LIVE_CHANNEL,
      {
        onNotification: (payload) => heard.push(payload),
        onReconnected: () => {
          reconnected += 1;
        },
      },
      { retryMs: 50, maxRetryMs: 200 },
    );
    await listener.listening;
  });

  afterAll(async () => {
    await listener.close();
    await superuser.end();
    await db.disconnect();
    await platform.$disconnect();
  });

  it("tells of a customer's message with its chat's ids, marked as the customer's, and of ours without the mark", async () => {
    const conversationId = await aChat();
    expect(
      await heardAfter(() => aMessage(conversationId, { direction: "in", origin: "customer", status: "received" })),
    ).toEqual([{ organizationId, conversationId, change: "message", direction: "in" }]);
    expect(
      await heardAfter(() =>
        aMessage(conversationId, { direction: "out", origin: "staff_crm", status: "queued", sentBy: randomUUID() }),
      ),
    ).toEqual([{ organizationId, conversationId, change: "message" }]);
    // A reaction is not the customer writing, and the history import is not new.
    expect(
      await heardAfter(() =>
        aMessage(conversationId, { direction: "in", origin: "customer", status: "received", kind: "reaction" }),
      ),
    ).toEqual([{ organizationId, conversationId, change: "message" }]);
    expect(
      await heardAfter(() => aMessage(conversationId, { direction: "in", origin: "history", status: "received" })),
    ).toEqual([{ organizationId, conversationId, change: "message" }]);
  });

  it("tells of a status moved and of what a bubble shows, and of nothing else about a message", async () => {
    const conversationId = await aChat();
    const message = await aMessage(conversationId, {
      direction: "out",
      origin: "staff_crm",
      status: "queued",
      mediaState: "pending",
    });
    const update = (data: Record<string, unknown>) =>
      inOrganization((tx) => tx.whatsappMessage.update({ where: { id: message.id }, data: data }));
    expect(await heardAfter(() => update({ status: "sent", sentAt: new Date() }))).toEqual([
      { organizationId, conversationId, change: "status" },
    ]);
    expect(await heardAfter(() => update({ mediaState: "stored" }))).toEqual([
      { organizationId, conversationId, change: "message" },
    ]);
    expect(await heardAfter(() => update({ mediaAttempts: { increment: 1 }, wamid: `wamid.${digits()}` }))).toEqual([]);
  });

  it("tells of what a chat's row shows, and not of its last message's time alone", async () => {
    const conversationId = await aChat();
    const update = (data: Record<string, unknown>) =>
      inOrganization((tx) => tx.whatsappConversation.update({ where: { id: conversationId }, data: data }));
    expect(await heardAfter(() => update({ archivedAt: new Date() }))).toEqual([
      { organizationId, conversationId, change: "chat" },
    ]);
    expect(await heardAfter(() => update({ lastMessageAt: new Date(), lastInboundAt: new Date() }))).toEqual([]);
    const tag = await inOrganization((tx) => tx.inboxTag.create({ data: { name: `Tag ${digits()}` } }));
    expect(
      await heardAfter(() =>
        inOrganization((tx) => tx.conversationTag.create({ data: { conversationId, tagId: tag.id } })),
      ),
    ).toEqual([{ organizationId, conversationId, change: "chat" }]);
  });

  it("tells nobody of a change that was rolled back", async () => {
    const conversationId = await aChat();
    expect(
      await heardAfter(() =>
        inOrganization(async (tx) => {
          await tx.whatsappMessage.create({
            data: {
              conversationId,
              direction: "in",
              origin: "customer",
              kind: "text",
              status: "received",
              occurredAt: new Date(),
            },
          });
          throw new Error("rolled back");
        }),
      ),
    ).toEqual([]);
  });

  it("listens again after its connection is lost, and says so", async () => {
    const before = reconnected;
    await superuser.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = $1", [
      listenerName(INBOX_LIVE_CHANNEL),
    ]);
    await until(() => reconnected > before, "the listener to come back");
    const conversationId = await aChat();
    expect(await heardAfter(() => update(conversationId))).toEqual([
      { organizationId, conversationId, change: "chat" },
    ]);
  });

  const update = (conversationId: string) =>
    inOrganization((tx) =>
      tx.whatsappConversation.update({ where: { id: conversationId }, data: { needsReply: true } }),
    );
});
