// The sales inbox's procedures through the HTTP app (salesInbox.*; sales inbox spec 6): who may call each, and that a chat
// out of a member's scope is "not found" for every one of them: counts, notes, snooze, schedule, typing and stars. A note is a
// note on the chat's lead, a mention tells only who may see it, and a time past the 24-hour window is refused with its reason.
import { randomUUID } from "node:crypto";
import type {
  ChatMessagePage,
  ConversationHeader,
  ConversationNoteList,
  ConversationPage,
  InboxSummary,
  ScheduledMessage,
} from "@travel-crm/contracts/inbox";
import { upsertRoute } from "@travel-crm/domain/inbox";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff, type TestStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";
import { aWhatsApp, signer } from "./support/whatsapp.js";

const HOUR = 3_600_000;

describe("the sales inbox, through the api", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;
  let conversationId: string;
  let messageId: string;
  let leadId: string;
  /** A salesperson who owns the chat's lead, one who owns none, and a teammate with no inbox at all. */
  let seller: { staff: TestStaff; jar: CookieJar };
  let stranger: { staff: TestStaff; jar: CookieJar };
  let operations: { staff: TestStaff; jar: CookieJar };
  const business = `9199${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const customer = `9187${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

  const staffJar = async (username: string, roleKey: string) => {
    const staff = await addStaff(server, agency, { username, roleKey });
    return { staff, jar: await signedInStaff(server, agency, staff) };
  };

  beforeAll(async () => {
    server = createTestServer({}, { whatsappFor: aWhatsApp });
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
    const connectionId = await server.db.forOrg(agency.organizationId, async (tx) => {
      const row = await tx.whatsappConnection.create({
        data: {
          integratedNumber: business,
          displayNumber: `+${business}`,
          mode: "new_number",
          status: "connected",
          connectedAt: new Date(),
        },
        select: { id: true },
      });
      return row.id;
    });
    await upsertRoute(server.db, { integratedNumber: business, organizationId: agency.organizationId, connectionId });
    const body = signer.body([
      signer.inbound({
        integratedNumber: business,
        customerNumber: customer,
        wamid: `wamid.${randomUUID()}`,
        customerName: "Priya",
        text: "Goa in December?",
        ts: Math.floor(Date.now() / 1000),
      }),
    ]);
    await server.app.request(signer.path, { method: "POST", headers: signer.headers, body });
    // This file's own number only: the files of the run share one database, and another's events are not ours.
    const mine = { provider: "msg91-whatsapp", payload: { contains: business } };
    for (const event of await server.platform.webhookEvent.findMany({ where: mine })) {
      const { processWebhookEvent } = await import("@travel-crm/domain/webhooks");
      await processWebhookEvent({ db: server.db, providers: [server.whatsapp?.provider ?? failing()] }, event.id);
    }
    const list = await dataOf<ConversationPage>(await query(server, "inbox.conversations", owner, { filter: "all" }));
    conversationId = list.items[0]?.id ?? "";
    const messages = await dataOf<ChatMessagePage>(await query(server, "inbox.messages", owner, { conversationId }));
    messageId = messages.items[0]?.id ?? "";
    leadId = (await server.db.forOrg(agency.organizationId, (tx) => tx.lead.findFirstOrThrow())).id;
    seller = await staffJar("asha", "sales");
    stranger = await staffJar("ravi", "sales");
    operations = await staffJar("neha", "operations");
    await server.db.forOrg(agency.organizationId, (tx) =>
      tx.lead.update({ where: { id: leadId }, data: { ownerUserId: seller.staff.userId } }),
    );
  });
  afterAll(() => server.close());

  const failing = (): never => {
    throw new Error("no whatsapp");
  };

  it("counts for the Owner and the lead's owner, and for a salesperson who owns no lead counts nothing", async () => {
    const mine = await dataOf<InboxSummary>(await query(server, "salesInbox.summary", seller.jar));
    expect(mine).toMatchObject({ waiting: 1, unread: 1, mine: 1 });
    const theirs = await dataOf<InboxSummary>(await query(server, "salesInbox.summary", stranger.jar));
    expect(theirs).toMatchObject({ waiting: 0, unread: 0, mine: 0, snoozed: 0 });
    expect(await dataOf<InboxSummary>(await query(server, "salesInbox.summary", owner))).toMatchObject({ waiting: 1 });
  });

  it("keeps the inbox's procedures from a member without the inbox", async () => {
    for (const [path, input] of [
      ["salesInbox.summary", undefined],
      ["salesInbox.notes", { conversationId }],
      ["salesInbox.scheduled", { conversationId }],
    ] as const) {
      expect((await refusalOf(await query(server, path, operations.jar, input))).status).toBe(403);
    }
    expect(
      (await refusalOf(await mutate(server, "salesInbox.typing", { conversationId }, operations.jar))).status,
    ).toBe(403);
  });

  it("keeps the agency's automatic answers from anyone who does not write templates", async () => {
    for (const path of ["salesInbox.automation", "salesInbox.keywordReplies"]) {
      expect((await refusalOf(await query(server, path, seller.jar))).status).toBe(403);
      expect((await refusalOf(await query(server, path, operations.jar))).status).toBe(403);
    }
    expect(
      (
        await refusalOf(
          await mutate(server, "salesInbox.createKeywordReply", { keyword: "price", reply: "30,000" }, seller.jar),
        )
      ).status,
    ).toBe(403);
  });

  it("answers a chat outside a member's scope as not found, whatever they try", async () => {
    const calls: [string, unknown][] = [
      ["salesInbox.star", { messageId, on: true }],
      ["salesInbox.snooze", { conversationId, until: new Date(Date.now() + HOUR).toISOString() }],
      ["salesInbox.addNote", { conversationId, body: "hello", mentions: [] }],
      ["salesInbox.schedule", { conversationId, body: "hello", sendAt: new Date(Date.now() + HOUR).toISOString() }],
      ["salesInbox.cancelScheduled", { scheduledId: randomUUID() }],
      ["salesInbox.typing", { conversationId }],
    ];
    for (const [path, input] of calls) {
      expect((await refusalOf(await mutate(server, path, input, stranger.jar))).status, path).toBe(404);
    }
    for (const path of ["salesInbox.notes", "salesInbox.scheduled"]) {
      expect((await refusalOf(await query(server, path, stranger.jar, { conversationId }))).status, path).toBe(404);
    }
  });

  it("shows who else is replying only for a chat the asker may see, and never the asker themselves", async () => {
    await dataOf(await mutate(server, "salesInbox.typing", { conversationId }, seller.jar));
    const asOwner = await dataOf<ConversationHeader>(
      await query(server, "inbox.conversation", owner, { conversationId }),
    );
    expect(asOwner.replying).toEqual(["asha"]);
    const asSeller = await dataOf<ConversationHeader>(
      await query(server, "inbox.conversation", seller.jar, { conversationId }),
    );
    expect(asSeller.replying).toEqual([]);
    // A stranger's mark never lands: the chat is not theirs to see.
    await mutate(server, "salesInbox.typing", { conversationId }, stranger.jar);
    expect(
      (await dataOf<ConversationHeader>(await query(server, "inbox.conversation", owner, { conversationId }))).replying,
    ).toEqual(["asha"]);
  });

  it("writes a note on the chat's lead, tells a mentioned teammate who may see it and no one else", async () => {
    const note = await dataOf<{ id: string; body: string }>(
      await mutate(
        server,
        "salesInbox.addNote",
        {
          conversationId,
          body: "@asha @ravi please call back",
          mentions: [seller.staff.userId, stranger.staff.userId],
        },
        owner,
      ),
    );
    expect(note.body).toBe("@asha @ravi please call back");
    const notes = await dataOf<ConversationNoteList>(
      await query(server, "salesInbox.notes", seller.jar, { conversationId }),
    );
    expect(notes.leadId).toBe(leadId);
    expect(notes.items.map((item) => item.body)).toEqual(["@asha @ravi please call back"]);
    const told = async (userId: string) =>
      server.db.forOrg(agency.organizationId, (tx) =>
        tx.notification.count({ where: { recipientUserId: userId, kind: "inbox.mentioned" } }),
      );
    expect(await told(seller.staff.userId)).toBe(1);
    expect(await told(stranger.staff.userId)).toBe(0);
    expect(
      (
        await refusalOf(
          await mutate(server, "salesInbox.addNote", { conversationId, body: "x", mentions: [randomUUID()] }, owner),
        )
      ).status,
    ).toBe(404);
  });

  it("refuses a time past the 24-hour window with its reason, takes one inside it, and snoozes until a message wakes the chat", async () => {
    const late = await refusalOf(
      await mutate(
        server,
        "salesInbox.schedule",
        { conversationId, body: "Your quote", sendAt: new Date(Date.now() + 30 * HOUR).toISOString() },
        seller.jar,
      ),
    );
    expect(late).toEqual({ status: 409, reason: "SCHEDULE_OUTSIDE_WINDOW" });
    const scheduled = await dataOf<ScheduledMessage>(
      await mutate(
        server,
        "salesInbox.schedule",
        { conversationId, body: "Your quote", sendAt: new Date(Date.now() + 5 * HOUR).toISOString() },
        seller.jar,
      ),
    );
    expect(scheduled.status).toBe("pending");
    await dataOf(await mutate(server, "salesInbox.cancelScheduled", { scheduledId: scheduled.id }, seller.jar));

    await dataOf(
      await mutate(
        server,
        "salesInbox.snooze",
        { conversationId, until: new Date(Date.now() + 48 * HOUR).toISOString() },
        seller.jar,
      ),
    );
    const snoozed = await dataOf<ConversationPage>(
      await query(server, "inbox.conversations", seller.jar, { filter: "snoozed" }),
    );
    expect(snoozed.items).toHaveLength(1);
    const wake = signer.body([
      signer.inbound({
        integratedNumber: business,
        customerNumber: customer,
        wamid: `wamid.${randomUUID()}`,
        text: "Hello? Anyone?",
        ts: Math.floor(Date.now() / 1000),
      }),
    ]);
    await server.app.request(signer.path, { method: "POST", headers: signer.headers, body: wake });
    const { processWebhookEvent } = await import("@travel-crm/domain/webhooks");
    for (const event of await server.platform.webhookEvent.findMany({
      // This file's own number only: the files of the run share one database, and another's events are not ours to process.
      where: { provider: "msg91-whatsapp", processedAt: null, payload: { contains: business } },
    })) {
      await processWebhookEvent({ db: server.db, providers: [server.whatsapp?.provider ?? failing()] }, event.id);
    }
    const after = await dataOf<ConversationPage>(
      await query(server, "inbox.conversations", seller.jar, { filter: "all" }),
    );
    expect(after.items.map((item) => item.id)).toEqual([conversationId]);
    expect((await dataOf<InboxSummary>(await query(server, "salesInbox.summary", seller.jar))).snoozed).toBe(0);
  });
});
