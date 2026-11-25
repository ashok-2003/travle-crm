// A customer's photo or PDF read once as it arrives (the owner, 2026-11-25): queued when its file is stored, for a chat
// the agency's AI reads, even while the team handles it; never for our own files, a sticker, a file already read, a
// chat whose AI is off or an agency with no AI; the read keeps the words and asks no model twice.
import { randomUUID } from "node:crypto";
import { WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AI_READ_FILE_QUEUE, aiFileStoredListener, aiReadFileHandler } from "../../src/ai/index.js";
import type { ListenerContext } from "../../src/jobs/index.js";
import { systemActor } from "../../src/kernel/index.js";
import type { Entitlements } from "../../src/subscriptions/index.js";
import { createTestInbox, testNow, type TestInbox } from "../inbox/support.js";
import { liteAgency, liteEntitlements, liteTurnAt } from "./lite/support/lite-agency.js";

type Agency = Awaited<ReturnType<typeof liteAgency>>;

describe("a customer's photo or PDF, read as it arrives", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());
  afterEach(() => vi.useRealTimers());

  /** A message in the agency's chat whose file is stored. */
  async function fileIn(on: Agency, kind: string, options: { direction?: string; contentType?: string } = {}) {
    const { direction = "in", contentType = "image/jpeg" } = options;
    const row = await on.inOrg((tx) =>
      tx.whatsappMessage.create({
        data: {
          conversationId: on.chat.id,
          direction,
          origin: direction === "in" ? "customer" : "staff_phone",
          kind,
          wamid: randomUUID(),
          status: "received",
          occurredAt: testNow,
          mediaState: "stored",
        },
        select: { id: true },
      }),
    );
    await test.files.storeGeneratedFile(systemActor(on.organizationId), {
      recordType: WHATSAPP_RECORD_TYPE,
      recordId: row.id,
      fileName: "file",
      contentType,
      body: new Uint8Array([1, 2, 3]),
      attachmentId: row.id,
    });
    return row.id;
  }

  /** The ids of the messages the listener queued to be read, when each of `messageIds` was stored. */
  async function queuedFor(on: Agency, messageIds: string[], entitlements: Entitlements = liteEntitlements) {
    vi.useFakeTimers({ now: liteTurnAt, toFake: ["Date"] });
    const before = test.queue.sent.length;
    const context: ListenerContext = { actor: systemActor(on.organizationId), forOrg: (work) => on.inOrg(work) };
    const listener = aiFileStoredListener({
      queue: test.queue,
      subscriptions: { entitlementsOf: () => Promise.resolve(entitlements) },
    });
    for (const messageId of messageIds) {
      await listener.handle(
        {
          id: randomUUID(),
          organizationId: on.organizationId,
          type: "whatsapp.media-stored",
          payload: { conversationId: on.chat.id, messageId },
          occurredAt: testNow,
        },
        context,
      );
    }
    vi.useRealTimers();
    return test.queue.sent
      .slice(before)
      .filter((job) => job.queue === AI_READ_FILE_QUEUE)
      .map((job) => job.data.messageId);
  }

  it("queues a customer's photo and document, never our own file, a sticker, a voice note or one already read", async () => {
    const on = await liteAgency(test);
    const photo = await fileIn(on, "image");
    const pdf = await fileIn(on, "document", { contentType: "application/pdf" });
    const ours = await fileIn(on, "image", { direction: "out" });
    const sticker = await fileIn(on, "sticker", { contentType: "image/webp" });
    const voice = await fileIn(on, "audio", { contentType: "audio/ogg" });
    const seen = await fileIn(on, "image");
    await on.inOrg((tx) =>
      tx.whatsappMessage.update({ where: { id: seen }, data: { aiText: "A trek photo", aiTextKind: "description" } }),
    );

    expect(await queuedFor(on, [photo, pdf, ours, sticker, voice, seen])).toEqual([photo, pdf]);
    // Once per message, however often the event comes.
    expect(await queuedFor(on, [photo])).toEqual([]);
    expect(test.queue.sent.find((job) => job.id === photo && job.queue === AI_READ_FILE_QUEUE)?.data).toEqual({
      organizationId: on.organizationId,
      conversationId: on.chat.id,
      messageId: photo,
    });
  });

  it("reads while the team handles the chat, but not where the AI is off for it or the agency has none", async () => {
    const answering = await liteAgency(test);
    await answering.inOrg((tx) =>
      tx.whatsappMessage.create({
        data: {
          conversationId: answering.chat.id,
          direction: "out",
          origin: "staff_crm",
          kind: "text",
          body: "Main dekhta hoon",
          status: "sent",
          occurredAt: new Date(liteTurnAt.getTime() - 60_000),
        },
      }),
    );
    await answering.inOrg((tx) =>
      tx.aiChat.create({ data: { conversationId: answering.chat.id, handedOffAt: liteTurnAt } }),
    );
    const handled = await fileIn(answering, "image");
    expect(await queuedFor(answering, [handled])).toEqual([handled]);

    const chatOff = await liteAgency(test);
    await chatOff.inOrg((tx) => tx.aiChat.create({ data: { conversationId: chatOff.chat.id, mode: "off" } }));
    expect(await queuedFor(chatOff, [await fileIn(chatOff, "image")])).toEqual([]);

    const agentOff = await liteAgency(test);
    await agentOff.inOrg((tx) => tx.aiAutopilot.updateMany({ data: { autopilot: false } }));
    expect(await queuedFor(agentOff, [await fileIn(agentOff, "image")])).toEqual([]);

    const noAi = await liteAgency(test);
    const withoutAi: Entitlements = { ...liteEntitlements, modules: new Set(["crm", "inbox"] as const) };
    expect(await queuedFor(noAi, [await fileIn(noAi, "image")], withoutAi)).toEqual([]);
  });

  it("reads the file once, counted against the month, and logs no words", async () => {
    const on = await liteAgency(test);
    const photo = await fileIn(on, "image");
    const logger = createMemoryLogger();
    const handler = aiReadFileHandler({
      db: test.db,
      files: test.files,
      ai: on.model,
      readText: () => Promise.resolve(null),
      logger,
    });
    const job = { organizationId: on.organizationId, conversationId: on.chat.id, messageId: photo };
    on.model.answer(JSON.stringify({ description: "A UPI receipt for Rs 6,000 on 25 Nov.", answer: "" }));

    await handler.handle(job);
    await handler.handle(job);

    const saved = await on.inOrg((tx) =>
      tx.whatsappMessage.findUniqueOrThrow({ where: { id: photo }, select: { aiText: true, aiTextKind: true } }),
    );
    expect(saved).toEqual({ aiText: "A UPI receipt for Rs 6,000 on 25 Nov.", aiTextKind: "description" });
    expect(on.model.requests.map((asked) => asked.feature)).toEqual(["agent_image"]);
    expect((await on.inOrg((tx) => tx.aiUsage.findFirst()))?.calls).toBe(1);
    expect(logger.entries.map((entry) => entry.outcome)).toEqual(["read", "read"]);
    expect(JSON.stringify(logger.entries)).not.toContain("UPI");
  });
});
