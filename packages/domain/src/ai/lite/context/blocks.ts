// The clean context's building block: a titled, budgeted run of plain lines, and the limits every block keeps.

export interface Block {
  title: string;
  purpose: string;
  lines: string[];
  budget: number;
}

/** Characters each block's lines may take (its title and purpose are extra). */
export const BUDGETS = {
  agency: 200,
  packageIndex: 2600,
  places: 1000,
  today: 80,
  leadCard: 500,
  summary: 900,
  timeline: 450,
  messages: 5200,
  you: 250,
  move: 700,
  facts: 1600,
  lookedUp: 2000,
  writeSummary: 900,
  writeMessages: 1700,
  language: 80,
} as const satisfies Record<string, number>;

/** The stored summary may be 1,000 characters; the context quotes about this many of them. */
export const SUMMARY_QUOTED = 800;

/** Whole lines in order while they fit; the first that doesn't is cut with "…" and the rest are left out. */
export function fitLines(lines: string[], budget: number): string[] {
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const cost = line.length + (kept.length === 0 ? 0 : 1);
    if (used + cost <= budget) {
      kept.push(line);
      used += cost;
      continue;
    }
    const room = budget - used - (kept.length === 0 ? 0 : 1);
    if (room >= 2) kept.push(`${line.slice(0, room - 1)}…`);
    break;
  }
  return kept;
}

/** How many of the last lines fit whole in the budget: for a chat, the newest lines are the ones worth keeping. */
export function newestThatFit(lines: string[], budget: number): number {
  let used = 0;
  let count = 0;
  for (let at = lines.length - 1; at >= 0; at -= 1) {
    const cost = (lines[at] ?? "").length + (count === 0 ? 0 : 1);
    if (used + cost > budget) break;
    used += cost;
    count += 1;
  }
  return count;
}

/** The block as the model reads it; nothing at all when it has no lines. */
export function renderBlock(block: Block): string {
  const lines = fitLines(
    block.lines.filter((line) => line !== ""),
    block.budget,
  );
  if (lines.length === 0) return "";
  return [`## ${block.title}`, block.purpose, ...lines].join("\n");
}

/** The summary's lines, cut at a line or word boundary when it runs past what the context quotes back. */
export function summaryLines(summary: string): string[] {
  const text = summary.trim();
  if (text.length <= SUMMARY_QUOTED) return text === "" ? [] : text.split("\n");
  const head = text.slice(0, SUMMARY_QUOTED);
  const atLine = head.lastIndexOf("\n");
  const atWord = head.lastIndexOf(" ");
  const cut = atLine >= SUMMARY_QUOTED / 2 ? atLine : atWord > 0 ? atWord : SUMMARY_QUOTED;
  return `${head.slice(0, cut).trimEnd()}…`.split("\n");
}
