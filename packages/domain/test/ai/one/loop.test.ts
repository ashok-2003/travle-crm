// The one agent's turn (spec 3; rulings R5, R7, P7, P8) on the in-memory tool agent, with a scripted model, a fake IO and
// a fake clock, no database: its requests, the words beside actions, the one extra call for words, the fallback,
// the ends the port passes through, and the trace.
import { oneHandOverArguments, oneToolSchemas, type NaturalToolName } from "@travel-crm/contracts/ai";
import { createMemoryAiModel, type MemoryAiModel } from "@travel-crm/integrations/ai";
import { createMemoryToolAgent } from "@travel-crm/integrations/tool-agent";
import { beforeEach, describe, expect, it } from "vitest";
import type { LoopEnd } from "../../../src/ai/natural/loop/types.js";
import { HAND_OVER_WORDS, NO_WORDS } from "../../../src/ai/natural/loop/words.js";
import { startNaturalTrace, type NaturalTraceBuilder } from "../../../src/ai/natural/trace.js";
import type { QuoteFigures, StagedAction } from "../../../src/ai/natural/types.js";
import type { OneContext } from "../../../src/ai/one/context.js";
import { runOneLoop, type OneLoopIO, type OneSettings } from "../../../src/ai/one/loop.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

// Sat 14 Nov 2026, 11:43 pm in Kolkata; each model call takes 2 s on the fake clock.
const START = Date.parse("2026-11-14T18:13:00Z");
const CALL_MS = 2_000;
const ORGANIZATION = "organization-1";
const LITE = "google/gemini-3.5-flash-lite";
const APP_CHECK = "[app check, not from the customer]";

const quoted: QuoteFigures = {
  terms: {
    packageId: "package-1",
    startsOn: "2026-12-19",
    adults: 2,
    childrenAges: [],
    room: "triple",
    payInFull: false,
  },
  departureId: "departure-1",
  perPersonPaise: 949_900,
  totalPaise: 1_899_800,
  advancePaise: 600_000,
  advancePerPersonPaise: 300_000,
  freeSeats: 12,
};
const terms = { trip_id: "T1", date: "2026-12-19", adults: 2 };
const quoteCall = { name: "quote", arguments: terms };
const offerCall = { name: "offer_booking", arguments: terms };
const bookCall = { name: "book", arguments: terms };
const brochureCall = { name: "send_brochure", arguments: { brochure_id: "B1" } };
const leadCall = { name: "update_lead", arguments: { adults: 2 } };
const quietCall = { name: "stay_quiet", arguments: { reason: "said ok" } };
const handOverCall = (reason: string) => ({ name: "hand_over", arguments: { reason, summary: "Wants 10% off for 6" } });
const handOver: StagedAction = { tool: "hand_over", reason: "payment_check", summary: "Payment screenshot to check" };
const QUOTE_RESULT = "quote: Sat 19 Dec, 2 adults, total ₹18,998";

/** What the fake stages for each action the tests call; one's booking has no name and no words. */
const staging: Partial<Record<NaturalToolName, StagedAction>> = {
  update_lead: { tool: "update_lead", fields: { adults: 2 }, notes: [] },
  send_brochure: { tool: "send_brochure", packageId: "package-1", fileIds: ["file-1"] },
  offer_booking: {
    tool: "offer_booking",
    offer: { ...quoted.terms, departureId: "departure-1", totalPaise: 1_899_800, advancePaise: 600_000, at: "x" },
    figures: quoted,
  },
  book: { tool: "book", terms: quoted.terms, figures: quoted, fullName: null, customerWords: null, via: "offer" },
  resend_payment: { tool: "resend_payment" },
  stay_quiet: { tool: "stay_quiet", reason: "said ok" },
};

function contextOf(): OneContext {
  return {
    messages: [
      { role: "system", content: "You are Riya, of Case Trips, on WhatsApp." },
      {
        role: "user",
        content: "<now>Sat 14 Nov 2026, 11:43 pm</now>\nNew messages:\n[Sat 14 Nov, 11:42 pm] Kedarkantha ka rate?",
      },
    ],
    labels: new Map([
      ["T1", "package-1"],
      ["T2", "package-2"],
    ]),
    newLines: [
      { id: "line-1", from: "customer", at: new Date(START - 60_000), kind: "text", text: "Kedarkantha ka rate?" },
    ],
    tools: oneToolSchemas({ tripLabels: ["T1", "T2"], brochureLabels: ["B1", "B2"] }),
    media: new Map(),
  };
}

