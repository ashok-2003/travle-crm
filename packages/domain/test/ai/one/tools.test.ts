// The one agent's tools as plain functions: reads answer and keep their quote, actions stage into the run, and a call
// that fails or is refused tells the model the way on. No database: the reads and the stage are fakes (and one test
// runs the real checks on a fake quote).
import { oneToolSchemas, naturalFacts, type BookingTerms } from "@travel-crm/contracts/ai";
import { describe, expect, it } from "vitest";
import { startNaturalTrace } from "../../../src/ai/natural/trace.js";
import { stageAction, type ActionContext } from "../../../src/ai/natural/tools/action-tools.js";
import type { QuoteFigures, StagedAction, TripSheet } from "../../../src/ai/natural/types.js";
import { oneAgentTools, startOneRun, type OneToolIO } from "../../../src/ai/one/tools.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

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
  const tools = oneAgentTools(oneToolSchemas({ tripLabels: labels }), full, run, trace, labels);
  const call = (name: string, args: Record<string, unknown>, words = "") => {
    const found = tools.find((tool) => tool.name === name);
    if (found === undefined) throw new Error(`no tool ${name}`);
    return found.run(args, { words });
  };
  return { run, trace, stages, call };
}

describe("the one agent's tools", () => {
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
    const at = new Date("2026-11-14T13:00:00Z");
    const terms: BookingTerms = { ...figures(0).terms, payInFull: false };
    const sheet = {
      label: "T1",
      packageId: "package-1",
      title: "Kedarkantha Trek",
      place: "Sankri",
      rooms: ["double"],
      departures: [],
    } as unknown as TripSheet;
    const context = {
      sheets: [sheet],
      labels: new Map([["T1", "package-1"]]),
      today: parseCalendarDate("2026-11-14"),
      now: new Date("2026-11-14T18:13:00Z"),
      facts: {
        ...naturalFacts.parse({ agent: "natural" }),
        told: [{ ...terms, totalPaise: 2_599_800, at: at.toISOString() }],
        lastTurnAt: at.toISOString(),
      },
      lead: { name: "", packageId: null },
      lines: [],
      newLines: [],
      paymentReady: true,
      booking: null,
      profileName: null,
      quoteOf: () => Promise.resolve(figures(2_599_800)),
    } as unknown as ActionContext;
    const { run, call } = setup({
      stage: (name, args, words) => stageAction(context, name, args, words, { agent: "one" }),
    });
    await call("book", quoteArgs);
    expect(run.staged.get("book")).toMatchObject({ tool: "book", via: "told", fullName: null, customerWords: null });
    expect(run.modelStaged).toEqual(new Set(["book"]));
  });
});
