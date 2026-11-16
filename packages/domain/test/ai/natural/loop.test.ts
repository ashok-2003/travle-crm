// The natural agent's loop (spec 3.2; rulings 11, 12, 14, 22; pre-flight #5, #11, #12, #14, #16) with a scripted model, a
// fake IO and a fake clock, no database: its requests, tool calls, guard retry, restarts, caps and failure path.
import { naturalToolDefinitions, type NaturalToolName } from "@travel-crm/contracts/ai";
import { createMemoryAiModel, type AiRequest, type MemoryAiModel } from "@travel-crm/integrations/ai";
import { beforeEach, describe, expect, it } from "vitest";
import type { NaturalContext } from "../../../src/ai/natural/context/build.js";
import type { GuardFallback, GuardName, WordsVerdict } from "../../../src/ai/natural/guards/check-words.js";
import {
  runNaturalLoop,
  splitMessages,
  type LoopEnd,
  type LoopIO,
  type LoopSettings,
} from "../../../src/ai/natural/loop.js";
import { startNaturalTrace, type NaturalTraceBuilder } from "../../../src/ai/natural/trace.js";
import type { QuoteFigures, StagedAction } from "../../../src/ai/natural/types.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

// Sat 14 Nov 2026, 11:43 pm in Kolkata; each model call takes 2 s on the fake clock.
const START = Date.parse("2026-11-14T18:13:00Z");
const CALL_MS = 2_000;
const ORGANIZATION = "organization-1";
const LITE = "google/gemini-3.5-flash-lite";
// The customer wrote "Kedarkantha ka rate?": the Hinglish fallback line.
const FALLBACK_LINE = "Ye team se check karke yahin batate hain.";
const NO_WORDS = "[app check, not from the customer] Your reply had no words. Write the reply, or call stay_quiet.";
const READ_FAILED =
  "refused: that couldn't be read just now; answer from what you have, or say you'll check with the team and call " +
  "create_task";
const STAGE_FAILED = "refused: that couldn't be checked just now; say you'll check with the team and call create_task";

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
const offered: QuoteFigures = { ...quoted, departureId: "departure-2" };
const quoteCall = { name: "quote", arguments: { trip_id: "T1", date: "2026-12-19", adults: 2 } };
const offerCall = { name: "offer_booking", arguments: { trip_id: "T1", date: "2026-12-19", adults: 2 } };
const handOver: StagedAction = { tool: "hand_over", reason: "payment_check", summary: "Payment screenshot to check" };

/** What the fake stages for each action the tests call. */
const staging: Partial<Record<NaturalToolName, StagedAction>> = {
  update_lead: { tool: "update_lead", fields: { adults: 2 }, notes: [] },
  send_brochure: { tool: "send_brochure", packageId: "package-1", fileIds: ["file-1"] },
  offer_booking: {
    tool: "offer_booking",
    offer: { ...offered.terms, departureId: "departure-2", totalPaise: 1_899_800, advancePaise: 600_000, at: "x" },
    figures: offered,
  },
  hand_over: { tool: "hand_over", reason: "wants_person", summary: "Wants a call" },
  stay_quiet: { tool: "stay_quiet", reason: "said ok" },
};

function contextWith(options: { indexed?: boolean; tools?: boolean } = {}): NaturalContext {
  const indexed = options.indexed ?? true;
  return {
    messages: [
      { role: "system", content: "You are Riya, of Case Trips, on WhatsApp." },
      {
        role: "user",
        content: "<now>Sat 14 Nov 2026, 11:43 pm</now>\nNew messages:\n[Sat 14 Nov, 11:42 pm] Kedarkantha ka rate?",
      },
    ],
    tools: options.tools === false ? [] : naturalToolDefinitions({ tripLabels: ["T1", "T2"], indexed }),
    labels: new Map([
      ["T1", "package-1"],
      ["T2", "package-2"],
    ]),
    indexed,
    newLines: [
      { id: "line-1", from: "customer", at: new Date(START - 60_000), kind: "text", text: "Kedarkantha ka rate?" },
    ],
    sizes: { prompt: 0, agency: 0, trips: 0, chat: 0, turn: 0 },
  };
}