interface FakeIO extends OneLoopIO {
  now: number;
  reads: string[];
  stagings: { name: string; words: string; quoted: number }[];
}

let model: MemoryAiModel;
let io: FakeIO;
let trace: NaturalTraceBuilder;

function fakeIO(): FakeIO {
  const fake: FakeIO = {
    now: START,
    reads: [],
    stagings: [],
    agent: createMemoryToolAgent(),
    call: async (request) => {
      const result = await model.complete(request);
      fake.now += CALL_MS;
      return result;
    },
    read: (name) => {
      fake.reads.push(name);
      return Promise.resolve({ result: QUOTE_RESULT, figures: name === "quote" ? quoted : null });
    },
    stage: (name, args, words, sofar) => {
      fake.stagings.push({ name, words, quoted: sofar.length });
      const handing = name === "hand_over" ? oneHandOverArguments.safeParse(args) : null;
      const staged: StagedAction = handing?.success
        ? { tool: "hand_over", reason: handing.data.reason, summary: handing.data.summary }
        : (staging[name] ?? { tool: "add_note", text: name });
      return Promise.resolve({ staged, result: `${name}: staged` });
    },
    newerLine: () => Promise.resolve(false),
    clock: () => fake.now,
  };
  return fake;
}

async function loop(more: Partial<OneSettings> = {}): Promise<LoopEnd> {
  trace = startNaturalTrace({ version: "one-1" }, START, "one");
  const settings: OneSettings = {
    organizationId: ORGANIZATION,
    forced: [],
    today: parseCalendarDate("2026-11-14"),
    ...more,
  };
  return runOneLoop(contextOf(), io, settings, trace);
}

const finished = () => trace.finish("replied", null, io.now);
const stagedOf = (end: LoopEnd) => (end.end === "final" || end.end === "fallback" ? [...end.staged.keys()] : null);

beforeEach(() => {
  model = createMemoryAiModel();
  io = fakeIO();
});

