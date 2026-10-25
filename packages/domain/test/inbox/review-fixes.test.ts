// The review's smaller fixes (2026-10-24): a provider's clock ahead of ours, a number connected again, a STOP with a full stop,
// a late "sent" after a failure, the header's leads by the member's scope, a template with a header offered to no one.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aLead, aPerson } from "../crm/support/records.js";
import { conversationHeaderOf, isOptOutText, removeRoute, upsertRoute } from "../../src/inbox/index.js";
import { memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  statusFor,
  testNow,
  type TestInbox,
} from "./support.js";

const digits = (phone: string) => phone.replace("+", "");

describe("the review's smaller fixes", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("never takes a provider's time as later than ours", async () => {
    const connection = await aConnectedAgency(test);
    const phone = freshPhone();
    const aDayAhead = Math.floor(testNow.getTime() / 1000) + 86_400;
    await deliver(test, fromCustomer(connection, { customerNumber: digits(phone), text: "Hi", ts: aDayAhead }));
    const chat = await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappConversation.findFirstOrThrow());
    expect(chat.lastInboundAt).toEqual(testNow);
  });

  it("points a number connected again at its new connection, and still refuses another agency's number", async () => {
    const connection = await aConnectedAgency(test);
    const newConnection = randomUUID();
    await expect(
      upsertRoute(test.db, {
        integratedNumber: connection.integratedNumber,
        organizationId: connection.organizationId,
        connectionId: newConnection,
      }),
    ).resolves.toBe("ok");
    const other = await aConnectedAgency(test);
    await expect(
      upsertRoute(test.db, {
        integratedNumber: connection.integratedNumber,
        organizationId: other.organizationId,
        connectionId: other.connectionId,
      }),
    ).resolves.toBe("taken");
    await removeRoute(test.db, connection.organizationId, newConnection);
  });

  it("reads a STOP with a full stop or an exclamation mark", () => {
    for (const text of ["STOP.", "Stop!", " stop  messages. ", "Unsubscribe?"])
      expect(isOptOutText(text), text).toBe(true);
    for (const text of ["Please stop", "stopover in Goa", "Don't stop"]) expect(isOptOutText(text), text).toBe(false);
  });

  it("does not let a late sent report undo a failure, but lets a delivered one", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    await test.db.forOrg(connection.organizationId, async (tx) => {
      const chat = await tx.whatsappConversation.create({
        data: { connectionId: connection.connectionId, phoneE164: `+${customerNumber}` },
        select: { id: true },
      });
      await tx.whatsappMessage.create({
        data: {
          conversationId: chat.id,
          direction: "out",
          origin: "staff_crm",
          kind: "text",
          body: "Hi",
          wamid: "wamid.LATE",
          status: "failed",
          failureCode: "unsure",
          occurredAt: testNow,
        },
      });
    });
    const status = () =>
      test.db.forOrg(connection.organizationId, async (tx) => (await tx.whatsappMessage.findFirstOrThrow()).status);
    await deliver(
      test,
      statusFor(connection, {
        customerNumber,
        wamid: "wamid.LATE",
        eventName: "sent",
        ts: Math.floor(testNow.getTime() / 1000),
      }),
    );
    expect(await status()).toBe("failed");
    await deliver(
      test,
      statusFor(connection, {
        customerNumber,
        wamid: "wamid.LATE",
        eventName: "delivered",
        ts: Math.floor(testNow.getTime() / 1000),
      }),
    );
    expect(await status()).toBe("delivered");
  });

  it("shows a salesperson only their own leads in a chat's header", async () => {
    const connection = await aConnectedAgency(test);
    const salesperson = memberOf(connection.organizationId, "sales");
    const phone = freshPhone();
    const { mine, theirs } = await test.db.forOrg(connection.organizationId, async (tx) => {
      const person = await aPerson(tx, { phoneE164: phone });
      const mine = await aLead(tx, { personId: person.id, ownerUserId: salesperson.userId });
      const theirs = await aLead(tx, { personId: person.id, ownerUserId: randomUUID() });
      return { mine, theirs };
    });
    await deliver(test, fromCustomer(connection, { customerNumber: digits(phone), text: "Hi" }));
    const chat = await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappConversation.findFirstOrThrow());
    const header = await test.db.forOrg(connection.organizationId, (tx) =>
      conversationHeaderOf(tx, salesperson, chat.id, testNow),
    );
    expect(header.lead?.id).toBe(mine.id);
    expect(header.lead?.id).not.toBe(theirs.id);
  });
});