interface FakeIO extends LoopIO {
  now: number;
  /** Verdicts the guards answer in order; then every check passes. */
  verdicts: WordsVerdict[];
  reads: string[];
  stagings: { name: string; words: string; quoted: QuoteFigures[] }[];
  checks: { words: string; staged: string[]; quoted: QuoteFigures[] }[];
}

let model: MemoryAiModel;
let io: FakeIO;
let trace: NaturalTraceBuilder;

function fakeIO(): FakeIO {
  const fake: FakeIO = {
    now: START,
    verdicts: [],
    reads: [],
    stagings: [],
    checks: [],
    call: async (request) => {
      const result = await model.complete(request);
      fake.now += CALL_MS;
      return result;
    },
    read: (name) => {
      fake.reads.push(name);
      return Promise.resolve({
        result: `${name}: Sat 19 Dec, 2 adults, total ₹18,998`,
        figures: name === "quote" ? quoted : null,
      });
    },
    stage: (name, _args, words, sofar) => {
      fake.stagings.push({ name, words, quoted: [...sofar] });
      const staged = staging[name] ?? { tool: "add_note", text: name };
      return Promise.resolve({ staged, result: `${name}: staged` });
    },
    check: (words, staged, sofar) => {
      fake.checks.push({ words, staged: [...staged.keys()], quoted: [...sofar] });
      return fake.verdicts.shift() ?? { ok: true, verdicts: [] };
    },
    newerLine: () => Promise.resolve(false),
    clock: () => fake.now,
  };
  return fake;
}

const settings = (more: Partial<LoopSettings>): LoopSettings => ({
  startedMs: START,
  organizationId: ORGANIZATION,
  forced: [],
  flagContext: {
    sheets: [],
    ownerText: "December batches: Sat 19 Dec and Sat 26 Dec.",
    customerText: "Kedarkantha ka rate?",
    today: parseCalendarDate("2026-11-14"),
  },
  ...more,
});

async function loop(more: Partial<LoopSettings> = {}, context = contextWith()): Promise<LoopEnd> {
  trace = startNaturalTrace("natural-1", more.startedMs ?? START);
  return runNaturalLoop(context, io, settings(more), trace);
}

const finished = () => trace.finish("replied", null, io.now);
const toolResults = (request: AiRequest | undefined) =>
  (request?.messages ?? []).filter((message) => message.role === "tool").map((message) => message.content);
const failing = (guard: GuardName, retry: string, fallback: GuardFallback): WordsVerdict => ({
  ok: false,
  guard,
  retry,
  fallback,
  verdicts: [{ guard, passed: false, detail: "draft" }],
});
const G1_RETRY =
  "₹7,999 isn't in the agency's prices. Use a price from the trips, call quote, or leave the amount out.";

beforeEach(() => {
  model = createMemoryAiModel();
  io = fakeIO();
});

