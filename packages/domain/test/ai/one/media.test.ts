// Reading a customer's voice note or photo once: the words kept on the message, the bounds, the month's count, no repeat.
import { randomUUID } from "node:crypto";
import { WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import { createMemoryAiModel, type MemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lookAtImage, transcribeVoiceNote } from "../../../src/ai/one/media.js";
import { countedModel } from "../../../src/ai/natural/counted-model.js";
import { systemActor } from "../../../src/kernel/index.js";
import { aConnectedAgency, createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";

const ZONE = "Asia/Kolkata";
const BYTES = new Uint8Array([1, 2, 3]);

describe("the one agent reads a voice note or a photo", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /** A chat with the customer's messages we ask for; each can hold a stored file. */
  async function chatWith() {
    const { organizationId, connectionId } = await aConnectedAgency(test);
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const makeChat = () =>
      inOrg((tx) =>
        tx.whatsappConversation.create({
          data: { connectionId, phoneE164: `+9199${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}` },
          select: { id: true },
        }),
      );
    const chat = await makeChat();
    const model: MemoryAiModel = createMemoryAiModel();
    const call = countedModel(model, { db: test.db, organizationId, now: testNow, timeZone: ZONE });
    const deps = { db: test.db, files: test.files, call, organizationId };
    async function message(
      kind: string,
      options: {
        contentType?: string;
        state?: string;
        body?: Uint8Array;
        direction?: string;
        conversationId?: string;
      } = {},
    ) {
      const { contentType = "audio/ogg", state = "stored", body = BYTES, direction = "in" } = options;
      const row = await inOrg((tx) =>
        tx.whatsappMessage.create({
          data: {
            conversationId: options.conversationId ?? chat.id,
            direction,
            origin: direction === "in" ? "customer" : "staff_crm",
            kind,
            wamid: randomUUID(),
            status: "received",
            occurredAt: testNow,
            mediaState: state,
          },
          select: { id: true },
        }),
      );
      if (state === "stored") {
        await test.files.storeGeneratedFile(systemActor(organizationId), {
          recordType: WHATSAPP_RECORD_TYPE,
          recordId: row.id,
          fileName: "file",
          contentType,
          body,
          attachmentId: row.id,
        });
      }
      return row.id;
    }
    const saved = (id: string) =>
      inOrg((tx) => tx.whatsappMessage.findFirstOrThrow({ where: { id }, select: { aiText: true, aiTextKind: true } }));
    const calls = async () => (await inOrg((tx) => tx.aiUsage.findFirst()))?.calls ?? 0;
    return { chat, model, deps, message, saved, calls, makeChat, inOrg };
  }

  it("transcribes a voice note once and keeps the words", async () => {
    const { chat, model, deps, message, saved } = await chatWith();
    const id = await message("audio");
    model.answer("Mujhe Manali ka package chahiye");
    expect(await transcribeVoiceNote(deps, { conversationId: chat.id, messageId: id })).toEqual({
      ok: true,
      text: "Mujhe Manali ka package chahiye",
    });
    expect(await saved(id)).toEqual({ aiText: "Mujhe Manali ka package chahiye", aiTextKind: "transcript" });
    const asked = model.requests[0];
    expect(asked).toMatchObject({
      feature: "sales_agent",
      maxTokens: 2000,
      reasoning: { effort: "minimal" },
      timeoutMs: 60_000,
    });
    expect(asked?.user).toBe(deps.organizationId);
    expect(asked?.messages[1]?.attachments).toEqual([{ type: "audio", format: "ogg", bytes: BYTES }]);
  });

  it("answers from the kept words with no call", async () => {
    const { chat, model, deps, message } = await chatWith();
    const id = await message("audio");
    model.answer("Do log honge");
    await transcribeVoiceNote(deps, { conversationId: chat.id, messageId: id });
    const again = await transcribeVoiceNote(deps, { conversationId: chat.id, messageId: id });
    expect(again).toEqual({ ok: true, text: "Do log honge" });
    expect(model.requests).toHaveLength(1);
  });

  it("describes a photo, keeps the description and answers the question", async () => {
    const { chat, model, deps, message, saved } = await chatWith();
    const id = await message("image", { contentType: "image/jpeg" });
    model.answer(JSON.stringify({ description: "A UPI receipt for Rs 5,000 on 12 Dec.", answer: "Rs 5,000." }));
    expect(await lookAtImage(deps, { conversationId: chat.id, messageId: id, question: "How much?" })).toEqual({
      ok: true,
      text: "seen: A UPI receipt for Rs 5,000 on 12 Dec.\nanswer: Rs 5,000.",
    });
    expect(await saved(id)).toEqual({ aiText: "A UPI receipt for Rs 5,000 on 12 Dec.", aiTextKind: "description" });
    // Without a question the kept description is enough; with one, the photo is asked about again.
    expect(await lookAtImage(deps, { conversationId: chat.id, messageId: id, question: null })).toEqual({
      ok: true,
      text: "seen: A UPI receipt for Rs 5,000 on 12 Dec.",
    });
    expect(model.requests).toHaveLength(1);
    model.answer(JSON.stringify({ description: "ignored", answer: "12 Dec." }));
    expect(await lookAtImage(deps, { conversationId: chat.id, messageId: id, question: "When?" })).toEqual({
      ok: true,
      text: "seen: A UPI receipt for Rs 5,000 on 12 Dec.\nanswer: 12 Dec.",
    });
    expect(model.requests).toHaveLength(2);
  });

  it("refuses another chat's message, our own photo and a sticker", async () => {
    const { chat, model, deps, message, makeChat } = await chatWith();
    const other = await makeChat();
    const elsewhere = await message("audio", { conversationId: other.id });
    const ours = await message("image", { contentType: "image/jpeg", direction: "out" });
    const sticker = await message("sticker", { contentType: "image/webp" });
    const text = await message("text", { state: "none" });
    for (const messageId of [elsewhere, text]) {
      expect(await transcribeVoiceNote(deps, { conversationId: chat.id, messageId })).toMatchObject({ ok: false });
    }
    for (const messageId of [ours, sticker, text, randomUUID()]) {
      expect(await lookAtImage(deps, { conversationId: chat.id, messageId, question: null })).toEqual({
        ok: false,
        refused: "refused: that isn't their photo",
      });
    }
    expect(model.requests).toHaveLength(0);
  });

  it("refuses a file not kept yet or too big, and AMR audio, with no call", async () => {
    const { chat, model, deps, message } = await chatWith();
    const pending = await message("audio", { state: "pending" });
    const big = await message("audio", { body: new Uint8Array(10 * 1024 * 1024 + 1) });
    const amr = await message("audio", { contentType: "audio/amr" });
    const bigPhoto = await message("image", { contentType: "image/jpeg", body: new Uint8Array(8 * 1024 * 1024 + 1) });
    for (const messageId of [pending, big, amr]) {
      const result = await transcribeVoiceNote(deps, { conversationId: chat.id, messageId });
      expect(result).toMatchObject({ ok: false });
      expect(JSON.stringify(result)).toContain("ask them to type what they said");
    }
    const photo = await lookAtImage(deps, { conversationId: chat.id, messageId: bigPhoto, question: null });
    expect(JSON.stringify(photo)).toContain("ask what it shows");
    expect(model.requests).toHaveLength(0);
  });

  it("answers a model that can't play it with the way on", async () => {
    const { chat, model, deps, message, saved } = await chatWith();
    const id = await message("audio");
    const photo = await message("image", { contentType: "image/png" });
    model.answer({ ok: false, reason: "bad_request" }, "not json at all");
    expect(await transcribeVoiceNote(deps, { conversationId: chat.id, messageId: id })).toEqual({
      ok: false,
      refused: "refused: it couldn't be played just now; ask them to type what they said",
    });
    expect(await lookAtImage(deps, { conversationId: chat.id, messageId: photo, question: null })).toEqual({
      ok: false,
      refused: "refused: it couldn't be seen just now; ask what it shows",
    });
    expect(await saved(id)).toEqual({ aiText: null, aiTextKind: null });
  });

  it("keeps the first of two transcripts written at once", async () => {
    const { chat, model, deps, message, saved } = await chatWith();
    const id = await message("audio");
    model.answer("first words", "second words");
    const both = await Promise.all([
      transcribeVoiceNote(deps, { conversationId: chat.id, messageId: id }),
      transcribeVoiceNote(deps, { conversationId: chat.id, messageId: id }),
    ]);
    const kept = (await saved(id)).aiText;
    expect(both).toEqual([
      { ok: true, text: kept },
      { ok: true, text: kept },
    ]);
  });

  it("counts each read against the month", async () => {
    const { chat, model, deps, message, calls, inOrg } = await chatWith();
    const voice = await message("audio");
    const photo = await message("image", { contentType: "image/jpeg" });
    model.answer("words", JSON.stringify({ description: "A trek photo", answer: "" }));
    await transcribeVoiceNote(deps, { conversationId: chat.id, messageId: voice });
    await lookAtImage(deps, { conversationId: chat.id, messageId: photo, question: null });
    expect(await calls()).toBe(2);
    // Used up: a read asks no model and says why.
    const next = await message("audio");
    await inOrg((tx) => tx.aiUsage.updateMany({ data: { calls: 1_000_000 } }));
    const result = await transcribeVoiceNote(deps, { conversationId: chat.id, messageId: next });
    expect(JSON.stringify(result)).toContain("this month's AI calls are used up");
    expect(model.requests).toHaveLength(2);
  });
});