describe("the one agent's loop", () => {
  it("replies after a read, with the staged actions, the quotes, the model and the transcript", async () => {
    const reply = "Sat 19 Dec, 2 log: total ₹18,998.";
    model.answer({ toolCalls: [quoteCall, leadCall], model: LITE }, { text: reply, model: LITE });
    expect(await loop()).toEqual({
      end: "final",
      messages: [reply],
      staged: new Map([["update_lead", staging.update_lead]]),
      quoted: [quoted],
      transcript: [
        ...contextOf().messages,
        {
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "call_1", name: "quote", arguments: JSON.stringify(terms) },
            { id: "call_2", name: "update_lead", arguments: JSON.stringify(leadCall.arguments) },
          ],
          model: LITE,
        },
        { role: "tool", toolCallId: "call_1", content: QUOTE_RESULT },
        { role: "tool", toolCallId: "call_2", content: "update_lead: staged" },
        { role: "assistant", content: reply, model: LITE },
      ],
      callsUsed: 2,
      model: LITE,
    });
    expect(io.reads).toEqual(["quote"]);
    expect(io.stagings).toEqual([{ name: "update_lead", words: "", quoted: 1 }]);
  });

  it("asks every call for sales_agent, 8,000 tokens, low effort, 60 s, the organization, and Try it's model", async () => {
    model.answer({ toolCalls: [quoteCall] }, "Sat 19 Dec, 2 log: total ₹18,998.");
    await loop();
    for (const request of model.requests) {
      expect(request).toMatchObject({
        feature: "sales_agent",
        toolChoice: "auto",
        maxTokens: 8000,
        reasoning: { effort: "low" },
        timeoutMs: 60_000,
        user: ORGANIZATION,
      });
      expect(request.tools?.map((tool) => tool.name)).toEqual(contextOf().tools.map((tool) => tool.name));
      // No deadline: the turn has no wall-clock cap (R7).
      for (const key of ["deadlineAt", "temperature", "parallelToolCalls"]) expect(request).not.toHaveProperty(key);
    }
    // The first answer's model is pinned.
    expect(model.requests.map((request) => request.model)).toEqual([undefined, "memory-model"]);

    model.answer({ toolCalls: [quoteCall] }, "Sat 19 Dec, 2 log: total ₹18,998.");
    await loop({ model: "google/gemini-3.5-flash", temperature: 0.4 });
    expect(model.requests.slice(2).map((request) => [request.model, request.temperature])).toEqual([
      ["google/gemini-3.5-flash", 0.4],
      ["google/gemini-3.5-flash", 0.4],
    ]);
  });

  it("asks once more when the reply has no words, then falls back", async () => {
    model.answer({ text: "", model: LITE }, "Kab ka plan hai, aur kitne log?");
    expect(await loop()).toMatchObject({ end: "final", messages: ["Kab ka plan hai, aur kitne log?"], callsUsed: 2 });
    expect(model.requests[1]?.messages.at(-1)?.content).toBe(`${APP_CHECK} ${NO_WORDS}`);
    // The model that wrote the transcript goes on with it (P7).
    expect(model.requests.map((request) => request.model)).toEqual([undefined, LITE]);

    model.answer({ toolCalls: [leadCall] }, "", { text: "  " });
    const end = await loop();
    expect(model.requests[4]?.messages.at(-1)?.content).toBe(`${APP_CHECK} ${NO_WORDS}`);
    expect(end).toMatchObject({ end: "fallback", reason: "model", draft: null });
    expect(stagedOf(end)).toEqual(["update_lead"]);
    expect(end.end === "fallback" && end.task).toContain("The AI wrote no reply");
    expect(model.requests).toHaveLength(5);
  });

  it("asks a hand-over with no words for its line, and lets one for abuse end silent", async () => {
    const line = "Maine team ko bata diya hai, woh yahin reply karenge.";
    model.answer({ toolCalls: [handOverCall("discount")] }, line);
    const end = await loop();
    expect(end).toMatchObject({ end: "final", messages: [line], callsUsed: 2 });
    expect(end.end === "final" && end.staged.get("hand_over")).toMatchObject({ reason: "discount" });
    expect(model.requests[1]?.messages.at(-1)?.content).toBe(`${APP_CHECK} ${HAND_OVER_WORDS}`);

    model.answer({ toolCalls: [handOverCall("abuse")] });
    expect(await loop()).toMatchObject({ end: "final", messages: [], callsUsed: 1 });
    expect(model.requests).toHaveLength(3);
  });

  it("ends a hand-over that came with words after one call", async () => {
    const words = "Team ko bata diya hai, woh yahin reply karenge.";
    model.answer({ text: words, toolCalls: [handOverCall("discount")] });
    expect(await loop()).toMatchObject({ end: "final", messages: [words], callsUsed: 1 });
    expect(model.requests).toHaveLength(1);
  });

  it("ends quiet after stay_quiet without asking the model again", async () => {
    model.answer({ toolCalls: [quietCall] });
    expect(await loop()).toMatchObject({ end: "final", messages: [], callsUsed: 1 });
    expect(model.requests).toHaveLength(1);
  });

  it("sends the words written beside a brochure call when the last answer has none", async () => {
    const words = "Kedarkantha ka brochure bhej rahi hoon.";
    model.answer({ text: words, toolCalls: [brochureCall] }, "");
    const end = await loop();
    expect(end).toMatchObject({ end: "final", messages: [words], callsUsed: 2 });
    expect(stagedOf(end)).toEqual(["send_brochure"]);
    expect(io.stagings).toEqual([{ name: "send_brochure", words, quoted: 0 }]);

    // A read after them takes nothing away.
    model.answer({ text: words, toolCalls: [brochureCall] }, { toolCalls: [quoteCall] }, "");
    expect(await loop()).toMatchObject({ end: "final", messages: [words], callsUsed: 3 });
  });

  it("never sends earlier words beside a later action that came without words", async () => {
    // The brochure's words would otherwise go with the hold and its QR.
    const line = "Sat 19 Dec ki 2 seats hold kar di hain; advance ₹6,000 ka QR neeche hai.";
    model.answer(
      { text: "Kedarkantha ka brochure bhej rahi hoon.", toolCalls: [brochureCall] },
      { toolCalls: [bookCall] },
      "",
      line,
    );
    const end = await loop();
    expect(model.requests[3]?.messages.at(-1)?.content).toBe(`${APP_CHECK} ${NO_WORDS}`);
    expect(end).toMatchObject({ end: "final", messages: [line], callsUsed: 4 });
    expect(stagedOf(end)).toEqual(["send_brochure", "book"]);
  });

  it("never takes the words beside a read or a refused action as the reply", async () => {
    const reply = "Kaunsa trek dekh rahe hain: Kedarkantha ya Brahmatal?";
    model.answer({ text: "Ek minute, check karti hoon.", toolCalls: [quoteCall] }, "", reply);
    expect(await loop()).toMatchObject({ end: "final", messages: [reply], callsUsed: 3 });

    io.stage = () => Promise.resolve({ refused: "refused: the chat hasn't named T2 Brahmatal Trek" });
    model.answer({ text: "Brahmatal ka brochure bhej rahi hoon.", toolCalls: [brochureCall] }, "", reply);
    const end = await loop();
    expect(end).toMatchObject({ end: "final", messages: [reply], callsUsed: 3 });
    expect(stagedOf(end)).toEqual([]);
  });

  it("never takes words beside a media read as the reply", async () => {
    const reply = "Samajh gayi, do log. Kaunsi date?";
    const context = {
      ...contextOf(),
      tools: oneToolSchemas({ tripLabels: ["T1", "T2"], voiceNotes: ["m3"] }),
      media: new Map([["m3", { messageId: "message-3", kind: "audio" as const }]]),
    };
    io.media = () => Promise.resolve("do log hain");
    model.answer(
      {
        text: "Ek minute, sun leti hoon.",
        toolCalls: [{ name: "transcribe_voice_note", arguments: { message: "m3" } }],
      },
      "",
      reply,
    );
    trace = startNaturalTrace({ version: "one-1" }, START, "one");
    const settings: OneSettings = { organizationId: ORGANIZATION, forced: [], today: parseCalendarDate("2026-11-14") };
    expect(await runOneLoop(context, io, settings, trace)).toMatchObject({
      end: "final",
      messages: [reply],
      callsUsed: 3,
    });
  });

  it("never holds seats or resends payment without words", async () => {
    for (const call of [bookCall, { name: "resend_payment", arguments: {} }]) {
      // A brochure beside them ends nothing.
      model.answer({ toolCalls: [call, brochureCall] }, "", "");
      const end = await loop();
      expect(end).toMatchObject({ end: "fallback", reason: "model" });
      expect(stagedOf(end)).toEqual([]);
    }
    expect(model.requests[2]?.messages.at(-1)?.content).toBe(`${APP_CHECK} ${NO_WORDS}`);
    expect(model.requests).toHaveLength(6);

    const line = "Sat 19 Dec ki 2 seats hold kar di hain; advance ₹6,000 ka QR neeche hai.";
    model.answer({ text: line, toolCalls: [bookCall] }, "");
    const end = await loop();
    expect(end).toMatchObject({ end: "final", messages: [line] });
    expect(stagedOf(end)).toEqual(["book"]);
  });

  it("sends words beside stay_quiet and drops it", async () => {
    const words = "Great! Let me know if you need anything.";
    model.answer({ text: words, toolCalls: [quietCall] });
    const end = await loop();
    expect(end).toMatchObject({ end: "final", messages: [words] });
    expect(stagedOf(end)).toEqual([]);
    expect(finished().flags).toEqual(["quiet_with_words"]);
    expect(finished().staged).toEqual([]);

    // Without words, it ends the turn in silence.
    model.answer({ toolCalls: [quietCall] });
    const quiet = await loop();
    expect(quiet).toMatchObject({ end: "final", messages: [] });
    expect(stagedOf(quiet)).toEqual(["stay_quiet"]);
  });

  it("falls back after too many steps: the line in their language, the agency's actions kept, the task naming the rest", async () => {
    // LangGraph's default limit of 25 steps: 13 answers, each calling a tool.
    const reads = Array.from({ length: 12 }, () => ({ toolCalls: [quoteCall] }));
    model.answer({ toolCalls: [leadCall, offerCall] }, ...reads);
    const end = await loop();
    expect(model.requests).toHaveLength(13);
    expect(end).toEqual({
      end: "fallback",
      reason: "steps",
      staged: new Map([["update_lead", staging.update_lead]]),
      task:
        `The AI took too many steps without a reply it could send, so nothing went to the customer. ` +
        `They wrote: "Kedarkantha ka rate?". Not done: the AI meant to offer T1 for 2 on Sat 19 Dec, total ₹18,998. ` +
        "Why on this turn shows what it tried.",
      draft: null,
    });
    expect(finished().staged.map((action) => action.tool)).toEqual(["update_lead"]);
  });

  it("passes a model failure and the month's limit through, and ends superseded when they wrote again", async () => {
    model.answer({ toolCalls: [quoteCall] }, { ok: false, reason: "unavailable" });
    expect(await loop()).toEqual({ end: "model_failed", reason: "unavailable" });
    expect(finished().calls).toMatchObject([
      { finishReason: "tool_calls" },
      { model: "memory-model", finishReason: "failed:unavailable", words: null, tools: [] },
    ]);

    io.call = () => Promise.resolve({ ok: false, reason: "limit" });
    expect(await loop()).toEqual({ end: "model_failed", reason: "limit" });
    // A call the month's limit refused never reached a model.
    expect(finished().calls).toEqual([]);

    io = fakeIO();
    let asked = 0;
    io.newerLine = () => Promise.resolve((asked += 1) > 1);
    model.answer({ toolCalls: [quoteCall] }, "Sat 19 Dec, 2 log: total ₹18,998.");
    expect(await loop()).toEqual({ end: "superseded" });
    // Asked before each model call: the second was never made.
    expect(model.requests).toHaveLength(3);

    // The run that asks for words asks too.
    asked = 0;
    model = createMemoryAiModel();
    model.answer("", "Kab ka plan hai?");
    expect(await loop()).toEqual({ end: "superseded" });
    expect(model.requests).toHaveLength(1);
  });

  it("keeps code's forced actions, which never end a turn without words", async () => {
    const line = "Screenshot mil gaya; team check karke yahin batayegi.";
    model.answer("", line);
    const end = await loop({ forced: [handOver] });
    expect(end).toMatchObject({ end: "final", messages: [line], callsUsed: 2 });
    expect(end.end === "final" && end.staged.get("hand_over")).toEqual(handOver);
    expect(model.requests[1]?.messages.at(-1)?.content).toBe(`${APP_CHECK} ${HAND_OVER_WORDS}`);

    // A brochure code staged ends nothing either; on the fallback it's dropped, the hand-over kept.
    const brochure = staging.send_brochure;
    if (brochure === undefined) throw new Error("no brochure staging");
    model.answer("", "");
    const fallback = await loop({ forced: [handOver, brochure] });
    expect(fallback).toMatchObject({ end: "fallback", reason: "model" });
    expect(stagedOf(fallback)).toEqual(["hand_over"]);
    expect(fallback.end === "fallback" && fallback.task).toContain("Not done: the AI meant to send T1's brochure.");
  });

  it("traces each call, each tool with its refusals, and the staged actions", async () => {
    const call = io.call;
    io.call = async (request) => {
      const result = await call(request);
      return result.ok
        ? { ...result, inputTokens: 9_000, cachedTokens: 6_000, outputTokens: 120, reasoningTokens: 80 }
        : result;
    };
    const refusal = "refused: the chat hasn't named T2 Brahmatal Trek";
    const stage = io.stage;
    io.stage = (name, ...rest) =>
      name === "send_brochure" ? Promise.resolve({ refused: refusal }) : stage(name, ...rest);
    const words = "Sat 19 Dec: advance ₹6,000. Book karein?";
    const brochureT2 = { name: "send_brochure", arguments: { brochure_id: "B2" } };
    model.answer(
      { toolCalls: [quoteCall, brochureT2], model: LITE },
      { text: words, toolCalls: [offerCall], model: LITE },
      { text: "", model: LITE },
    );
    expect(await loop()).toMatchObject({ end: "final", messages: [words] });
    const tokens = { inputTokens: 9_000, cachedTokens: 6_000, outputTokens: 120, reasoningTokens: 80 };
    const tool = (name: string, args: object, result: string, refused = false) => ({
      name,
      arguments: JSON.stringify(args),
      result,
      refused,
    });
    expect(finished()).toEqual({
      agent: "one",
      promptVersion: "one-1",
      promptLabel: null,
      outcome: "replied",
      fallback: null,
      restarted: null,
      durationMs: 6_000,
      calls: [
        {
          model: LITE,
          ms: 2_000,
          ...tokens,
          finishReason: "tool_calls",
          words: null,
          tools: [tool("quote", terms, QUOTE_RESULT), tool("send_brochure", { brochure_id: "B2" }, refusal, true)],
        },
        {
          model: LITE,
          ms: 2_000,
          ...tokens,
          finishReason: "tool_calls",
          words,
          tools: [tool("offer_booking", terms, "offer_booking: staged")],
        },
        { model: LITE, ms: 2_000, ...tokens, finishReason: "stop", words: null, tools: [] },
      ],
      guards: [],
      staged: [{ tool: "offer_booking", summary: "Sat 19 Dec 2026, 2 adults, triple; total ₹18,998, advance ₹6,000" }],
      flags: [],
    });
  });
});
