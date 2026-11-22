// The inbox's Answered by the AI filter (the AI agent page's Chats answered opens it): the chats the AI wrote in during the
// last 24 hours, archived and snoozed ones too, within the member's inbox scope, as many as the overview counts.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiOverviewOf } from "../../src/ai/overview.js";
import { listConversations } from "../../src/inbox/index.js";
import type { OrgTx } from "@travel-crm/db";
import { aLead, aPerson, freshPhone } from "../crm/support/records.js";
import { memberOf } from "../imports/support/test-imports.js";
import { aConnectedAgency, createTestInbox, testNow, type TestInbox } from "./support.js";

const HOUR = 3_600_000;
const hoursAgo = (hours: number) => new Date(testNow.getTime() - hours * HOUR);

describe("the inbox's Answered by the AI filter", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /** A chat of a person with a lead owned by `ownerUserId`, and its messages: the AI's ("ai:" token) or a person's. */
  async function chat(
    tx: OrgTx,
    connectionId: string,
    ownerUserId: string,
    messages: { at: Date; by: "ai" | "staff" }[],
    over: { archivedAt?: Date; snoozedUntil?: Date; hidden?: boolean } = {},
  ) {
    const person = await aPerson(tx);
    await aLead(tx, { personId: person.id, stage: "contacted", ownerUserId });
    const conversation = await tx.whatsappConversation.create({
      data: {
        connectionId,
        phoneE164: freshPhone(),
        personId: person.id,
        lastMessageAt: messages.at(-1)?.at ?? null,
        ...over,
      },
    });
    for (const message of messages) {
      await tx.whatsappMessage.create({
        data: {
          conversationId: conversation.id,
          direction: "out",
          origin: "staff_crm",
          kind: "text",
          body: "Hello",
          clientToken: message.by === "ai" ? `ai:${randomUUID()}` : randomUUID(),
          status: "sent",
          occurredAt: message.at,
        },
      });
    }
    return conversation.id;
  }

  async function agency() {
    const connection = await aConnectedAgency(test);
    const seller = randomUUID();
    const other = randomUUID();
    const ids = await test.db.forOrg(connection.organizationId, async (tx) => {
      const make = (owner: string, messages: { at: Date; by: "ai" | "staff" }[], over = {}) =>
        chat(tx, connection.connectionId, owner, messages, over);
      return {
        twiceToday: await make(seller, [
          { at: hoursAgo(5), by: "ai" },
          { at: hoursAgo(1), by: "ai" },
        ]),
        othersToday: await make(other, [{ at: hoursAgo(23), by: "ai" }]),
        archived: await make(other, [{ at: hoursAgo(2), by: "ai" }], { archivedAt: hoursAgo(1) }),
        snoozed: await make(seller, [{ at: hoursAgo(3), by: "ai" }], {
          snoozedUntil: new Date(testNow.getTime() + HOUR),
        }),
        yesterday: await make(seller, [{ at: hoursAgo(25), by: "ai" }]),
        staffOnly: await make(seller, [{ at: hoursAgo(1), by: "staff" }]),
        blocked: await make(other, [{ at: hoursAgo(1), by: "ai" }], { hidden: true }),
      };
    });
    return { connection, seller, ids };
  }

  /** Every chat the filter lists for the member, page after page. */
  async function listed(organizationId: string, member: ReturnType<typeof memberOf>, limit = 2) {
    const seen: string[] = [];
    let before: string | undefined;
    for (;;) {
      const page = await test.db.forOrg(organizationId, (tx) =>
        listConversations(tx, member, { filter: "ai_answered", limit, ...(before && { before }) }, testNow),
      );
      seen.push(...page.items.map((item) => item.id));
      if (page.nextCursor === null) return seen;
      before = page.nextCursor;
    }
  }

  it("lists each chat the AI wrote in during the last 24 hours once, archived and snoozed ones too", async () => {
    const { connection, ids } = await agency();
    const admin = memberOf(connection.organizationId, "org-admin");
    expect((await listed(connection.organizationId, admin)).sort()).toEqual(
      [ids.twiceToday, ids.othersToday, ids.archived, ids.snoozed].sort(),
    );
  });

  it("lists as many chats as the overview's Chats answered counts, at the same moment", async () => {
    const { connection } = await agency();
    const admin = memberOf(connection.organizationId, "org-admin");
    const overview = await test.db.forOrg(connection.organizationId, (tx) => aiOverviewOf(tx, testNow));
    expect(overview.chatsAnswered).toBe(4);
    expect(await listed(connection.organizationId, admin)).toHaveLength(overview.chatsAnswered);
  });

  it("keeps to the member's inbox scope: a salesperson sees only their own leads' chats", async () => {
    const { connection, seller, ids } = await agency();
    const salesperson = memberOf(connection.organizationId, "sales", { userId: seller });
    expect((await listed(connection.organizationId, salesperson)).sort()).toEqual([ids.twiceToday, ids.snoozed].sort());
  });
});
