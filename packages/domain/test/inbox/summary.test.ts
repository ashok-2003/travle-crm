// The counts above the inbox (sales inbox spec 6), one summary for the chips and the pipeline, of the chats a member may see:
// waiting, late, unread, theirs, unassigned and snoozed, and the chats by their lead's stage.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { markConversationRead, summaryOf, unreadCounts, unreadIdsOf } from "../../src/inbox/index.js";
import { aLead, aPerson, freshPhone } from "../crm/support/records.js";
import { memberOf } from "../imports/support/test-imports.js";
import { aConnectedAgency, createTestInbox, testNow, type TestInbox } from "./support.js";

const MINUTE = 60_000;
const ago = (minutes: number) => new Date(testNow.getTime() - minutes * MINUTE);

describe("the inbox summary", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /** An agency with chats in every state a count tells apart; "me" owns chat A's lead. */
  async function agency() {
    const connection = await aConnectedAgency(test);
    const me = randomUUID();
    const someoneElse = randomUUID();
    const ids = await test.db.forOrg(connection.organizationId, async (tx) => {
      const chat = async (
        lead: { stage: "new" | "contacted" | "quote_sent" | "won"; ownerUserId: string | null } | null,
        over: Record<string, unknown> = {},
      ) => {
        const person = lead === null ? null : await aPerson(tx);
        if (lead !== null && person !== null) await aLead(tx, { personId: person.id, ...lead });
        return (
          await tx.whatsappConversation.create({
            data: {
              connectionId: connection.connectionId,
              phoneE164: freshPhone(),
              personId: person?.id ?? null,
              lastMessageAt: testNow,
              ...over,
            },
          })
        ).id;
      };
      const a = await chat({ stage: "new", ownerUserId: me }, { needsReply: true, lastInboundAt: ago(30) });
      const b = await chat({ stage: "contacted", ownerUserId: null }, { needsReply: true, lastInboundAt: ago(5) });
      const c = await chat({ stage: "quote_sent", ownerUserId: someoneElse }, { lastInboundAt: ago(60) });
      await chat({ stage: "new", ownerUserId: me }, { needsReply: true, lastInboundAt: ago(10), archivedAt: ago(1) });
      await chat({ stage: "won", ownerUserId: me }, { lastInboundAt: ago(10), snoozedUntil: ago(-120) });
      await chat({ stage: "new", ownerUserId: me }, { needsReply: true, lastInboundAt: ago(10), hidden: true });
      await chat({ stage: "new", ownerUserId: me }, { lastInboundAt: ago(10), state: "erased" });
      const h = await chat(null, { needsReply: true, lastInboundAt: ago(1) });
      return { a, b, c, h };
    });
    return { connection, me, ids };
  }

  it("counts what an Admin may see, once each, leaving out archived, snoozed, hidden and erased chats", async () => {
    const { connection, me, ids } = await agency();
    const admin = memberOf(connection.organizationId, "org-admin", { userId: me });
    await test.db.forOrg(connection.organizationId, async (tx) => {
      await markConversationRead(tx, admin, ids.b, ago(1));
      await markConversationRead(tx, admin, ids.c, ago(30));
    });
    const summary = await test.db.forOrg(connection.organizationId, (tx) => summaryOf(tx, admin, testNow));
    expect(summary).toEqual({
      waiting: 3,
      late: 1,
      unread: 2,
      mine: 1,
      unassigned: 1,
      snoozed: 1,
      stages: { new: 1, contacted: 1, quote_sent: 1, booking_requested: 0, won: 0 },
    });
  });

  it("counts only the chats of a salesperson's own leads for them", async () => {
    const { connection, me } = await agency();
    const seller = memberOf(connection.organizationId, "sales", { userId: me });
    const summary = await test.db.forOrg(connection.organizationId, (tx) => summaryOf(tx, seller, testNow));
    expect(summary).toEqual({
      waiting: 1,
      late: 1,
      unread: 1,
      mine: 1,
      unassigned: 0,
      snoozed: 1,
      stages: { new: 1, contacted: 0, quote_sent: 0, booking_requested: 0, won: 0 },
    });
  });

  it("gives a chat's unread count from its read mark, at most 99, and the newest unread chats first when there are many", async () => {
    const { connection, me, ids } = await agency();
    const admin = memberOf(connection.organizationId, "org-admin", { userId: me });
    await test.db.forOrg(connection.organizationId, async (tx) => {
      await tx.whatsappMessage.createMany({
        data: Array.from({ length: 120 }, (_, index) => ({
          conversationId: ids.a,
          direction: "in",
          origin: "customer",
          kind: "text",
          body: `m${String(index)}`,
          status: "received",
          occurredAt: ago(20 - index / 10),
        })),
      });
      await tx.whatsappMessage.create({
        data: {
          conversationId: ids.b,
          direction: "in",
          origin: "customer",
          kind: "reaction",
          reaction: "👍",
          status: "received",
          occurredAt: ago(2),
        },
      });
    });
    const counts = await test.db.forOrg(connection.organizationId, (tx) =>
      unreadCounts(tx, admin, [ids.a, ids.b, ids.c]),
    );
    expect(counts.get(ids.a)).toBe(99);
    expect(counts.get(ids.b) ?? 0).toBe(0);
    const unreadIds = await test.db.forOrg(connection.organizationId, (tx) => unreadIdsOf(tx, admin));
    expect(unreadIds).toEqual(expect.arrayContaining([ids.a, ids.h, ids.b]));
    // Newest message first, so a cut at the limit drops the oldest.
    expect(unreadIds.indexOf(ids.h)).toBeLessThan(unreadIds.indexOf(ids.b));
  });
});
