// The automatic WhatsApps (greeting, follow-ups, payment reminders) obey the customer: STOP ends them in every path, no
// template goes without a consent on record, one cooldown is shared by every automatic message to a chat and a reply
// pauses them, a touch is claimed once, they are written as automation, and erasure takes the run and the touches.
import { randomUUID } from "node:crypto";
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { systemActor } from "../../src/kernel/index.js";
import { eraseCustomerParts } from "../../src/platform/erase-customer.js";
import { AUTOMATION_COOLDOWN_MS, claimTouch, releaseTouch, sendToLead } from "../../src/sales/send.js";
import { aConnectedAgency, createTestInbox, testNow, type TestInbox } from "../inbox/support.js";
import { aLead, aPerson } from "../crm/support/records.js";

describe("the automatic WhatsApps", () => {
  let test: TestInbox;
  let platformDb: PlatformDatabase;
  beforeAll(() => {
    test = createTestInbox();
    platformDb = createPlatformDatabase(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await platformDb.disconnect();
    await test.close();
  });

  /** An agency with an approved template, and a lead from its website whose person has the given consent. */
  async function setUp(consent: "granted" | "withdrawn" | "none") {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const made = await inOrg(async (tx) => {
      const template = await tx.whatsappTemplate.create({
        data: {
          connectionId: connection.connectionId,
          name: "welcome_goa",
          language: "en",
          category: "utility",
          body: "Hi {{1}}, thanks for your enquiry.",
          status: "approved",
        },
      });
      const person = await aPerson(tx);
      const lead = await aLead(tx, { personId: person.id, source: "website" });
      if (consent !== "none") {
        await tx.personConsent.create({
          data: {
            personId: person.id,
            purpose: "whatsapp",
            action: consent,
            wording: "test",
            wordingVersion: 1,
            source: consent === "withdrawn" ? "customer" : "staff",
            recordedAt: new Date(testNow.getTime() - 48 * 3_600_000),
          },
        });
      }
      return { templateId: template.id, leadId: lead.id, personId: person.id };
    });
    const send = (key: string, extra: { sessionText?: string } = {}, at: Date = testNow) =>
      inOrg((tx) =>
        sendToLead(
          tx,
          {
            organizationId,
            leadId: made.leadId,
            templateId: made.templateId,
            params: ["Rahul"],
            clientToken: key,
            ...extra,
          },
          at,
        ),
      );
    return { ...made, organizationId, inOrg, send };
  }

  it("sends a template only to someone whose consent is on record, as automation", async () => {
    const none = await setUp("none");
    expect(await none.send("speed:a")).toEqual({ kind: "never", reason: "no_consent" });
    expect(await none.inOrg((tx) => tx.whatsappMessage.count())).toBe(0);
    const granted = await setUp("granted");
    expect(await granted.send("speed:b")).toMatchObject({ kind: "sent" });
    const message = await granted.inOrg((tx) => tx.whatsappMessage.findFirstOrThrow());
    expect(message.origin).toBe("automation");
  });

  it("lets STOP win in every path: no template, and no plain message in an open window either", async () => {
    const stopped = await setUp("withdrawn");
    expect(await stopped.send("speed:c")).toEqual({ kind: "never", reason: "opted_out" });
    const open = await stopped.inOrg((tx) =>
      tx.whatsappConversation.updateMany({ data: { lastInboundAt: new Date(testNow.getTime() - 3_600_000) } }),
    );
    expect(open.count).toBeGreaterThan(0);
    expect(await stopped.send("follow:c:0", { sessionText: "Hi again" })).toEqual({
      kind: "never",
      reason: "opted_out",
    });
    expect(await stopped.inOrg((tx) => tx.whatsappMessage.count())).toBe(0);
  });

  it("shares one cooldown across the chat, and a customer's reply pauses every automatic message", async () => {
    const agency = await setUp("granted");
    expect(await agency.send("speed:d")).toMatchObject({ kind: "sent" });
    const soon = new Date(testNow.getTime() + AUTOMATION_COOLDOWN_MS - 60_000);
    expect(await agency.send("follow:d:0", {}, soon)).toEqual({ kind: "later", reason: "cooldown" });
    // After the cooldown a second one may go ...
    const after = new Date(testNow.getTime() + AUTOMATION_COOLDOWN_MS + 60_000);
    // ... unless the customer has written since the last one.
    await agency.inOrg((tx) =>
      tx.whatsappConversation.updateMany({ data: { lastInboundAt: new Date(testNow.getTime() + 3_600_000) } }),
    );
    expect(await agency.send("follow:d:1", {}, after)).toEqual({ kind: "never", reason: "customer_replied" });
  });

  it("claims a touch once, and gives a claim back when its send must wait", async () => {
    const agency = await setUp("granted");
    const touch = { kind: "follow" as const, key: `follow:${randomUUID()}:0`, leadId: agency.leadId };
    expect(await agency.inOrg((tx) => claimTouch(tx, touch))).toBe(true);
    expect(await agency.inOrg((tx) => claimTouch(tx, touch))).toBe(false);
    await agency.inOrg((tx) => releaseTouch(tx, touch.key));
    expect(await agency.inOrg((tx) => claimTouch(tx, touch))).toBe(true);
  });

  it("is erased with the customer: the run of follow-ups and every touch", async () => {
    const agency = await setUp("granted");
    await agency.inOrg(async (tx) => {
      await tx.leadCadence.create({ data: { leadId: agency.leadId, enrolledAt: testNow, nextAt: testNow } });
      await tx.salesTouch.create({
        data: { kind: "speed", key: `speed:${agency.leadId}`, leadId: agency.leadId, outcome: "sent" },
      });
    });
    await platformDb.transaction((tx) =>
      eraseCustomerParts(
        tx,
        systemActor(agency.organizationId),
        { organizationId: agency.organizationId, personId: agency.personId },
        testNow,
      ),
    );
    expect(await agency.inOrg((tx) => tx.leadCadence.count())).toBe(0);
    expect(await agency.inOrg((tx) => tx.salesTouch.count())).toBe(0);
  });
});
