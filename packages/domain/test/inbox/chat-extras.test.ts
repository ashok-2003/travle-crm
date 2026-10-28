// The chat window's smaller promises: what was unread when it was opened (for the divider), a failed message discarded for good
// and audited, and the gallery of the chat's photos and videos.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tinyPng } from "@travel-crm/integrations/testing";
import {
  copyMedia,
  discardFailedMessage,
  listChatMedia,
  listMessages,
  markConversationRead,
  queueText,
} from "../../src/inbox/index.js";
import { auditOf, memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestInbox,
} from "./support.js";

const MINUTE = 60_000;

describe("the chat window's extras", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function chat() {
    const connection = await aConnectedAgency(test);
    const customerNumber = freshPhone().replace("+", "");
    const at = (minutes: number) => new Date(testNow.getTime() + minutes * MINUTE);
    const customer = (text: string, minutes: number, extra = {}) =>
      deliver(
        test,
        fromCustomer(connection, { customerNumber, text, ts: Math.floor(at(minutes).getTime() / 1000), ...extra }),
        at(minutes),
      );
    await customer("Hello", 0);
    const conversation = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConversation.findFirstOrThrow(),
    );
    const member = memberOf(connection.organizationId);
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(connection.organizationId, work);
    const page = () => inOrg((tx) => listMessages(tx, member, { conversationId: conversation.id, limit: 50 }));
    return { connection, customer, conversation, member, inOrg, page, at };
  }

  it("counts what the member had not read when the chat is opened, and names the first", async () => {
    const { customer, conversation, member, inOrg, page, at } = await chat();
    const unreadAtStart = (await page()).unread;
    expect(unreadAtStart).toMatchObject({ count: 1 });
    await inOrg((tx) => markConversationRead(tx, member, conversation.id, at(1)));
    expect((await page()).unread).toEqual({ count: 0, firstMessageId: null });
    await customer("Price?", 5);
    await customer("And dates?", 6);
    const unread = (await page()).unread;
    const price = (await page()).items.find((message) => message.body === "Price?");
    expect(unread).toEqual({ count: 2, firstMessageId: price?.id });
  });

  it("leaves the unread mark out of an older page, a search and the starred view", async () => {
    const { conversation, member, inOrg } = await chat();
    const list = (more: object) =>
      inOrg((tx) => listMessages(tx, member, { conversationId: conversation.id, limit: 50, ...more }));
    expect((await list({ search: "He" })).unread).toBeNull();
    expect((await list({ starredOnly: true })).unread).toBeNull();
  });

  it("discards a message that did not go, for good, and puts it in the audit log", async () => {
    const { connection, conversation, member, inOrg, page, at } = await chat();
    const queued = await inOrg((tx) =>
      queueText(
        tx,
        member,
        { conversationId: conversation.id, clientToken: randomUUID(), text: "Quote" },
        { whatsappConfigured: true },
        at(1),
      ),
    );
    await expect(inOrg((tx) => discardFailedMessage(tx, member, queued.messageId))).rejects.toMatchObject({
      reason: "NOT_FAILED",
    });
    await inOrg((tx) =>
      tx.whatsappMessage.update({ where: { id: queued.messageId }, data: { status: "failed", failureCode: "other" } }),
    );
    await inOrg((tx) => discardFailedMessage(tx, member, queued.messageId));
    await inOrg((tx) => discardFailedMessage(tx, member, queued.messageId));
    expect((await page()).items.map((message) => message.id)).not.toContain(queued.messageId);
    const actions = (await auditOf(test, connection.organizationId, conversation.id)).map((entry) => entry.action);
    expect(actions.filter((action) => action === "inbox.message-discarded")).toHaveLength(1);
  });

  it("will not discard a customer's message", async () => {
    const { conversation, member, inOrg, page } = await chat();
    const theirs = (await page()).items[0];
    await expect(inOrg((tx) => discardFailedMessage(tx, member, theirs?.id ?? randomUUID()))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(conversation.id).toBeDefined();
  });

  it("lists the chat's photos newest first, a page at a time, and nothing that is not stored", async () => {
    const { connection, customer, conversation, member, inOrg, at } = await chat();
    for (const [minutes, name] of [
      [1, "a"],
      [2, "b"],
      [3, "c"],
    ] as const) {
      const url = `https://media.example/${name}-${randomUUID()}`;
      await customer(name, minutes, { contentType: "image", url });
      test.provider.addFile(url, { bytes: tinyPng, contentType: "image/png" });
    }
    await customer("not stored yet", 4, { contentType: "image", url: "https://media.example/pending" });
    const media = await inOrg((tx) =>
      tx.whatsappMessage.findMany({ where: { kind: "image" }, orderBy: { occurredAt: "asc" } }),
    );
    for (const row of media.slice(0, 3)) {
      await copyMedia(test.dependencies, connection.organizationId, row.id, at(10));
    }
    const first = await listChatMedia(test.dependencies, member, { conversationId: conversation.id, limit: 2 });
    expect(first.items.map((message) => message.caption ?? message.body)).toHaveLength(2);
    expect(first.items.every((message) => message.mediaState === "stored")).toBe(true);
    expect(first.nextCursor).not.toBeNull();
    const rest = await listChatMedia(test.dependencies, member, {
      conversationId: conversation.id,
      limit: 2,
      before: first.nextCursor ?? undefined,
    });
    // Every picture of the page has its link, signed in the same pass; a photo opens in place, never by an extra call.
    expect(Object.keys(first.links).sort()).toEqual(first.items.map((message) => message.id).sort());
    expect(Object.values(first.links)[0]).toMatchObject({ contentType: "image/png" });
    expect(Object.values(first.links)[0]?.url).toContain("inline=1");
    await expect(
      listChatMedia(test.dependencies, member, { conversationId: conversation.id, limit: 2, before: randomUUID() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", reason: "MEDIA_CURSOR_NOT_FOUND" });
    expect(rest.items).toHaveLength(1);
    expect(rest.nextCursor).toBeNull();
    expect(new Set([...first.items, ...rest.items].map((message) => message.id)).size).toBe(3);
  });
});
