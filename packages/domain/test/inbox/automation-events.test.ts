// When the automatic answers are woken (sales inbox spec 6): a customer's message publishes "customer-wrote" only when an
// answer could fit, never for STOP, and a change to the settings is written in the audit log.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CUSTOMER_WROTE_EVENT, saveAutomation } from "../../src/inbox/index.js";
import { auditOf, eventsOf, memberOf } from "../imports/support/test-imports.js";
import { aConnectedAgency, createTestInbox, deliver, freshPhone, fromCustomer, type TestInbox } from "./support.js";

const off = { awayEnabled: false, awayMessage: "", welcomeEnabled: false, welcomeMessage: "" };
const hours = { openFrom: 600, openUntil: 1140, openDays: [1, 2, 3, 4, 5, 6] };

describe("waking the automatic answers", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  const woken = async (organizationId: string) => (await eventsOf(test, organizationId, [CUSTOMER_WROTE_EVENT])).length;
  const writes = (connection: Awaited<ReturnType<typeof aConnectedAgency>>, text: string) =>
    deliver(test, fromCustomer(connection, { customerNumber: freshPhone().replace("+", ""), text }));

  it("publishes nothing for an agency with no automatic answer set up", async () => {
    const connection = await aConnectedAgency(test);
    await writes(connection, "Hello");
    expect(await woken(connection.organizationId)).toBe(0);
  });

  it("publishes for a message an answer could fit, but not for STOP", async () => {
    const connection = await aConnectedAgency(test);
    const member = memberOf(connection.organizationId);
    await test.db.forOrg(connection.organizationId, (tx) =>
      saveAutomation(tx, member, { ...off, ...hours, welcomeEnabled: true, welcomeMessage: "Welcome" }),
    );
    await writes(connection, "Hello");
    expect(await woken(connection.organizationId)).toBe(1);
    await writes(connection, "Stop");
    expect(await woken(connection.organizationId)).toBe(1);
  });

  it("audits a change to the settings with the hours and both messages", async () => {
    const connection = await aConnectedAgency(test);
    const member = memberOf(connection.organizationId);
    await test.db.forOrg(connection.organizationId, (tx) =>
      saveAutomation(tx, member, { ...off, ...hours, awayEnabled: true, awayMessage: "We open at ten" }),
    );
    const entityId = await test.db.forOrg(
      connection.organizationId,
      async (tx) => (await tx.inboxAutomation.findFirstOrThrow()).id,
    );
    const [entry] = await auditOf(test, connection.organizationId, entityId);
    expect(entry).toMatchObject({
      action: "inbox.automation-changed",
      actorUserId: member.userId,
      after: { away: true, awayText: "We open at ten", hours: "10:00-19:00, days 1 2 3 4 5 6" },
    });
  });
});
