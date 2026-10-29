// Delivery reports out of order (spec 4.5): a report only moves a message forward, a read with no delivered before it is also
// its delivery, a late one is ignored, a failure never undoes a delivery, and a delivery does undo a failure.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  statusFor,
  testNow,
  type TestInbox,
} from "./support.js";

const at = (seconds: number) => Math.floor(testNow.getTime() / 1000) + seconds;

describe("delivery reports out of order", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function sentMessage(status = "sent") {
    const connection = await aConnectedAgency(test);
    const customerNumber = freshPhone().replace("+", "");
    const wamid = `wamid.OUT-${customerNumber}`;
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
          wamid,
          status,
          occurredAt: testNow,
          sentAt: testNow,
        },
      });
    });
    const report = (eventName: "sent" | "delivered" | "read" | "failed", seconds = 0, reason?: string) =>
      deliver(
        test,
        statusFor(connection, { customerNumber, wamid, eventName, ts: at(seconds), ...(reason ? { reason } : {}) }),
      );
    const row = () => test.db.forOrg(connection.organizationId, (tx) => tx.whatsappMessage.findFirstOrThrow());
    return { report, row };
  }

  it("takes a read that comes first as the delivery too, and a later delivered changes nothing", async () => {
    const { report, row } = await sentMessage();
    await report("read", 30);
    const afterRead = await row();
    expect(afterRead.status).toBe("read");
    expect(afterRead.readAt).toEqual(new Date(testNow.getTime() + 30_000));
    expect(afterRead.deliveredAt).toEqual(new Date(testNow.getTime() + 30_000));
    await report("delivered", 10);
    const later = await row();
    expect(later.deliveredAt).toEqual(afterRead.deliveredAt);
    expect(later.status).toBe("read");
  });

  it("keeps the delivery time it already had when the read arrives", async () => {
    const { report, row } = await sentMessage();
    await report("delivered", 10);
    await report("read", 50);
    const message = await row();
    expect(message.deliveredAt).toEqual(new Date(testNow.getTime() + 10_000));
    expect(message.readAt).toEqual(new Date(testNow.getTime() + 50_000));
  });

  it("lets a failure stand against a late sent, and a delivery undo it, but a failure never undoes a delivery", async () => {
    const failing = await sentMessage();
    await failing.report("failed", 5, "131047");
    await failing.report("sent", 6);
    expect((await failing.row()).status).toBe("failed");
    await failing.report("delivered", 20);
    expect((await failing.row()).status).toBe("delivered");

    const delivered = await sentMessage();
    await delivered.report("delivered", 5);
    await delivered.report("failed", 6, "131047");
    expect((await delivered.row()).status).toBe("delivered");
  });

  it("answers the same report twice with no change", async () => {
    const { report, row } = await sentMessage();
    await report("delivered", 5);
    const once = await row();
    await report("delivered", 90);
    expect((await row()).deliveredAt).toEqual(once.deliveredAt);
  });

  // The worker processes several webhooks at once (apps/api/src/worker-jobs.ts): a delivered and a read for one message
  // can both read it as sent before either is saved, and the one saved last must still not move it back.
  it("never moves a message back when its reports are handled at the same time", async () => {
    const messages = await Promise.all(Array.from({ length: 8 }, () => sentMessage()));
    await Promise.all(messages.flatMap(({ report }) => [report("read", 30), report("delivered", 10)]));
    const failures = await Promise.all(Array.from({ length: 8 }, () => sentMessage("delivered")));
    await Promise.all(failures.flatMap(({ report }) => [report("read", 30), report("failed", 31, "131047")]));
    for (const { row } of messages) expect((await row()).status).toBe("read");
    for (const { row } of failures) expect((await row()).status).toBe("read");
  });
});
