// What makes a lead hot: a quote opened again, or a buying word, each kept once as a signal; the owner's alert carries
// fixed words and never the customer's own; the hot list is the member's own leads, hottest first.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DomainEvent, ListenerContext } from "../../src/jobs/index.js";
import {
  customerWroteListener,
  defaultSalesAutomation,
  hotLeadIds,
  hotLeadsOf,
  leadHeatOf,
} from "../../src/sales/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { aLead } from "../crm/support/records.js";
import { anAgency } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestInbox,
} from "../inbox/support.js";

describe("hot leads", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("alerts the owner to a buying word with fixed words, keeps one signal, and lists the lead as hot", async () => {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const ownerUserId = randomUUID();
    const owner = memberWithStarterRole("org-owner", { organizationId, userId: ownerUserId });
    const customerNumber = freshPhone().replace("+", "");
    const secret = "Mera naam Rahul hai, mere paas 5 lakh hai, kitna price?";
    await deliver(test, fromCustomer(connection, { customerNumber, text: secret }));
    const chat = await inOrg((tx) => tx.whatsappConversation.findFirstOrThrow());
    const message = await inOrg((tx) => tx.whatsappMessage.findFirstOrThrow({ where: { direction: "in" } }));
    const lead = await inOrg((tx) =>
      aLead(tx, { ...(chat.personId === null ? {} : { personId: chat.personId }), ownerUserId, stage: "contacted" }),
    );
    const event: DomainEvent = {
      id: randomUUID(),
      organizationId,
      type: "whatsapp.text-received",
      payload: { conversationId: chat.id, messageId: message.id },
      occurredAt: testNow,
    };
    const context: ListenerContext = { actor: systemActor(organizationId), forOrg: (work) => inOrg(work) };
    const listener = customerWroteListener();
    await listener.handle(event, context);
    await listener.handle(event, context);

    const notices = await inOrg((tx) => tx.notification.findMany({ where: { kind: "sales.hot-lead" } }));
    expect(notices).toHaveLength(1);
    expect(JSON.stringify(notices[0])).not.toContain("kitna");
    expect(JSON.stringify(notices[0])).not.toContain("Rahul");
    expect(await inOrg((tx) => tx.leadSignal.count({ where: { leadId: lead.id } }))).toBe(1);

    const hot = await inOrg((tx) =>
      hotLeadsOf(tx, owner, defaultSalesAutomation, { now: testNow, today: "2026-10-28" }),
    );
    expect(hot.map((row) => row.leadId)).toContain(lead.id);
    expect(hot.find((row) => row.leadId === lead.id)?.reasons).toEqual(["asked_price"]);
    expect(
      (
        await inOrg((tx) =>
          leadHeatOf(tx, owner, defaultSalesAutomation, { now: testNow, today: "2026-10-28", leadId: lead.id }),
        )
      ).reasons,
    ).toEqual(["asked_price"]);
  });

  it("ranks every hot lead for the Leads list, past Home's 25, hottest first, a salesperson's own alone", async () => {
    const organizationId = await anAgency(test, "Hot list");
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const owner = memberWithStarterRole("org-owner", { organizationId, userId: randomUUID() });
    const seller = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
    const minutesAgo = (minutes: number) => new Date(testNow.getTime() - minutes * 60_000);
    const opened = async (leadId: string, at: Date) =>
      inOrg((tx) => tx.leadSignal.create({ data: { leadId, kind: "quote_opened", sourceKey: randomUUID(), at } }));
    // 27 opened their quote, the later the hotter; one also asked to book; one is closed; one opened it long ago.
    const quoted: string[] = [];
    for (let index = 0; index < 27; index += 1) {
      const lead = await inOrg((tx) => aLead(tx, { ownerUserId: owner.userId, stage: "quote_sent" }));
      await opened(lead.id, minutesAgo(100 - index));
      quoted.push(lead.id);
    }
    const hottest = await inOrg((tx) => aLead(tx, { ownerUserId: seller.userId, stage: "quote_sent" }));
    await opened(hottest.id, minutesAgo(500));
    await inOrg((tx) =>
      tx.leadSignal.create({
        data: { leadId: hottest.id, kind: "asked_price", sourceKey: randomUUID(), at: minutesAgo(400) },
      }),
    );
    const won = await inOrg((tx) => aLead(tx, { ownerUserId: owner.userId, stage: "won" }));
    await opened(won.id, minutesAgo(5));
    const longAgo = await inOrg((tx) => aLead(tx, { ownerUserId: owner.userId, stage: "contacted" }));
    await opened(longAgo.id, minutesAgo(8 * 24 * 60));
    // A budget for everyone at or over ₹10 lakh: 4 at ₹3 lakh each is; 2 adults and a child at ₹3 lakh each isn't.
    const budget = (adults: number, childrenAges: number[], budgetBasis: string) => ({
      ownerUserId: owner.userId,
      stage: "contacted" as const,
      adults,
      childrenAges,
      budgetPaise: 3_00_000_00n,
      budgetBasis,
    });
    const big = await inOrg((tx) => aLead(tx, budget(4, [], "per_person")));
    await inOrg((tx) => aLead(tx, budget(2, [7], "per_person")));
    await inOrg((tx) => aLead(tx, budget(4, [], "for_everyone")));
    const settings = { ...defaultSalesAutomation, hotBudgetPaise: 10_00_000_00, hotTravelDays: 0 };
    const context = { now: testNow, today: "2026-10-23" };

    const everyHot = await inOrg((tx) => hotLeadIds(tx, owner, settings, context));
    expect(everyHot).toEqual([hottest.id, ...[...quoted].reverse(), big.id]);
    expect(await inOrg((tx) => hotLeadIds(tx, seller, settings, context))).toEqual([hottest.id]);
    const home = await inOrg((tx) => hotLeadsOf(tx, owner, settings, context));
    expect(home.map((row) => row.leadId)).toEqual(everyHot.slice(0, 25));
  });

  it("counts a trip whose dates start within the agency's hot days, both ends included, on open leads alone", async () => {
    const organizationId = await anAgency(test, "Travel soon");
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const owner = memberWithStarterRole("org-owner", { organizationId, userId: randomUUID() });
    const trip = (start: string, stage: "contacted" | "won" = "contacted") => {
      const travelStart = new Date(`${start}T00:00:00Z`);
      const dates = { travelKind: "dates", travelStart, travelEnd: travelStart };
      return inOrg((tx) => aLead(tx, { ownerUserId: owner.userId, stage, ...dates }));
    };
    const today = await trip("2026-10-23");
    const lastDay = await trip("2026-11-02");
    await trip("2026-11-03");
    await trip("2026-10-22");
    await trip("2026-10-25", "won");
    const settings = { ...defaultSalesAutomation, hotTravelDays: 10 };
    const context = { now: testNow, today: "2026-10-23" };
    expect(new Set(await inOrg((tx) => hotLeadIds(tx, owner, settings, context)))).toEqual(
      new Set([today.id, lastDay.id]),
    );
    const heat = await inOrg((tx) => leadHeatOf(tx, owner, settings, { ...context, leadId: lastDay.id }));
    expect(heat).toEqual({ score: 20, reasons: ["travel_soon"] });
  });

  it("ignores a message with no buying word", async () => {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const customerNumber = freshPhone().replace("+", "");
    await deliver(test, fromCustomer(connection, { customerNumber, text: "Hello, is anyone there?" }));
    const chat = await inOrg((tx) => tx.whatsappConversation.findFirstOrThrow());
    const message = await inOrg((tx) => tx.whatsappMessage.findFirstOrThrow({ where: { direction: "in" } }));
    const lead = await inOrg((tx) =>
      aLead(tx, { ...(chat.personId === null ? {} : { personId: chat.personId }), ownerUserId: randomUUID() }),
    );
    await customerWroteListener().handle(
      {
        id: randomUUID(),
        organizationId,
        type: "whatsapp.text-received",
        payload: { conversationId: chat.id, messageId: message.id },
        occurredAt: testNow,
      },
      { actor: systemActor(organizationId), forOrg: (work) => inOrg(work) },
    );
    expect(await inOrg((tx) => tx.leadSignal.count({ where: { leadId: lead.id } }))).toBe(0);
  });

  it("hears a buying word in an agency with no automation at all (the AI's and the hot-lead listeners wake for every agency)", async () => {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const ownerUserId = randomUUID();
    await deliver(
      test,
      fromCustomer(connection, { customerNumber: freshPhone().replace("+", ""), text: "Kitna price hai?" }),
    );
    const events = await inOrg(async (tx) => (await tx.outboxEvent.findMany()).map((event) => event.type));
    expect(events).toContain("whatsapp.text-received");
    expect(events).toContain("whatsapp.customer-wrote");
    const chat = await inOrg((tx) => tx.whatsappConversation.findFirstOrThrow());
    const row = await inOrg((tx) => tx.outboxEvent.findFirstOrThrow({ where: { type: "whatsapp.text-received" } }));
    const lead = await inOrg((tx) =>
      aLead(tx, { ...(chat.personId === null ? {} : { personId: chat.personId }), ownerUserId, stage: "contacted" }),
    );
    await customerWroteListener().handle(
      { id: row.id, organizationId, type: row.type, payload: row.payload as never, occurredAt: testNow },
      { actor: systemActor(organizationId), forOrg: (work) => inOrg(work) },
    );
    expect(await inOrg((tx) => tx.leadSignal.count({ where: { leadId: lead.id } }))).toBe(1);
    expect(await inOrg((tx) => tx.notification.count({ where: { kind: "sales.hot-lead" } }))).toBe(1);
  });
});
