// The Inbox's live updates (migration 20261218800000_inbox_live): saving a WhatsApp message or changing what a chat's row
// shows notifies inbox_live on commit, with ids and a word for what changed only; nothing else notifies, and a rolled-back
// change tells nobody. The listener opens its connection again when it is lost, and says so.
import { randomUUID } from "node:crypto";
import net from "node:net";
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

  /** Sends a marker and waits for it: everything committed before it has been heard (notifications come in commit order). */
  async function flushed(): Promise<number> {
    markers += 1;
    const marker = `marker-${String(markers)}`;
    await superuser.query("SELECT pg_notify($1, $2)", [INBOX_LIVE_CHANNEL, marker]);
    await until(() => heard.includes(marker), marker);
    return heard.indexOf(marker);
  }

  /** Everything heard of this test's organization because of `work`: between a marker sent before it and one after. */
  async function heardAfter(work: () => Promise<unknown>): Promise<Record<string, unknown>[]> {
    const from = await flushed();
    await work().catch(() => undefined);
    const to = await flushed();
    // Other test files share the database and its channel: only this test's organization counts.
    return heard
      .slice(from + 1, to)
      .filter((payload) => !payload.startsWith("marker-"))
      .map((payload) => JSON.parse(payload) as Record<string, unknown>)
      .filter((payload) => payload.organizationId === organizationId);
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

  it("tells of a chat's messages sent later, the AI's state in it and its team notes, and not of the AI's memory", async () => {
    const conversationId = await aChat();
    const chat = [{ organizationId, conversationId, change: "chat" }];
    expect(
      await heardAfter(() =>
        inOrganization((tx) =>
          tx.scheduledMessage.create({
            data: {
              conversationId,
              body: "See you",
              sendAt: new Date(Date.now() + 3_600_000),
              createdBy: randomUUID(),
            },
          }),
        ),
      ),
    ).toEqual(chat);
    const ai = await inOrganization((tx) => tx.aiChat.create({ data: { conversationId } }));
    const updateAi = (data: Record<string, unknown>) =>
      inOrganization((tx) => tx.aiChat.update({ where: { id: ai.id }, data: data }));
    expect(await heardAfter(() => updateAi({ turnState: "thinking", turnAt: new Date() }))).toEqual(chat);
    expect(await heardAfter(() => updateAi({ memory: "Likes beaches", repliesCount: { increment: 1 } }))).toEqual([]);
    // A note on a lead of the chat's person is shown in the chat.
    let leadId = "";
    // The chat gets its person (a change of its own, heard here so the note's is heard alone).
    await heardAfter(() =>
      inOrganization(async (tx) => {
        const person = await tx.person.create({ data: { name: "Meera Rao", phoneE164: `+91${digits()}` } });
        await tx.whatsappConversation.update({ where: { id: conversationId }, data: { personId: person.id } });
        leadId = (await tx.lead.create({ data: { personId: person.id, source: "whatsapp" } })).id;
      }),
    );
    expect(
      await heardAfter(() =>
        inOrganization((tx) => tx.leadNote.create({ data: { leadId, body: "Called, no answer" } })),
      ),
    ).toEqual(chat);
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

  it("drops a connection whose ping gets no answer, and listens again on a new one", async () => {
    // A proxy in front of Postgres that can go silent, as a connection does when a network drops it without a word.
    const target = new URL(urls.runtime);
    const silenced = new Set<net.Socket>();
    const sockets: net.Socket[] = [];
    const proxy = net.createServer((incoming) => {
      const outgoing = net.connect(Number(target.port), target.hostname);
      const forward = (from: net.Socket, to: net.Socket) =>
        from.on("data", (chunk) => {
          if (!silenced.has(incoming)) to.write(chunk);
        });
      forward(incoming, outgoing);
      forward(outgoing, incoming);
      incoming.on("error", () => outgoing.destroy());
      outgoing.on("error", () => incoming.destroy());
      sockets.push(incoming);
    });
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    const address = proxy.address() as net.AddressInfo;
    const viaProxy = new URL(urls.runtime);
    viaProxy.hostname = "127.0.0.1";
    viaProxy.port = String(address.port);
    let back = 0;
    const errors: unknown[] = [];
    const quiet = listenForNotifications(
      viaProxy.toString(),
      INBOX_LIVE_CHANNEL,
      { onNotification: () => undefined, onReconnected: () => (back += 1), onError: (error) => errors.push(error) },
      { retryMs: 50, maxRetryMs: 100, pingMs: 100, answerWithinMs: 300 },
    );
    try {
      await quiet.listening;
      for (const socket of sockets) silenced.add(socket);
      await until(() => back > 0, "the listener to open a new connection");
      expect(String(errors[0])).toContain("ping got no answer");
    } finally {
      await quiet.close();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => proxy.close(resolve));
    }
  });
});