describe("the natural agent's loop", () => {
  it("ends in one call when the words come with no read tool", async () => {
    model.answer({ text: "₹9,499 per person on triple sharing. Which date?" });
    expect(await loop()).toMatchObject({
      end: "final",
      messages: ["₹9,499 per person on triple sharing. Which date?"],
    });
    expect(model.requests).toHaveLength(1);
  });

  it("asks every call as the live agent does: no temperature, no parallel tool calls, the turn's deadline", async () => {
    model.answer("Hi! Kab ka plan hai, aur kitne log?");
    await loop();
    const request = model.requests[0];
    expect(request).toMatchObject({
      feature: "sales_agent",
      messages: contextWith().messages,
      tools: contextWith().tools,
      toolChoice: "auto",
      maxTokens: 8000,
      reasoning: { effort: "low" },
      timeoutMs: 60_000,
      deadlineAt: START + 120_000,
      user: ORGANIZATION,
    });
    for (const key of ["temperature", "parallelToolCalls", "model"]) expect(request).not.toHaveProperty(key);
  });

  it("names Try it's own model and temperature on every call", async () => {
    model.answer({ toolCalls: [quoteCall] }, "Sat 19 Dec, 2 log: total ₹18,998.");
    await loop({ model: "google/gemini-3.5-flash", temperature: 0.4 });
    expect(model.requests.map((request) => [request.model, request.temperature])).toEqual([
      ["google/gemini-3.5-flash", 0.4],
      ["google/gemini-3.5-flash", 0.4],
    ]);
  });

  it("sends no tools and no tool choice on a turn without tools (pre-flight #5)", async () => {
    model.answer("Screenshot team ko bhej diya hai; check karke yahin batayenge.");
    await loop({}, contextWith({ tools: false }));
    expect(model.requests[0]).not.toHaveProperty("tools");
    expect(model.requests[0]).not.toHaveProperty("toolChoice");
  });

  it("runs a read tool, drops the words beside it, and calls again with its result", async () => {
    model.answer({ text: "Ek minute, check karti hoon.", toolCalls: [quoteCall] }, "Sat 19 Dec, 2 log: total ₹18,998.");
    expect(await loop()).toMatchObject({ end: "final", messages: ["Sat 19 Dec, 2 log: total ₹18,998."] });
    expect(model.requests).toHaveLength(2);
    expect(model.requests[1]?.messages.slice(-2)).toEqual([
      {
        role: "assistant",
        content: "Ek minute, check karti hoon.",
        toolCalls: [{ id: "call_1", name: "quote", arguments: JSON.stringify(quoteCall.arguments) }],
      },
      { role: "tool", toolCallId: "call_1", content: "quote: Sat 19 Dec, 2 adults, total ₹18,998" },
    ]);
    // The words beside the read never reach the guards, or the customer.
    expect(io.checks.map((check) => check.words)).toEqual(["Sat 19 Dec, 2 log: total ₹18,998."]);
  });

  it("sends the reasoning details back unchanged, and pins the first call's model", async () => {
    const reasoning = [{ type: "reasoning.encrypted", data: "sig" }];
    model.answer(
      { toolCalls: [quoteCall], reasoningDetails: reasoning, model: LITE },
      { text: "Sat 19 Dec, 2 log: total ₹18,998.", model: LITE },
    );
    expect(await loop()).toMatchObject({ end: "final", model: LITE });
    expect(model.requests[1]?.messages.at(-2)).toMatchObject({ role: "assistant", reasoningDetails: reasoning });
    expect(model.requests[0]).not.toHaveProperty("model");
    expect(model.requests[1]?.model).toBe(LITE);
  });

  it("returns a refused action to the model as the tool's result, and calls again", async () => {
    const refusal = "refused: the chat hasn't named T2 Brahmatal Trek: name it, or ask which trip";
    io.stage = () => Promise.resolve({ refused: refusal });
    model.answer(
      { text: "Brochure bhej rahi hoon.", toolCalls: [{ name: "send_brochure", arguments: { trip_id: "T2" } }] },
      "Kaunsa trek dekh rahe hain: Kedarkantha ya Brahmatal?",
    );
    const end = await loop();
    expect(end).toMatchObject({ end: "final", messages: ["Kaunsa trek dekh rahe hain: Kedarkantha ya Brahmatal?"] });
    expect(end.end === "final" && end.staged.size).toBe(0);
    expect(toolResults(model.requests[1])).toEqual([refusal]);
    expect(finished().calls[0]?.tools).toEqual([
      { name: "send_brochure", arguments: '{"trip_id":"T2"}', result: refusal, refused: true },
    ]);
  });

  it("turns a tool call the schema didn't allow into a refusal the model can act on (Review Focus 2)", async () => {
    model.answer(
      {
        toolCalls: [
          { name: "quote", arguments: { trip_id: "T9", date: "2026-12-19", adults: 2 } },
          { name: "quote", arguments: '{"trip_id": "T1", "date": ' },
          { name: "fly", arguments: {} },
        ],
      },
      { text: "Kaunsa trek: Kedarkantha ya Brahmatal?" },
    );
    expect(await loop()).toMatchObject({ end: "final", messages: ["Kaunsa trek: Kedarkantha ya Brahmatal?"] });
    expect(toolResults(model.requests[1])).toEqual([
      "refused: T9 isn't one of the trips; the trips are T1, T2",
      "refused: the arguments weren't JSON",
      "refused: there is no tool called fly",
    ]);
    expect(io.reads).toEqual([]);
  });

  it("refuses a tool the turn didn't offer as one there is no such tool", async () => {
    model.answer({ toolCalls: [{ name: "find_trips", arguments: { query: "Spiti" } }] }, "Spiti abhi nahi hai.");
    await loop({}, contextWith({ indexed: false }));
    expect(toolResults(model.requests[1])).toEqual(["refused: there is no tool called find_trips"]);
    expect(io.reads).toEqual([]);
  });

  it("answers a read or an action that failed with a refusal, never a throw", async () => {
    io.read = () => Promise.reject(new Error("connection lost"));
    io.stage = () => {
      throw new Error("connection lost");
    };
    model.answer({ toolCalls: [quoteCall, offerCall] }, "Team se check karke yahin batate hain.");
    expect(await loop()).toMatchObject({ end: "final", messages: ["Team se check karke yahin batate hain."] });
    expect(toolResults(model.requests[1])).toEqual([READ_FAILED, STAGE_FAILED]);
    expect(finished().flags).toEqual(["tool_failed:quote", "tool_failed:offer_booking"]);
  });

  it("sends the words when stay_quiet comes with them, and flags it (Review Focus 4, ruling 11)", async () => {
    model.answer({
      text: "Great! Let me know if you need anything.",
      toolCalls: [{ name: "stay_quiet", arguments: { reason: "said ok" } }],
    });
    const end = await loop();
    expect(end).toMatchObject({ end: "final", messages: ["Great! Let me know if you need anything."] });
    expect(end.end === "final" && [...end.staged.keys()]).toEqual([]);
    expect(finished().flags).toContain("quiet_with_words");
  });

  it("retries a guard failure once with an app check, after the refused draft", async () => {
    io.verdicts.push(failing("G1", G1_RETRY, "fallback_task"));
    model.answer("Special price ₹7,999 for you.", "₹9,499 per person on triple sharing.");
    expect(await loop()).toMatchObject({ end: "final", messages: ["₹9,499 per person on triple sharing."] });
    expect(model.requests[1]?.messages.slice(-2)).toEqual([
      { role: "assistant", content: "Special price ₹7,999 for you." },
      { role: "user", content: `[app check, not from the customer] Not sent: ${G1_RETRY}` },
    ]);
  });

  it("applies the guard's fallback at the second failure: the fallback line and a task holding the draft", async () => {
    io.verdicts.push(failing("G1", G1_RETRY, "fallback_task"), failing("G1", G1_RETRY, "fallback_task"));
    model.answer({ text: "Special price ₹7,999 for you.", toolCalls: [offerCall] }, "Final B2B rate ₹6,999.");
    const end = await loop();
    expect(end).toMatchObject({
      end: "fallback",
      reason: "guard:G1",
      messages: [FALLBACK_LINE],
      draft: "Final B2B rate ₹6,999.",
    });
    expect(end.end === "fallback" && end.task).toContain('"Final B2B rate ₹6,999."');
    expect(end.end === "fallback" && end.task).toContain("Kedarkantha ka rate?");
    // An offer the customer never read is not made.
    expect(end.end === "fallback" && [...end.staged.keys()]).toEqual([]);
    expect(model.requests).toHaveLength(2);
  });

  it("hands over for a discount when G4 fails twice, with the draft in the task", async () => {
    const retry = "Say the team will check; quote no discount nobody gave.";
    io.verdicts.push(failing("G4", retry, "hand_over_discount"), failing("G4", retry, "hand_over_discount"));
    model.answer("Team ne bola 10% off milega.", "Aapke liye 10% off.");
    const end = await loop();
    expect(end).toMatchObject({ end: "fallback", reason: "guard:G4", draft: "Aapke liye 10% off." });
    expect(end.end === "fallback" && end.staged.get("hand_over")).toMatchObject({
      tool: "hand_over",
      reason: "discount",
    });
    expect(end.end === "fallback" && end.task).toContain("Aapke liye 10% off.");
  });

  it("withdraws an offer whose words twice miss its date and advance, and sends the words", async () => {
    const g2 = failing(
      "G2",
      "Your words must state the offer's date (Sat 19 Dec) and advance (₹6,000, or ₹3,000 per person): the " +
        "customer says yes to what they read.",
      "withdraw_offer",
    );
    io.verdicts.push(g2, g2);
    model.answer({ text: "Done! Book kar doon?", toolCalls: [offerCall] }, "Book kar doon?");
    const end = await loop();
    expect(end).toMatchObject({ end: "final", messages: ["Book kar doon?"] });
    expect(end.end === "final" && end.staged.has("offer_booking")).toBe(false);
    expect(finished().flags).toContain("offer_withdrawn");
  });

  it("stops at 4 calls with the fallback line and a task", async () => {
    model.answer(...Array.from({ length: 5 }, () => ({ toolCalls: [quoteCall] })));
    const end = await loop();
    expect(end).toMatchObject({ end: "fallback", reason: "cap", messages: [FALLBACK_LINE], draft: null });
    expect(end.end === "fallback" && end.task).toContain("4 calls");
    expect(model.requests).toHaveLength(4);
  });

  it("counts the calls a caller spent already against the 4", async () => {
    model.answer({ toolCalls: [quoteCall] }, "never asked");
    expect(await loop({ callsUsed: 3 })).toMatchObject({ end: "fallback", reason: "cap" });
    expect(model.requests).toHaveLength(1);
  });

  it("starts no call with less than 5 s left, and gives each try at most min(60 s, time left)", async () => {
    expect(await loop({ startedMs: START - 116_000 })).toMatchObject({ end: "fallback", reason: "deadline" });
    expect(model.requests).toHaveLength(0);
    model.answer("₹9,499 per person.");
    await loop({ startedMs: START - 115_000 });
    expect(model.requests.map((request) => request.timeoutMs)).toEqual([5_000]);
    io.now = START;
    model.answer(...Array.from({ length: 4 }, () => ({ toolCalls: [quoteCall] })));
    expect(await loop({ startedMs: START - 110_000 })).toMatchObject({ end: "fallback", reason: "deadline" });
    expect(model.requests.slice(1).map((request) => request.timeoutMs)).toEqual([10_000, 8_000, 6_000]);
  });

  it("ends superseded when a newer customer line has come", async () => {
    let asked = 0;
    io.newerLine = () => Promise.resolve((asked += 1) > 1);
    model.answer({ toolCalls: [quoteCall] }, "never asked");
    expect(await loop()).toEqual({ end: "superseded" });
    expect(model.requests).toHaveLength(1);
  });

  it("starts over once on the same model, with only code's actions staged, on bad_request (pre-flight #11)", async () => {
    model.answer(
      { toolCalls: [{ name: "update_lead", arguments: { adults: 2 } }, quoteCall], model: LITE },
      { ok: false, reason: "bad_request" },
      { text: "Sat 19 Dec, 2 log: total ₹18,998.", model: LITE },
    );
    const end = await loop({ forced: [handOver] });
    expect(end).toMatchObject({ end: "final", messages: ["Sat 19 Dec, 2 log: total ₹18,998."], callsUsed: 3 });
    expect(model.requests[2]?.messages).toEqual(contextWith().messages);
    expect(model.requests[2]?.model).toBe(LITE);
    expect(end.end === "final" && [...end.staged.keys()]).toEqual(["hand_over"]);
    expect(end.end === "final" && end.quoted).toEqual([]);
    expect(finished().restarted).toBe("bad_request");
  });

  it("ends model_failed on a second bad_request", async () => {
    model.answer(
      { toolCalls: [quoteCall] },
      { ok: false, reason: "bad_request" },
      { ok: false, reason: "bad_request" },
    );
    expect(await loop()).toEqual({ end: "model_failed", reason: "bad_request" });
    expect(model.requests).toHaveLength(3);
  });

  it("starts over once, unpinned, when the pinned model doesn't answer", async () => {
    model.answer(
      { toolCalls: [quoteCall], model: LITE },
      { ok: false, reason: "unavailable" },
      { text: "Sat 19 Dec, 2 log: total ₹18,998.", model: "google/gemini-3.5-flash" },
    );
    expect(await loop()).toMatchObject({ end: "final", model: "google/gemini-3.5-flash" });
    expect(model.requests[1]?.model).toBe(LITE);
    expect(model.requests[2]).not.toHaveProperty("model");
    expect(finished().restarted).toBe("model");
  });

  it("starts over once at effort minimal on finish_reason length, on the model that answered", async () => {
    model.answer(
      { text: "Kedarkantha ka", finishReason: "length", model: LITE },
      { text: "₹9,499 per person.", model: LITE },
    );
    expect(await loop()).toMatchObject({ end: "final", messages: ["₹9,499 per person."] });
    expect(model.requests[1]).toMatchObject({
      reasoning: { effort: "minimal" },
      model: LITE,
      messages: contextWith().messages,
    });
    expect(io.checks).toHaveLength(1);
    expect(finished().restarted).toBe("length");
  });

  it("doesn't start over with under 20 s left: the turn ends model_failed", async () => {
    model.answer({ ok: false, reason: "bad_request" });
    expect(await loop({ startedMs: START - 101_000 })).toEqual({ end: "model_failed", reason: "bad_request" });
    model.answer({ text: "Kedarkantha ka", finishReason: "length" });
    expect(await loop({ startedMs: START - 101_000 })).toEqual({ end: "model_failed", reason: "unavailable" });
  });

  it("ends model_failed when the model can't answer, and on the month's limit", async () => {
    model.answer({ ok: false, reason: "unavailable" });
    expect(await loop()).toEqual({ end: "model_failed", reason: "unavailable" });
    expect(finished().calls).toMatchObject([{ model: "", finishReason: "failed:unavailable", words: null, tools: [] }]);
    io.call = () => Promise.resolve({ ok: false, reason: "limit" });
    expect(await loop()).toEqual({ end: "model_failed", reason: "limit" });
  });

  it("gives a response with no words and nothing sent one more call, then the fallback line", async () => {
    model.answer({ toolCalls: [{ name: "update_lead", arguments: { adults: 2 } }] }, "Kab ka plan hai?");
    expect(await loop()).toMatchObject({ end: "final", messages: ["Kab ka plan hai?"] });
    expect(model.requests[1]?.messages.at(-1)).toEqual({ role: "user", content: NO_WORDS });
    model.answer("", { text: "  " });
    expect(await loop()).toMatchObject({ end: "fallback", reason: "model", messages: [FALLBACK_LINE] });
  });

  it("doesn't end a wordless turn on a hand-over code staged (pre-flight #14)", async () => {
    model.answer("", "Screenshot mil gaya; team check karke yahin batayegi.");
    const end = await loop({ forced: [handOver] });
    expect(end).toMatchObject({ end: "final", messages: ["Screenshot mil gaya; team check karke yahin batayegi."] });
    expect(end.end === "final" && end.staged.get("hand_over")).toEqual(handOver);
    expect(model.requests).toHaveLength(2);
  });

  it("splits the words at the first blank line into at most two messages", () => {
    expect(splitMessages("A\n\nB\n\nC")).toEqual(["A", "B\n\nC"]);
    expect(splitMessages("A\nB")).toEqual(["A\nB"]);
    expect(splitMessages(" A \n \n\nB ")).toEqual(["A", "B"]);
    expect(splitMessages("")).toEqual([]);
  });

  it("strips a copied stamp or label from the start of each message, and checks what goes (pre-flight #16)", async () => {
    model.answer("[Sat 14 Nov, 11:43 pm] (Team, Amit) Weekend batch Sat 19 Dec hai.\n\n[automatic] Kitne log?");
    expect(await loop()).toMatchObject({ messages: ["Weekend batch Sat 19 Dec hai.", "Kitne log?"] });
    expect(io.checks.map((check) => check.words)).toEqual(["Weekend batch Sat 19 Dec hai.\n\nKitne log?"]);
  });

  it("ends with a staged hand_over, stay_quiet or send_brochure and no words", async () => {
    const enders = [
      ["hand_over", { reason: "wants_person", summary: "Wants a call" }],
      ["stay_quiet", { reason: "said ok" }],
      ["send_brochure", { trip_id: "T1" }],
    ] as const;
    for (const [name, args] of enders) {
      model.answer({ toolCalls: [{ name, arguments: args }] });
      const end = await loop();
      expect(end).toMatchObject({ end: "final", messages: [], callsUsed: 1 });
      expect(end.end === "final" && [...end.staged.keys()]).toEqual([name]);
    }
    expect(model.requests).toHaveLength(3);
  });

  it("puts each quote's and the offer's figures in quoted, for the actions and the guards", async () => {
    model.answer(
      { toolCalls: [quoteCall] },
      { text: "Sat 19 Dec: advance ₹6,000. Book karein?", toolCalls: [offerCall] },
    );
    const end = await loop();
    expect(io.stagings).toEqual([
      { name: "offer_booking", words: "Sat 19 Dec: advance ₹6,000. Book karein?", quoted: [quoted] },
    ]);
    expect(io.checks).toEqual([
      { words: "Sat 19 Dec: advance ₹6,000. Book karein?", staged: ["offer_booking"], quoted: [quoted, offered] },
    ]);
    expect(end).toMatchObject({ end: "final", quoted: [quoted, offered] });
  });

  it("records each call's model, time, tokens, tools and the guards' verdicts in the trace", async () => {
    const call = io.call.bind(io);
    io.call = async (request) => {
      const result = await call(request);
      return result.ok
        ? { ...result, inputTokens: 9_000, cachedTokens: 6_000, outputTokens: 120, reasoningTokens: 80 }
        : result;
    };
    io.verdicts.push({ ok: true, verdicts: [{ guard: "G2", passed: true, detail: "date (Sat 19 Dec)" }] });
    model.answer(
      { toolCalls: [quoteCall], model: LITE },
      { text: "Sat 19 Dec: advance ₹6,000. Book karein?", toolCalls: [offerCall], model: LITE },
    );
    await loop();
    const quoteTool = {
      name: "quote",
      arguments: JSON.stringify(quoteCall.arguments),
      result: "quote: Sat 19 Dec, 2 adults, total ₹18,998",
      refused: false,
    };
    const tokens = { inputTokens: 9_000, cachedTokens: 6_000, outputTokens: 120, reasoningTokens: 80 };
    expect(finished()).toEqual({
      agent: "natural",
      promptVersion: "natural-1",
      outcome: "replied",
      fallback: null,
      restarted: null,
      durationMs: 4_000,
      calls: [
        { model: LITE, ms: 2_000, ...tokens, finishReason: "tool_calls", words: null, tools: [quoteTool] },
        {
          model: LITE,
          ms: 2_000,
          ...tokens,
          finishReason: "tool_calls",
          words: "Sat 19 Dec: advance ₹6,000. Book karein?",
          tools: [
            {
              name: "offer_booking",
              arguments: JSON.stringify(offerCall.arguments),
              result: "offer_booking: staged",
              refused: false,
            },
          ],
        },
      ],
      guards: [{ guard: "G2", passed: true, detail: "date (Sat 19 Dec)" }],
      staged: [{ tool: "offer_booking", summary: "Sat 19 Dec 2026, 2 adults, triple; total ₹18,998, advance ₹6,000" }],
      flags: [],
    });
  });

  it("counts tokens a provider didn't give as 0 in the trace", async () => {
    model.answer("₹9,499 per person.");
    await loop();
    expect(finished().calls).toMatchObject([
      { model: "memory-model", inputTokens: 0, cachedTokens: 0, outputTokens: 0, reasoningTokens: 0 },
    ]);
  });

  it("records traceFlags of the final words as flags", async () => {
    model.answer("13 Dec ko 3 seats bachi hain.");
    await loop();
    expect(finished().flags).toEqual(["date_not_in_data:2026-12-13"]);
  });

  it("hands back the transcript and the calls used, so one more call can follow", async () => {
    model.answer({ toolCalls: [quoteCall] }, "Sat 19 Dec, 2 log: total ₹18,998.");
    const end = await loop({ callsUsed: 1 });
    expect(end).toMatchObject({ end: "final", callsUsed: 3, model: "memory-model" });
    expect(end.end === "final" && end.transcript).toEqual([
      ...contextWith().messages,
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_1", name: "quote", arguments: JSON.stringify(quoteCall.arguments) }],
      },
      { role: "tool", toolCallId: "call_1", content: "quote: Sat 19 Dec, 2 adults, total ₹18,998" },
      { role: "assistant", content: "Sat 19 Dec, 2 log: total ₹18,998." },
    ]);
  });
});
