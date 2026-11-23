// Rules of sales execution: automatic WhatsApps go between 10:00 and 20:00 in the agency's zone (else at the next 10:00),
// a buying word counts only as a whole word or phrase, and (on the database) each automatic message goes from the number
// the customer last wrote to (multi-number spec, paths 14 and 15).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OrgTx } from "@travel-crm/db";
import { greetNewLead, runFollowUpsFor, workingMoment } from "../../src/sales/cadence.js";
import { runRemindersFor } from "../../src/sales/reminders.js";
import { holdsBuyingWord } from "../../src/sales/signals.js";
import { aLead, aPerson } from "../crm/support/records.js";
import {
  aConnectedAgency,
  aSecondNumber,
  createTestInbox,
  lastWroteTo,
  sentFrom,
  testNow,
  type TestConnection,
  type TestInbox,
} from "../inbox/support.js";

const IST = "Asia/Kolkata";

describe("workingMoment", () => {
  it("keeps a moment inside working hours", () => {
    const at = new Date("2026-11-02T06:30:00Z"); // 12:00 in India
    expect(workingMoment(at, IST)).toEqual(at);
  });

  it("moves an early morning to 10:00 that day", () => {
    expect(workingMoment(new Date("2026-11-02T01:00:00Z"), IST).toISOString()).toBe("2026-11-02T04:30:00.000Z");
  });

  it("moves a late evening to 10:00 the next day", () => {
    expect(workingMoment(new Date("2026-11-02T16:00:00Z"), IST).toISOString()).toBe("2026-11-03T04:30:00.000Z");
  });
});

describe("holdsBuyingWord", () => {
  const words = ["price", "book", "kitna", "advance payment"];

  it("finds a word in any case, among punctuation", () => {
    expect(holdsBuyingWord("Manali package ka PRICE kya hai?", words)).toBe(true);
  });

  it("finds a phrase whatever the marks between its words", () => {
    expect(holdsBuyingWord("advance-payment kaise karu", words)).toBe(true);
  });

  it("never matches inside another word", () => {
    expect(holdsBuyingWord("Facebook pe dekha", words)).toBe(false);
    expect(holdsBuyingWord("pricey hai", words)).toBe(false);
  });
});

describe("an automatic sales message goes from the number the customer last wrote to", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  const dependencies = () => ({
    db: test.db,
    appUrl: "https://app.example.test",
    timeZone: () => Promise.resolve(IST),
    names: () => Promise.resolve({ agencyName: "The agency", agentName: null }),
  });
  const inAnHour = new Date(testNow.getTime() + 3_600_000);

  /**
   * "Sales 1" (main) and "Sales 2", each with an approved template of the name the automation chose on the main number,
   * and two customers who enquired on the website and wrote to both numbers: the first last to Sales 2, the second last
   * to Sales 1. Both are sent to in one run, with no write to a number between, so a send that took the first live number
   * a lookup finds goes from the wrong number for one of them.
   */
  async function agency() {
    const main = await aConnectedAgency(test);
    const second = await aSecondNumber(test, main, { label: "Sales 2" });
    const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(main.organizationId, work);
    const template = async (connection: TestConnection) => {
      const row = await inOrg((tx) =>
        tx.whatsappTemplate.create({
          data: {
            connectionId: connection.connectionId,
            name: "trip_update",
            language: "en",
            category: "utility",
            body: "Hello {{1}}, about your trip.",
            status: "approved",
          },
          select: { id: true },
        }),
      );
      return row.id;
    };
    const chosen = await template(main);
    await template(second);
    const customers = [];
    for (const [last, before] of [
      [second, main],
      [main, second],
    ] as const) {
      const lead = await inOrg(async (tx) => aLead(tx, { personId: (await aPerson(tx)).id, source: "website" }));
      const person = await inOrg((tx) =>
        tx.person.findUniqueOrThrow({ where: { id: lead.personId }, select: { phoneE164: true } }),
      );
      const chat = await lastWroteTo(test, person.phoneE164 ?? "", last, before);
      customers.push({ leadId: lead.id, chat, from: last.integratedNumber });
    }
    /** The message a touch sent: its chat, and the number the worker sent it from. */
    const touched = async (where: { key: string } | { leadId: string; kind: string }, at: Date) => {
      const touch = await inOrg((tx) => tx.salesTouch.findFirstOrThrow({ where, select: { messageId: true } }));
      const messageId = touch.messageId ?? "";
      const message = await inOrg((tx) =>
        tx.whatsappMessage.findUniqueOrThrow({ where: { id: messageId }, select: { conversationId: true } }),
      );
      return { chat: message.conversationId, from: await sentFrom(test, main.organizationId, messageId, at) };
    };
    return { main, inOrg, chosen, customers, touched };
  }

  it("sends the speed-to-lead message and a follow-up from the number the customer last wrote to", async () => {
    const { main, inOrg, chosen, customers, touched } = await agency();
    const params = ["text:there"];
    await inOrg((tx) =>
      tx.salesAutomation.create({
        data: {
          speedEnabled: true,
          speedTemplateId: chosen,
          speedParams: params,
          contactEnquirers: true,
          followEnabled: true,
          followSteps: [{ days: 1, templateId: chosen, params }],
        },
      }),
    );
    for (const { leadId } of customers) {
      await greetNewLead(dependencies(), { organizationId: main.organizationId, leadId }, testNow);
    }
    // Each lead's first follow-up comes due.
    await inOrg((tx) => tx.leadCadence.updateMany({ data: { nextAt: testNow } }));
    expect(await runFollowUpsFor(dependencies(), main.organizationId, inAnHour)).toBe(2);
    for (const { leadId, chat, from } of customers) {
      expect(await touched({ key: `speed:${leadId}` }, testNow)).toEqual({ chat, from });
      expect(await touched({ key: `follow:${leadId}:0` }, inAnHour)).toEqual({ chat, from });
    }
  });

  it("sends a sales reminder from the number the customer last wrote to", async () => {
    const { main, inOrg, chosen, customers, touched } = await agency();
    await inOrg((tx) =>
      tx.salesAutomation.create({
        data: {
          reminderEnabled: true,
          reminderTemplateId: chosen,
          reminderParams: ["text:there"],
          reminderDaysBefore: 1,
        },
      }),
    );
    // Each lead has an accepted quote with a payment due tomorrow in India.
    for (const { leadId } of customers) {
      await inOrg(async (tx) => {
        const quote = await tx.quote.create({
          data: {
            leadId,
            title: "Goa 4 days",
            status: "accepted",
            acceptedAt: testNow,
            acceptedName: "Test Customer",
            subtotalPaise: 5_000_000n,
            totalPaise: 5_000_000n,
          },
          select: { id: true },
        });
        await tx.quoteInstallment.create({
          data: { quoteId: quote.id, label: "Balance", amountPaise: 2_500_000n, dueOn: new Date("2026-10-24") },
        });
      });
    }
    expect(await runRemindersFor(dependencies(), main.organizationId, testNow)).toBe(2);
    for (const { leadId, chat, from } of customers) {
      expect(await touched({ leadId, kind: "reminder" }, testNow)).toEqual({ chat, from });
    }
  });
});
