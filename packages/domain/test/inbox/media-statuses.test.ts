// Copying inbound files, delivery statuses, the phone's echoes, the health check and the sweeps (I4, D1-D2, E1, 8.4, W5).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import { tinyPng } from "@travel-crm/integrations/testing";
import { aLead, aPerson } from "../crm/support/records.js";
import { checkConnection, copyMedia } from "../../src/inbox/index.js";
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

describe("media, statuses, echoes and health", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function photo(url = "https://media.example/p1") {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    await deliver(test, fromCustomer(connection, { customerNumber, contentType: "image", url, caption: "Passport" }));
    const message = await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappMessage.findFirstOrThrow());
    return { connection, customerNumber, message };
  }

  it("copies a photo into storage once, as an attachment of the message, and blanks MSG91's link", async () => {
    const { connection, message } = await photo();
    test.provider.addFile("https://media.example/p1", { bytes: tinyPng, contentType: "image/png" });
    expect(await copyMedia(test.dependencies, connection.organizationId, message.id, testNow)).toBe("stored");
    expect(await copyMedia(test.dependencies, connection.organizationId, message.id, testNow)).toBe("gone");
    const stored = await test.db.forOrg(connection.organizationId, async (tx) => ({
      message: await tx.whatsappMessage.findUniqueOrThrow({ where: { id: message.id } }),
      attachments: await tx.attachment.findMany({ where: { recordType: WHATSAPP_RECORD_TYPE, recordId: message.id } }),
    }));
    expect(stored.message).toMatchObject({ mediaState: "stored", mediaUrl: null });
    expect(stored.attachments).toHaveLength(1);
    expect(stored.attachments[0]).toMatchObject({ contentType: "image/png" });
  });

  it("calls a file past its 30 days expired, and one over the cap or of a wrong type failed", async () => {
    const gone = await photo("https://media.example/gone");
    expect(await copyMedia(test.dependencies, gone.connection.organizationId, gone.message.id, testNow)).toBe(
      "expired",
    );
    const html = await photo("https://media.example/html");
    test.provider.addFile("https://media.example/html", { bytes: new Uint8Array(4), contentType: "text/html" });
    expect(await copyMedia(test.dependencies, html.connection.organizationId, html.message.id, testNow)).toBe("failed");
    const states = await test.db.forOrg(html.connection.organizationId, (tx) => tx.whatsappMessage.findFirstOrThrow());
    expect(states).toMatchObject({ mediaState: "failed", failureCode: "bad_type" });
  });

  it("moves a sent message forward only, whatever order its reports come in", async () => {
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
          wamid: "wamid.OUT-A",
          status: "sent",
          occurredAt: testNow,
          sentAt: testNow,
        },
      });
    });
    const report = (eventName: "sent" | "delivered" | "read" | "failed") =>
      deliver(
        test,
        statusFor(connection, {
          customerNumber,
          wamid: "wamid.OUT-A",
          eventName,
          ts: Math.floor(testNow.getTime() / 1000),
        }),
      );
    await report("read");
    await report("delivered");
    await report("sent");
    const message = await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappMessage.findFirstOrThrow());
    expect(message.status).toBe("read");
    expect(message.readAt).toEqual(testNow);
    await deliver(
      test,
      statusFor(connection, { customerNumber, wamid: "wamid.OUT-A", eventName: "failed", reason: "131047" }),
    );
    expect(
      (await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappMessage.findFirstOrThrow())).status,
    ).toBe("read");
    expect(
      (await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappConnection.findFirstOrThrow())).lastReportAt,
    ).toEqual(testNow);
  });

  it("tries a status again when its message may still be coming, and drops one that never will", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    const recent = statusFor(connection, {
      customerNumber,
      wamid: "wamid.LATER",
      eventName: "delivered",
      ts: Math.floor(testNow.getTime() / 1000),
    });
    await expect(deliver(test, recent)).rejects.toThrow();
    const old = statusFor(connection, {
      customerNumber,
      wamid: "wamid.NEVER",
      eventName: "delivered",
      ts: Math.floor(testNow.getTime() / 1000) - 600,
    });
    await deliver(test, old);
    expect(
      (await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappConnection.findFirstOrThrow())).eventsUnknown,
    ).toBe(1);
  });

  it("stores a message sent from the phone as ours, stops the chat waiting and gives the open lead its first reply", async () => {
    const connection = await aConnectedAgency(test);
    const phone = freshPhone();
    const lead = await test.db.forOrg(connection.organizationId, async (tx) =>
      aLead(tx, { personId: (await aPerson(tx, { phoneE164: phone })).id }),
    );
    await deliver(test, fromCustomer(connection, { customerNumber: digits(phone), text: "Hello" }));
    await deliver(
      test,
      fromCustomer(connection, {
        customerNumber: digits(phone),
        text: "From the phone",
        direction: "1",
        ts: Math.floor(testNow.getTime() / 1000) + 60,
      }),
    );
    const state = await test.db.forOrg(connection.organizationId, async (tx) => ({
      chat: await tx.whatsappConversation.findFirstOrThrow(),
      echo: await tx.whatsappMessage.findFirstOrThrow({ where: { direction: "out" } }),
      lead: await tx.lead.findUniqueOrThrow({ where: { id: lead.id } }),
    }));
    expect(state.echo).toMatchObject({ origin: "staff_phone", sentBy: null, body: "From the phone" });
    expect(state.chat.needsReply).toBe(false);
    expect(state.chat.lastInboundAt).not.toBeNull();
    expect(state.lead.firstReplyAt).not.toBeNull();
  });

  it("marks a number in trouble when its sends get no reports, and recovers when a report arrives", async () => {
    const connection = await aConnectedAgency(test);
    const sentAt = new Date(testNow.getTime() - 30 * 60_000);
    await test.db.forOrg(connection.organizationId, async (tx) => {
      const chat = await tx.whatsappConversation.create({
        data: { connectionId: connection.connectionId, phoneE164: freshPhone() },
        select: { id: true },
      });
      await tx.whatsappMessage.create({
        data: {
          conversationId: chat.id,
          direction: "out",
          origin: "staff_crm",
          kind: "text",
          body: "Hi",
          wamid: "wamid.QUIET",
          status: "sent",
          occurredAt: sentAt,
          sentAt,
        },
      });
    });
    expect(await checkConnection(test.dependencies, connection.organizationId, connection.connectionId, testNow)).toBe(
      "problem",
    );
    expect(
      await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappConnection.findFirstOrThrow()),
    ).toMatchObject({ status: "problem", problemSince: testNow });
    expect(test.logger.entries.some((entry) => entry.level === "error")).toBe(true);
    await deliver(
      test,
      statusFor(connection, {
        customerNumber: digits(freshPhone()),
        wamid: "wamid.QUIET",
        eventName: "delivered",
        ts: Math.floor(testNow.getTime() / 1000),
      }),
    );
    expect(
      await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappConnection.findFirstOrThrow()),
    ).toMatchObject({ status: "connected", problemSince: null });
  });
});
