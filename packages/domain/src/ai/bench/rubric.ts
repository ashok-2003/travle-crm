// The bench's rubric: reads each turn's trace and the chat's end and marks what the case expects, plus the checks every
// chat gets (nothing invented, money in code's words, nothing repeated). A check's name never holds a case's words.
import { amountsAndDatesIn } from "@travel-crm/contracts/ai";
import type { ChecklistItem, LiteCase, LiteFacts, LiteIntent, LiteMoveKind } from "@travel-crm/contracts/ai";
import { fullName } from "../lite/decide/stage.js";

export interface Span {
  start: number;
  end: number;
}

export interface BenchCheck {
  name: string;
  pass: boolean;
}

export interface BenchTurn {
  /** The customer's lines this turn answered. */
  customer: string[];
  outcome: string;
  move: LiteMoveKind | null;
  reason: string | null;
  why: string | null;
  intents: LiteIntent[];
  asked: ChecklistItem | null;
  /** What the chat already held when the turn began. */
  heldBefore: ChecklistItem[];
  text: string | null;
  filled: Span[];
  /** Whether the Write model's words are in the reply. */
  wrote: boolean;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  ms: number;
}

export interface BenchEnd {
  /** Every message of the AI, in order. */
  sent: string[];
  actions: { payment: boolean; files: boolean; booking: boolean; handOver: boolean };
  flagged: boolean;
  knows: ChecklistItem[];
}

/** The checklist items the facts already hold, in the checklist's order. */
export function heldItems(facts: LiteFacts): ChecklistItem[] {
  const held: [ChecklistItem, boolean][] = [
    ["name", facts.name !== null],
    ["where", facts.packageId !== null],
    ["when", facts.departureId !== null || facts.day !== null],
    ["people", facts.adults !== null],
    ["children_ages", facts.children !== null && facts.children.ages.length >= facts.children.count],
    ["pickup", facts.pickupCity !== null],
    ["room", facts.roomType !== null],
    ["full_name", fullName(facts.name)],
  ];
  return held.filter(([, yes]) => yes).map(([item]) => item);
}

const SEATS = /\d+\s*(seats?|सीट)/giu;

/** The amounts, dates and seat counts in a reply that code did not write: the model typed them. */
export function inventedSpans(text: string, filled: readonly Span[]): Span[] {
  const found: Span[] = [
    ...amountsAndDatesIn(text).map(({ start, end }) => ({ start, end })),
    ...[...text.matchAll(SEATS)].map((match) => ({ start: match.index, end: match.index + match[0].length })),
  ];
  return found.filter((span) => !filled.some((one) => span.start >= one.start && span.end <= one.end));
}

const MONEY_MOVES: ReadonlySet<LiteMoveKind | null> = new Set(["book", "resend_payment", "hand_over"]);
const plain = (text: string) => text.trim().toLowerCase();

/** What the case expects, then the checks every chat gets; in the order the plan lists them. */
export function benchChecks(one: LiteCase, turns: readonly BenchTurn[], end: BenchEnd): BenchCheck[] {
  const { expect } = one;
  const text = end.sent.join("\n").toLowerCase();
  const checks: BenchCheck[] = [{ name: "sent", pass: end.sent.length > 0 === expect.sent }];
  expect.includes?.forEach((word, index) =>
    checks.push({ name: `includes ${String(index + 1)}`, pass: text.includes(word.toLowerCase()) }),
  );
  expect.excludes?.forEach((word, index) =>
    checks.push({ name: `excludes ${String(index + 1)}`, pass: !text.includes(word.toLowerCase()) }),
  );
  for (const [key, want] of Object.entries(expect.actions ?? {})) {
    checks.push({ name: `actions ${key}`, pass: end.actions[key as keyof BenchEnd["actions"]] === want });
  }
  if (expect.flagged !== undefined) checks.push({ name: "flagged", pass: end.flagged === expect.flagged });
  if (expect.move !== undefined) checks.push({ name: "move", pass: turns.at(-1)?.move === expect.move });
  if (expect.handOver !== undefined) {
    const handed = turns.findLast((turn) => turn.move === "hand_over");
    checks.push({ name: "handOver", pass: handed?.reason === expect.handOver && end.actions.handOver });
  }
  for (const item of expect.knows ?? []) checks.push({ name: `knows ${item}`, pass: end.knows.includes(item) });
  turns.forEach((turn, index) => {
    const label = `turn ${String(index + 1)}`;
    if (turn.text !== null) {
      checks.push({ name: `${label} invented`, pass: inventedSpans(turn.text, turn.filled).length === 0 });
    }
    if (MONEY_MOVES.has(turn.move)) checks.push({ name: `${label} money_fixed`, pass: !turn.wrote });
  });
  const wrote = turns.filter((turn) => turn.wrote && turn.text !== null).map((turn) => plain(turn.text ?? ""));
  const repeated = wrote.some((reply, index) => wrote.indexOf(reply) !== index);
  const askedAgain = turns.some((turn) => turn.asked !== null && turn.heldBefore.includes(turn.asked));
  checks.push({ name: "repeat", pass: !repeated && !askedAgain });
  return checks;
}
