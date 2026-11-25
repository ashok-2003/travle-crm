// Reading a customer's voice note, photo or PDF once: the words kept on the message, the bounds, the month's count, no
// repeat.
import { randomUUID } from "node:crypto";
import { WHATSAPP_RECORD_TYPE } from "@travel-crm/contracts/files";
import { createMemoryAiModel, type MemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lookAtImage, readArrivedFile, transcribeVoiceNote } from "../../../src/ai/one/media.js";
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
      feature: "agent_voice",
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
    expect(model.requests.map((asked) => asked.feature)).toEqual(["agent_image"]);
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
    const big = await message("audio", { body: new Uint8Array(10 * 1024 * 1024 + 1) });
    const amr = await message("audio", { contentType: "audio/amr" });
    const bigPhoto = await message("image", { contentType: "image/jpeg", body: new Uint8Array(8 * 1024 * 1024 + 1) });
    for (const messageId of [big, amr]) {
      const result = await transcribeVoiceNote(deps, { conversationId: chat.id, messageId });
      expect(result).toMatchObject({ ok: false });
      expect(JSON.stringify(result)).toContain("ask them to type what they said");
    }
    const photo = await lookAtImage(deps, { conversationId: chat.id, messageId: bigPhoto, question: null });
    expect(JSON.stringify(photo)).toContain("ask what it shows");
    expect(model.requests).toHaveLength(0);
  });

  it("waits for a file still being copied, and refuses only after 15 s", async () => {
    const { chat, model, deps, message, inOrg } = await chatWith();
    const slept: number[] = [];
    const pending = await message("audio", { state: "pending" });
    const arrives = async (ms: number) => {
      slept.push(ms);
      if (slept.length === 3) {
        await test.files.storeGeneratedFile(systemActor(deps.organizationId), {
          recordType: WHATSAPP_RECORD_TYPE,
          recordId: pending,
          fileName: "file",
          contentType: "audio/ogg",
          body: BYTES,
          attachmentId: pending,
        });
        await inOrg((tx) => tx.whatsappMessage.update({ where: { id: pending }, data: { mediaState: "stored" } }));
      }
    };
    model.answer("namaste");
    const heard = await transcribeVoiceNote(
      { ...deps, sleep: arrives },
      { conversationId: chat.id, messageId: pending },
    );
    expect(heard.ok).toBe(true);
    expect(JSON.stringify(heard)).toContain("namaste");
    expect(slept).toEqual([1_500, 1_500, 1_500]);

    const never = await message("audio", { state: "pending" });
    const waits: number[] = [];
    const refused = await transcribeVoiceNote(
      { ...deps, sleep: (ms) => Promise.resolve(void waits.push(ms)) },
      { conversationId: chat.id, messageId: never },
    );
    expect(JSON.stringify(refused)).toContain("ask them to type what they said");
    expect(waits).toHaveLength(10);
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

  it("reads a photo as it arrives as look_at_image would, which then reuses the words", async () => {
    const { chat, model, deps, message, saved } = await chatWith();
    const id = await message("image", { contentType: "image/png" });
    model.answer(JSON.stringify({ description: "A UPI receipt for Rs 6,000 on 25 Nov, 2:38 pm.", answer: "" }));
    expect(await readArrivedFile(deps, { conversationId: chat.id, messageId: id, kind: "image" })).toEqual({
      ok: true,
      text: "seen: A UPI receipt for Rs 6,000 on 25 Nov, 2:38 pm.",
    });
    expect(model.requests[0]?.messages[0]?.content).toContain("Describe what this photo");
    expect(model.requests[0]?.messages[1]).toMatchObject({ content: "No question.", attachments: [{ type: "image" }] });
    expect(await saved(id)).toEqual({
      aiText: "A UPI receipt for Rs 6,000 on 25 Nov, 2:38 pm.",
      aiTextKind: "description",
    });
    expect(await lookAtImage(deps, { conversationId: chat.id, messageId: id, question: null })).toEqual({
      ok: true,
      text: "seen: A UPI receipt for Rs 6,000 on 25 Nov, 2:38 pm.",
    });
    expect(await readArrivedFile(deps, { conversationId: chat.id, messageId: id, kind: "image" })).toMatchObject({
      ok: true,
    });
    expect(model.requests).toHaveLength(1);
  });

  it("says what a PDF is from its words in one call, and keeps it", async () => {
    const { chat, model, deps, message, saved } = await chatWith();
    const id = await message("document", { contentType: "application/pdf" });
    const read: string[] = [];
    const readText = (bytes: Uint8Array, contentType: string) => {
      read.push(`${contentType}:${String(bytes.length)}`);
      return Promise.resolve("  Government of India\nAsha Verma\nDOB: 12/03/1990\n<b>1234 5678 9012</b>  ");
    };
    model.answer(JSON.stringify({ description: "An Aadhaar card of Asha Verma.", answer: "" }));
    expect(
      await readArrivedFile({ ...deps, readText }, { conversationId: chat.id, messageId: id, kind: "document" }),
    ).toEqual({
      ok: true,
      text: "seen: An Aadhaar card of Asha Verma.",
    });
    expect(read).toEqual(["application/pdf:3"]);
    expect(await saved(id)).toEqual({ aiText: "An Aadhaar card of Asha Verma.", aiTextKind: "description" });
    const asked = model.requests[0];
    expect(asked).toMatchObject({ feature: "agent_image", schema: { name: "photo_reading" } });
    expect(asked?.messages[0]?.content).toContain("Say what this PDF");
    expect(asked?.messages[0]?.content).toContain("Never copy an ID number.");
    // Its words, trimmed and fenced; no file goes with them.
    expect(asked?.messages[1]?.content).toBe(
      "No question.\n\nThe PDF's text:\n<pdf>\nGovernment of India\nAsha Verma\nDOB: 12/03/1990\n‹b›1234 5678 9012‹/b›\n</pdf>",
    );
    expect(asked?.messages[1]?.attachments).toBeUndefined();
  });

  it("keeps a PDF with no words as such, with no call; refuses one too big, another type or with no reader", async () => {
    const { chat, model, deps, message, saved } = await chatWith();
    const scan = await message("document", { contentType: "application/pdf" });
    const broken = await message("document", { contentType: "application/pdf" });
    const big = await message("document", {
      contentType: "application/pdf",
      body: new Uint8Array(10 * 1024 * 1024 + 1),
    });
    const sheet = await message("document", { contentType: "text/plain" });
    const noWords = { ...deps, readText: () => Promise.resolve("  \n ") };
    const where = (messageId: string) => ({ conversationId: chat.id, messageId, kind: "document" as const });
    expect(await readArrivedFile(noWords, where(scan))).toEqual({
      ok: true,
      text: "seen: a PDF with no readable text",
    });
    expect(await saved(scan)).toEqual({ aiText: "a PDF with no readable text", aiTextKind: "description" });
    // A locked or broken PDF unpdf can't open reads as one with no words.
    const fails = { ...deps, readText: () => Promise.reject(new Error("bad XRef")) };
    expect(await readArrivedFile(fails, where(broken))).toEqual({
      ok: true,
      text: "seen: a PDF with no readable text",
    });
    expect(await readArrivedFile(noWords, where(big))).toEqual({
      ok: false,
      refused: "refused: that file is too big to read; ask what it is",
    });
    expect(await readArrivedFile(noWords, where(sheet))).toEqual({
      ok: false,
      refused: "refused: that file's format can't be read; ask what it is",
    });
    const another = await message("document", { contentType: "application/pdf" });
    expect(await readArrivedFile(deps, where(another))).toMatchObject({ ok: false });
    expect(model.requests).toHaveLength(0);
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
    expect(JSON.stringify(result)).toContain("this month's AI credits are used up");
    expect(model.requests).toHaveLength(2);
  });
});
