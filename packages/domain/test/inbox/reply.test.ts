// Replying (spec 4.4 S1-S5): a reply is queued once however often it is sent, inside the 24-hour window only, goes out through
// the worker's sender at most once, and ends sent or failed; a failure waits for a person's Try again.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import { tinyPng } from "@travel-crm/integrations/testing";
import {
  checkConnection,
  markAnswered,
  queueMedia,
  queueText,
  requestMediaUpload,
  retryMessage,
  sendQueued,
  type ReplyContext,
} from "../../src/inbox/index.js";
import { newUuidV7, systemActor } from "../../src/kernel/index.js";
import { listenerContext, memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestConnection,
  type TestInbox,
} from "./support.js";

const HOUR = 3_600_000;
const context: ReplyContext = { whatsappConfigured: true };

describe("replying on WhatsApp", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /** An agency whose customer wrote at testNow; a member who may reply. */
  async function chat() {
    const connection = await aConnectedAgency(test);
    const phone = freshPhone();
    await deliver(test, fromCustomer(connection, { customerNumber: phone.replace("+", ""), text: "Goa?" }));
    const conversation = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConversation.findFirstOrThrow(),
    );
    const member = memberOf(connection.organizationId);
    const reply = (text: string, at = new Date(testNow.getTime() + HOUR), clientToken = randomUUID()) =>
      test.db.forOrg(connection.organizationId, (tx) =>
        queueText(tx, member, { conversationId: conversation.id, clientToken, text }, context, at),
      );
    return { connection, phone, conversation, member, reply };
  }

  const messageRow = (connection: TestConnection, id: string) =>
    test.db.forOrg(connection.organizationId, (tx) => tx.whatsappMessage.findUniqueOrThrow({ where: { id } }));

  /** The worker's run of the sender on a queued message. */
  const send = (connection: TestConnection, messageId: string, at: Date) =>
    sendQueued(
      { provider: test.provider, files: test.files, limiter: test.dependencies.limiter, logger: test.logger },
      listenerContext(test, connection.organizationId),
      { id: newUuidV7(), messageId },
      at,
    );

  it("queues a reply inside the window, once for one token, and the chat stops waiting", async () => {
    const { connection, conversation, reply } = await chat();
    const token = randomUUID();
    const first = await reply("Hello Priya", undefined, token);
    const again = await reply("Hello Priya", undefined, token);
    expect(first).toMatchObject({ status: "queued" });
    expect(again.messageId).toBe(first.messageId);
    const state = await test.db.forOrg(connection.organizationId, async (tx) => ({
      messages: await tx.whatsappMessage.findMany({ where: { direction: "out" } }),
      chat: await tx.whatsappConversation.findUniqueOrThrow({ where: { id: conversation.id } }),
      events: await tx.outboxEvent.findMany({ where: { type: "whatsapp.message-queued" } }),
    }));
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      origin: "staff_crm",
      kind: "text",
      body: "Hello Priya",
      status: "queued",
    });
    expect(state.chat).toMatchObject({ needsReply: false, lastMessageId: first.messageId });
    expect(state.events).toHaveLength(1);
    expect(state.events[0]?.payload).toEqual({ conversationId: conversation.id, messageId: first.messageId });
  });

  it("refuses a reply once the window has closed, and one for a paused or absent number", async () => {
    const { connection, reply, member, conversation } = await chat();
    await expect(reply("Late", new Date(testNow.getTime() + 25 * HOUR))).rejects.toMatchObject({
      reason: "WINDOW_CLOSED",
    });
    await expect(
      test.db.forOrg(connection.organizationId, (tx) =>
        queueText(
          tx,
          member,
          { conversationId: conversation.id, clientToken: randomUUID(), text: "x" },
          { whatsappConfigured: false },
          testNow,
        ),
      ),
    ).rejects.toMatchObject({ reason: "WHATSAPP_NOT_CONNECTED" });
    await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConnection.updateMany({ data: { status: "paused" } }),
    );
    await expect(reply("Paused")).rejects.toMatchObject({ reason: "WHATSAPP_PAUSED" });
  });

  it("sends a queued reply once: sent with its id, the lead's first reply, the month's count", async () => {
    const { connection, phone, reply } = await chat();
    const { leadId } = await test.db.forOrg(connection.organizationId, async (tx) => ({
      leadId: (await tx.lead.findFirstOrThrow()).id,
    }));
    const queued = await reply("Hello Priya");
    const at = new Date(testNow.getTime() + HOUR);
    expect(await send(connection, queued.messageId, at)).toBe("sent");
    expect(await send(connection, queued.messageId, at)).toBe("skipped");
    expect(
      test.provider.sent.filter((sent) => sent.to === phone.replace("+", "") && sent.text === "Hello Priya"),
    ).toHaveLength(1);
    const state = await test.db.forOrg(connection.organizationId, async (tx) => ({
      lead: await tx.lead.findUniqueOrThrow({ where: { id: leadId } }),
      usage: await tx.whatsappUsageMonth.findFirstOrThrow(),
      connection: await tx.whatsappConnection.findFirstOrThrow(),
    }));
    const row = await messageRow(connection, queued.messageId);
    expect(row).toMatchObject({ status: "sent", sentAt: at });
    expect(row.wamid).toMatch(/^wamid\./);
    expect(state.lead.firstReplyAt).toEqual(at);
    expect(state.usage.replies).toBe(1);
    expect(state.connection.lastSendOkAt).toEqual(at);
  });

  it("fails a reply whose window closed while it waited, and the chat waits for an answer again", async () => {
    const { connection, conversation, reply } = await chat();
    const queued = await reply("Hello");
    expect(await send(connection, queued.messageId, new Date(testNow.getTime() + 25 * HOUR))).toBe("failed");
    expect(await messageRow(connection, queued.messageId)).toMatchObject({
      status: "failed",
      failureCode: "window_closed",
    });
    const state = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConversation.findUniqueOrThrow({ where: { id: conversation.id } }),
    );
    expect(state.needsReply).toBe(true);
    expect(test.provider.sent.filter((sent) => sent.text === "Hello")).toHaveLength(0);
  });

  it("never sends a second time after a timeout: unsure is a failure for a person to look at", async () => {
    const { connection, reply } = await chat();
    const queued = await reply("Quote attached");
    test.provider.failNext("unsure");
    expect(await send(connection, queued.messageId, new Date(testNow.getTime() + HOUR))).toBe("failed");
    expect(await messageRow(connection, queued.messageId)).toMatchObject({ status: "failed", failureCode: "unsure" });
    expect(await send(connection, queued.messageId, new Date(testNow.getTime() + HOUR))).toBe("skipped");
    expect(test.provider.sent.filter((sent) => sent.text === "Quote attached")).toHaveLength(0);
  });

  it("tries a provider that was down again for five minutes, then gives up", async () => {
    const { connection, reply } = await chat();
    const queued = await reply("Hello");
    const soon = new Date(testNow.getTime() + HOUR + 60_000);
    test.provider.failNext("provider_down");
    await expect(send(connection, queued.messageId, soon)).rejects.toThrow();
    expect(await messageRow(connection, queued.messageId)).toMatchObject({ status: "queued", sentAt: null });
    test.provider.failNext("provider_down");
    const late = new Date(testNow.getTime() + HOUR + 6 * 60_000);
    expect(await send(connection, queued.messageId, late)).toBe("failed");
    expect(await messageRow(connection, queued.messageId)).toMatchObject({
      status: "failed",
      failureCode: "provider_down",
    });
  });

  it("holds a reply in the queue when the minute's budget is spent", async () => {
    const { connection, reply } = await chat();
    const queued = await reply("Hello");
    const spent = {
      provider: test.provider,
      files: test.files,
      limiter: { hit: () => Promise.resolve({ allowed: false, remaining: 0, retryAfterSeconds: 30 }) },
      logger: test.logger,
    };
    await expect(
      sendQueued(
        spent,
        listenerContext(test, connection.organizationId),
        { id: newUuidV7(), messageId: queued.messageId },
        new Date(testNow.getTime() + HOUR),
      ),
    ).rejects.toThrow();
    expect(await messageRow(connection, queued.messageId)).toMatchObject({ status: "queued" });
  });

  it("puts a failed message back in the queue on Try again, once for a double tap, and only a failed one", async () => {
    const { connection, member, reply } = await chat();
    const queued = await reply("Hello");
    await expect(
      test.db.forOrg(connection.organizationId, (tx) => retryMessage(tx, member, queued.messageId, context, testNow)),
    ).resolves.toMatchObject({ status: "queued" });
    test.provider.failNext("other");
    await send(connection, queued.messageId, new Date(testNow.getTime() + HOUR));
    const again = new Date(testNow.getTime() + 2 * HOUR);
    const retry = () =>
      test.db.forOrg(connection.organizationId, (tx) => retryMessage(tx, member, queued.messageId, context, again));
    expect(await retry()).toMatchObject({ status: "queued" });
    expect(await retry()).toMatchObject({ status: "queued" });
    const events = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.outboxEvent.findMany({ where: { type: "whatsapp.message-queued" } }),
    );
    expect(events).toHaveLength(2);
    expect(await send(connection, queued.messageId, again)).toBe("sent");
    await expect(retry()).rejects.toMatchObject({ reason: "NOT_FAILED" });
  });

  it("fails a row the sender left sending for over two minutes, as unsure", async () => {
    const { connection, reply } = await chat();
    const queued = await reply("Hello");
    await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappMessage.update({
        where: { id: queued.messageId },
        data: { status: "sending", sentAt: new Date(testNow.getTime() + HOUR) },
      }),
    );
    await checkConnection(
      test.dependencies,
      connection.organizationId,
      connection.connectionId,
      new Date(testNow.getTime() + HOUR + 3 * 60_000),
    );
    expect(await messageRow(connection, queued.messageId)).toMatchObject({ status: "failed", failureCode: "unsure" });
  });

  it("lets a salesperson reply only to the chats of leads they own", async () => {
    const { connection, conversation } = await chat();
    const stranger = memberOf(connection.organizationId, "sales");
    await expect(
      test.db.forOrg(connection.organizationId, (tx) =>
        queueText(
          tx,
          stranger,
          { conversationId: conversation.id, clientToken: randomUUID(), text: "Hi" },
          context,
          testNow,
        ),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("marks a chat answered without sending anything", async () => {
    const { connection, conversation, member, phone } = await chat();
    await test.db.forOrg(connection.organizationId, (tx) => markAnswered(tx, member, conversation.id));
    const state = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConversation.findUniqueOrThrow({ where: { id: conversation.id } }),
    );
    expect(state.needsReply).toBe(false);
    expect(test.provider.sent.filter((sent) => sent.to === phone.replace("+", ""))).toHaveLength(0);
  });

  it("sends a file: the browser's upload, the named message, then the picture through a link", async () => {
    const { connection, conversation, member, phone } = await chat();
    const deps = { db: test.db, files: test.files };
    const at = new Date(testNow.getTime() + HOUR);
    const slot = await requestMediaUpload(
      deps,
      member,
      {
        conversationId: conversation.id,
        fileName: "itinerary.png",
        contentType: "image/png",
        sizeBytes: tinyPng.byteLength,
      },
      context,
      at,
    );
    await test.storage.upload({ ...slot.upload, expiresAt: new Date(slot.upload.expiresAt) }, tinyPng, "image/png");
    const token = randomUUID();
    const input = {
      conversationId: conversation.id,
      messageId: slot.messageId,
      attachmentId: slot.attachmentId,
      clientToken: token,
      caption: "Your itinerary",
    };
    const queued = await queueMedia(deps, member, input, context, at);
    expect((await queueMedia(deps, member, input, context, at)).messageId).toBe(queued.messageId);
    expect(queued.messageId).toBe(slot.messageId);
    expect(await send(connection, queued.messageId, at)).toBe("sent");
    expect(await messageRow(connection, queued.messageId)).toMatchObject({
      kind: "image",
      caption: "Your itinerary",
      fileName: "itinerary.png",
      mediaState: "stored",
      status: "sent",
    });
    const sentMedia = test.provider.sent.find((sent) => sent.media !== undefined && sent.to === phone.replace("+", ""));
    expect(sentMedia?.media).toMatchObject({ kind: "image", caption: "Your itinerary", fileName: "itinerary.png" });
    expect(sentMedia?.media?.url).toMatch(/^memory:\/\/download\//);
    const files = await test.files.list(systemActor(connection.organizationId), {
      recordType: WHATSAPP_RECORD_TYPE,
      recordId: queued.messageId,
    });
    expect(files).toHaveLength(1);
  });

  it("refuses a file of a kind or size WhatsApp does not take here, and a file that was never uploaded", async () => {
    const { conversation, member } = await chat();
    const deps = { db: test.db, files: test.files };
    const at = new Date(testNow.getTime() + HOUR);
    await expect(
      requestMediaUpload(
        deps,
        member,
        {
          conversationId: conversation.id,
          fileName: "a.png",
          contentType: "image/png",
          sizeBytes: 16 * 1024 * 1024 + 1,
        },
        context,
        at,
      ),
    ).rejects.toThrow();
    const slot = await requestMediaUpload(
      deps,
      member,
      { conversationId: conversation.id, fileName: "a.png", contentType: "image/png", sizeBytes: 10 },
      context,
      at,
    );
    await expect(
      queueMedia(
        deps,
        member,
        {
          conversationId: conversation.id,
          messageId: slot.messageId,
          attachmentId: slot.attachmentId,
          clientToken: randomUUID(),
        },
        context,
        at,
      ),
    ).rejects.toThrow();
  });

  it("keeps a reply out of an audit snapshot and a job's data", async () => {
    const { connection, reply } = await chat();
    const queued = await reply("Private words about the booking");
    const state = await test.db.forOrg(connection.organizationId, async (tx) => ({
      audit: JSON.stringify(await tx.auditEntry.findMany()),
      events: JSON.stringify(await tx.outboxEvent.findMany()),
    }));
    expect(queued.status).toBe("queued");
    expect(state.audit).not.toContain("Private words");
    expect(state.events).not.toContain("Private words");
  });
});
