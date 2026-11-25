// The one agent's tools as plain functions: reads answer and keep their quote, actions stage into the run, and a call
// that fails or is refused tells the model the way on. No database: the reads and the stage are fakes (and one test
// runs the real checks on a fake quote).
import { oneToolSchemas } from "@travel-crm/contracts/ai";
import { describe, expect, it } from "vitest";
import { startNaturalTrace } from "../../../src/ai/natural/trace.js";
import type { QuoteFigures, StagedAction } from "../../../src/ai/natural/types.js";
import { oneAgentTools, stageOneAction, startOneRun, type OneToolIO } from "../../../src/ai/one/tools.js";
import { ctx, facts, hoursAgo, saying } from "../natural/fixtures.js";

const labels = ["T1", "T2"];
const figures = (total: number): QuoteFigures => ({
  terms: {
    packageId: "package-1",
    startsOn: "2026-12-19",
    adults: 2,
    childrenAges: [],
    room: "double",
    payInFull: false,
  },
  departureId: "departure-1",
  perPersonPaise: total / 2,
  totalPaise: total,
  advancePaise: 600_000,
  advancePerPersonPaise: 300_000,
  freeSeats: 10,
});
const quoteArgs = { trip_id: "T1", date: "2026-12-19", adults: 2, room: "double" };

function setup(io: Partial<OneToolIO> = {}, forced: StagedAction[] = []) {
  const run = startOneRun(forced);
  const trace = startNaturalTrace({ version: "built-in-1" }, 0, "one");
  const stages: { name: string; words: string; quoted: number }[] = [];
  const full: OneToolIO = {
    read: () => Promise.resolve({ result: "quoted: ₹25,998", figures: figures(2_599_800) }),
    stage: (name, _args, words, quoted) => {
      stages.push({ name, words, quoted: quoted.length });
      return Promise.resolve({ staged: { tool: "stay_quiet", reason: "x" }, result: "no message goes" });
    },
    ...io,
  };
  const media = new Map<string, { messageId: string; kind: "audio" | "image" }>([
    ["m3", { messageId: "message-3", kind: "audio" }],
    ["m7", { messageId: "message-7", kind: "image" }],
  ]);
  const schemas = oneToolSchemas({ tripLabels: labels, voiceNotes: ["m3"], photos: ["m7"] });
  const tools = oneAgentTools(schemas, full, run, trace, labels, media);
  const call = (name: string, args: Record<string, unknown>, words = "") => {
    const found = tools.find((tool) => tool.name === name);
    if (found === undefined) throw new Error(`no tool ${name}`);
    return found.run(args, { words });
  };
  return { run, trace, stages, call, tools };
}

