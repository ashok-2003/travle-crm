// The budgets the app's public pages are held to in Lighthouse (scripts/lighthouse.ts): a lowest score for each
// category, and DESIGN.md's "no layout shift" as a cumulative layout shift. A page is judged by the median of its
// runs, because Lighthouse's own scores move from run to run.

export const CATEGORIES = ["performance", "accessibility", "best-practices"] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Lighthouse's phone (a mid-range phone on slow 4G) scored the sign-in page's performance 0.87 and the offline
 * page's 0.91 when these were set: the floor of 0.8 leaves room for slower CI machines, and goes to 0.9 once CI's
 * runs show the room (ADR 0027). Accessibility is whole, as the journeys' axe checks require, and best practices lose
 * 0.04 over plain http on localhost. Both pages shift 0, so the ceiling of 0.01 allows noise but no real shift.
 */
export const budgets: Readonly<Record<Category, number> & { layoutShift: number }> = {
  performance: 0.8,
  accessibility: 1,
  "best-practices": 0.95,
  layoutShift: 0.01,
};

/** One run's numbers: each category's score (0 when Lighthouse couldn't score it), and the layout shift. */
export type LighthouseRun = Record<Category, number> & { layoutShift: number };

interface Report {
  categories?: Record<string, { score?: number | null } | undefined>;
  audits?: Record<string, { numericValue?: number } | undefined>;
}

/** The numbers the budgets read from a Lighthouse report (its JSON output). */
export function summarise(report: Report): LighthouseRun {
  const score = (category: Category) => report.categories?.[category]?.score ?? 0;
  return {
    performance: score("performance"),
    accessibility: score("accessibility"),
    "best-practices": score("best-practices"),
    // A report without the audit counts as shifting: the budget can't be shown to hold.
    layoutShift: report.audits?.["cumulative-layout-shift"]?.numericValue ?? Number.POSITIVE_INFINITY,
  };
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** A line for each budget the page's median run misses; none when it keeps them all. */
export function missedBudgets(page: string, runs: readonly LighthouseRun[]): string[] {
  const missed = CATEGORIES.flatMap((category) => {
    const score = median(runs.map((run) => run[category]));
    return score < budgets[category]
      ? [`${page}: ${category} ${String(score)}, below its budget of ${String(budgets[category])}`]
      : [];
  });
  const layoutShift = median(runs.map((run) => run.layoutShift));
  if (layoutShift > budgets.layoutShift) {
    missed.push(`${page}: layout shift ${String(layoutShift)}, above its budget of ${String(budgets.layoutShift)}`);
  }
  return missed;
}
