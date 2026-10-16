// The Lighthouse budgets (scripts/lighthouse-budgets.ts): what a run's report says, the median of three runs, and
// every way a page can miss its budget, a category Lighthouse couldn't score among them.
import { describe, expect, it } from "vitest";
import { budgets, median, missedBudgets, summarise, type LighthouseRun } from "../scripts/lighthouse-budgets";

/** The parts of a Lighthouse report the budgets read. */
function report(scores: Record<string, number | null>, layoutShift = 0) {
  return {
    categories: Object.fromEntries(Object.entries(scores).map(([id, score]) => [id, { id, score }])),
    audits: { "cumulative-layout-shift": { numericValue: layoutShift } },
  };
}

const withinBudget = report({ performance: 0.91, accessibility: 1, "best-practices": 0.96 }, 0.01);

describe("the Lighthouse budgets", () => {
  it("are a floor for each category and a ceiling for layout shift", () => {
    expect(budgets).toEqual({ performance: 0.8, accessibility: 1, "best-practices": 0.95, layoutShift: 0.1 });
  });

  it("read each category's score and the layout shift from a report", () => {
    expect(summarise(withinBudget)).toEqual({
      performance: 0.91,
      accessibility: 1,
      "best-practices": 0.96,
      layoutShift: 0.01,
    });
  });

  it("count a category Lighthouse couldn't score, or left out, as 0", () => {
    expect(summarise(report({ performance: null, accessibility: 1 }))).toMatchObject({
      performance: 0,
      "best-practices": 0,
    });
  });

  it("take the middle of the runs, as Lighthouse's own scores move from run to run", () => {
    expect(median([0.86, 0.79, 0.91])).toBe(0.86);
    expect(median([0.8, 0.9])).toBeCloseTo(0.85);
  });

  it("let through a page whose median is within every budget, though one run is not", () => {
    const slow = summarise(report({ performance: 0.7, accessibility: 1, "best-practices": 0.96 }));
    const runs: LighthouseRun[] = [slow, summarise(withinBudget), summarise(withinBudget)];
    expect(missedBudgets("/sign-in", runs)).toEqual([]);
  });

  it("name each budget a page misses, with the median and the budget", () => {
    const run = summarise(report({ performance: 0.62, accessibility: 0.97, "best-practices": 0.96 }, 0.25));
    expect(missedBudgets("/offline", [run, run, run])).toEqual([
      "/offline: performance 0.62, below its budget of 0.8",
      "/offline: accessibility 0.97, below its budget of 1",
      "/offline: layout shift 0.25, above its budget of 0.1",
    ]);
  });
});