describe("the one agent's tools", () => {
  it("ends the run on stay_quiet and hand_over alone", () => {
    const ending = setup()
      .tools.filter((tool) => tool.endsRun === true)
      .map((tool) => tool.name);
    expect(ending.sort()).toEqual(["hand_over", "stay_quiet"]);
  });

  it("answers a media tool from the media IO, and a reference the turn lacks as refused", async () => {
    const asked: [string, Record<string, unknown>][] = [];
    const { run, call } = setup({
      media: (name, args) => {
        asked.push([name, args]);
        return Promise.resolve("seen: a receipt");
      },
    });
    expect(await call("look_at_image", { message: "m7", question: "the amount?" })).toBe("seen: a receipt");
    expect(await call("transcribe_voice_note", { message: "m3" })).toBe("seen: a receipt");
    expect(asked).toEqual([
      ["look_at_image", { message: "m7", question: "the amount?" }],
      ["transcribe_voice_note", { message: "m3" }],
    ]);
    // Someone else's reference, a photo's reference to the voice tool, and a failed read.
    expect(await call("look_at_image", { message: "m9" })).toMatch(/^refused:/u);
    expect(await call("transcribe_voice_note", { message: "m7" })).toMatch(/^refused:/u);
    expect(asked).toHaveLength(2);
    expect(run.staged.size).toBe(0);
    const failing = setup({ media: () => Promise.reject(new Error("boom")) });
    expect(await failing.call("look_at_image", { message: "m7" })).not.toContain("boom");
    expect(
      failing.trace.finish("replied", null, 0).flags.some((flag) => flag.startsWith("tool_failed:look_at_image")),
    ).toBe(true);
  });

  it("answers a read and keeps its quote", async () => {
    const { run, call } = setup();
    expect(await call("quote", quoteArgs)).toBe("quoted: ₹25,998");
    expect(run.quoted).toEqual([figures(2_599_800)]);
    expect(run.staged.size).toBe(0);
  });

  it("stages an action, a later call replacing the earlier", async () => {
    let reason = "first";
    const { run, call } = setup({
      stage: () => Promise.resolve({ staged: { tool: "stay_quiet", reason }, result: "no message goes" }),
    });
    await call("stay_quiet", { reason });
    reason = "second";
    await call("stay_quiet", { reason });
    expect([...run.staged.values()]).toEqual([{ tool: "stay_quiet", reason: "second" }]);
    expect(run.modelStaged).toEqual(new Set(["stay_quiet"]));
  });

  it("answers a refusal and stages nothing", async () => {
    const { run, call, trace } = setup({ stage: () => Promise.resolve({ refused: "refused: make the offer first" }) });
    expect(await call("stay_quiet", { reason: "x" })).toBe("refused: make the offer first");
    expect(run.staged.size).toBe(0);
    expect(run.modelStaged.size).toBe(0);
    expect(trace.finish("final", null, 0).flags).toEqual([]);
  });

  it("answers arguments that don't fit in the domain's words, without reading or staging", async () => {
    const { run, call, stages } = setup();
    expect(await call("get_trip", { trip_id: "T9" })).toBe("refused: T9 isn't one of the trips; the trips are T1, T2");
    expect(await call("stay_quiet", {})).toMatch(/^refused: /);
    expect(stages).toEqual([]);
    expect(run.quoted).toEqual([]);
  });

  it("answers a failed read or check with the way on, and flags it by its name", async () => {
    class Outage extends Error {
      override name = "Outage";
    }
    const { call, trace } = setup({
      read: () => Promise.reject(new Outage("db")),
      stage: () => Promise.reject(new Outage("db")),
    });
    expect(await call("get_trip", { trip_id: "T1" })).toMatch(/^refused: that couldn't be read just now/);
    expect(await call("stay_quiet", { reason: "x" })).toMatch(/^refused: that couldn't be checked just now/);
    expect(trace.finish("final", null, 0).flags).toEqual([
      "tool_failed:get_trip:Outage",
      "tool_failed:stay_quiet:Outage",
    ]);
  });

  it("keeps an offer's and a booking's figures as this turn's", async () => {
    const offer = figures(2_599_800);
    const { run, call } = setup({
      stage: (name) =>
        Promise.resolve({
          staged:
            name === "book"
              ? { tool: "book", terms: offer.terms, figures: offer, fullName: null, customerWords: null, via: "offer" }
              : {
                  tool: "offer_booking",
                  offer: {
                    ...offer.terms,
                    departureId: "departure-1",
                    totalPaise: offer.totalPaise,
                    advancePaise: offer.advancePaise,
                    at: "2026-11-14T00:00:00Z",
                  },
                  figures: offer,
                },
          result: "ok",
        }),
    });
    await call("offer_booking", quoteArgs);
    await call("book", quoteArgs);
    expect(run.quoted).toEqual([offer, offer]);
  });

  it("starts with code's forced actions staged, none of them the model's", () => {
    const { run } = setup({}, [{ tool: "add_note", text: "n" }]);
    expect([...run.staged.keys()]).toEqual(["add_note"]);
    expect(run.modelStaged.size).toBe(0);
  });

  it("passes the answer's words and this turn's quotes to the stage", async () => {
    const { call, stages } = setup();
    await call("quote", quoteArgs);
    await call("stay_quiet", { reason: "x" }, "Here you go");
    expect(stages).toEqual([{ name: "stay_quiet", words: "Here you go", quoted: 1 }]);
  });

  it("books on a total told for exactly these terms, with no live offer", async () => {
    const at = hoursAgo(5);
    const told = { ...figures(0).terms, totalPaise: 2_599_800, at: at.toISOString() };
    const context = ctx({ facts: facts({ told: [told], lastTurnAt: at.toISOString() }), ...saying("theek hai") });
    const { run, call } = setup({
      stage: (name, args, words) => stageOneAction(context, name, args, words),
    });
    await call("book", quoteArgs);
    expect(run.staged.get("book")).toMatchObject({ tool: "book", via: "told", fullName: null, customerWords: null });
    expect(run.modelStaged).toEqual(new Set(["book"]));
  });

  it("refuses one's book with a full_name, which it doesn't take", async () => {
    const { run, call, stages } = setup();
    expect(await call("book", { ...quoteArgs, full_name: "Rohan Mehta" })).toMatch(/^refused: /);
    expect(stages).toEqual([]);
    expect(run.staged.size).toBe(0);
  });

  it("stages the trip menu by the one agent's own staging, which tells the model what goes", async () => {
    const { run, call } = setup({ stage: (name, args, words) => stageOneAction(ctx(), name, args, words) });
    expect(await call("show_trips", {}, "Namaste!")).toMatch(/^the app sends the trip menu after your words/u);
    expect(run.staged.get("show_trips")).toMatchObject({ tool: "show_trips", menu: { button: "Trips dekho" } });
    expect(run.modelStaged).toEqual(new Set(["show_trips"]));
    expect(await call("show_trips", { trip_id: "T1" })).toMatch(/^refused: /u);
  });
});
