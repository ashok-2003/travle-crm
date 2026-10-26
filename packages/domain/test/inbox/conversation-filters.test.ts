// The inbox's Status and Any time filters (sales inbox spec, design v2): the chats whose lead stands at a stage, as the
// member may see it, and the chats with a message in the last day, 7 days or 30 days.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listConversations } from "../../src/inbox/index.js";
import { aLead, aPerson, freshPhone } from "../crm/support/records.js";
import { memberOf } from "../imports/support/test-imports.js";
import { aConnectedAgency, createTestInbox, testNow, type TestInbox } from "./support.js";

const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(testNow.getTime() - days * DAY);

describe("the inbox's stage and period filters", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function agency() {
    const connection = await aConnectedAgency(test);
    const me = randomUUID();
    const someoneElse = randomUUID();
    const ids = await test.db.forOrg(connection.organizationId, async (tx) => {
      const chat = async (stage: "new" | "contacted", ownerUserId: string, lastMessageAt: Date) => {
        const person = await aPerson(tx);
        await aLead(tx, { personId: person.id, stage, ownerUserId });
        return (
          await tx.whatsappConversation.create({
            data: {
              connectionId: connection.connectionId,
              phoneE164: freshPhone(),
              personId: person.id,
              lastMessageAt,
            },
          })
        ).id;
      };
      return {
        newToday: await chat("new", me, daysAgo(0.5)),
        contactedLastWeek: await chat("contacted", me, daysAgo(5)),
        contactedLastMonth: await chat("contacted", someoneElse, daysAgo(20)),
      };
    });
    return { connection, me, ids };
  }

  it("keeps the chats whose lead stands at the stage", async () => {
    const { connection, me, ids } = await agency();
    const admin = memberOf(connection.organizationId, "org-admin", { userId: me });
    const page = await test.db.forOrg(connection.organizationId, (tx) =>
      listConversations(tx, admin, { filter: "all", stage: "contacted", limit: 20 }, testNow),
    );
    expect(page.items.map((item) => item.id).sort()).toEqual([ids.contactedLastWeek, ids.contactedLastMonth].sort());
  });

  it("counts only a salesperson's own leads at the stage", async () => {
    const { connection, me, ids } = await agency();
    const seller = memberOf(connection.organizationId, "sales", { userId: me });
    const page = await test.db.forOrg(connection.organizationId, (tx) =>
      listConversations(tx, seller, { filter: "all", stage: "contacted", limit: 20 }, testNow),
    );
    expect(page.items.map((item) => item.id)).toEqual([ids.contactedLastWeek]);
  });

  it("keeps the chats with a message within the period", async () => {
    const { connection, me, ids } = await agency();
    const admin = memberOf(connection.organizationId, "org-admin", { userId: me });
    const within = (period: "today" | "week" | "month") =>
      test.db.forOrg(connection.organizationId, (tx) =>
        listConversations(tx, admin, { filter: "all", period, limit: 20 }, testNow),
      );
    expect((await within("today")).items.map((item) => item.id)).toEqual([ids.newToday]);
    expect((await within("week")).items.map((item) => item.id)).toEqual([ids.newToday, ids.contactedLastWeek]);
    expect((await within("month")).items).toHaveLength(3);
  });
});
