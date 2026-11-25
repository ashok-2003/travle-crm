// Turning the AI's answer into the changes a member ticks: each built by code from the lines it cites (ground-trip.ts,
// ground-departures.ts), with the cited lines as evidence (and where each is from) and the flags that start it unticked:
// a value not printed in them, lines under another trip's nights, a change the member's role may not make. A change
// naming nothing real, or changing nothing, is dropped; of several for the itinerary, the AI switch or one field, the
// last is kept; at most MAX_PACKAGE_CHANGES.
import {
  MAX_PACKAGE_CHANGES,
  packageChange,
  packageChangeFlags,
  type evidenceKinds,
  type PackageChange,
} from "@travel-crm/contracts/ai";
import type { MemberAccess } from "../../identity/index.js";
import type { CalendarDate } from "../../kernel/index.js";
import type { AnsweredChange, ChangesAnswer } from "./answer.js";
import { groundDeparture } from "./ground-departures.js";
import { groundTrip, type TripChange } from "./ground-trip.js";
import type { ChangeFlag } from "./ground-values.js";
import { aboutOtherTrip } from "./other-trip.js";
import type { TripSnapshot } from "./trip-snapshot.js";

/** What the member's role (and plan) lets the changes do beyond editing the trip. */
export interface ChangeRights {
  addDepartures: boolean;
  editDepartures: boolean;
  selling: boolean;
}

export function changeRights(access: Pick<MemberAccess, "permissions">, departuresOnPlan: boolean): ChangeRights {
  return {
    addDepartures: departuresOnPlan && access.permissions.has("departures:create"),
    editDepartures: departuresOnPlan && access.permissions.has("departures:edit"),
    selling: access.permissions.has("settings:manage"),
  };
}

/** The right a kind of change needs beyond quotes:edit, if any. */
export function rightNeeded(kind: PackageChange["kind"]): keyof ChangeRights | null {
  if (kind === "departures_add") return "addDepartures";
  if (kind.startsWith("departure_")) return "editDepartures";
  return kind === "ai_selling" ? "selling" : null;
}

export interface GroundContext {
  snapshot: TripSnapshot;
  /** The lines code numbered: the message (L1), the PDF (P1.L1) and the answers to questions (A1). */
  lines: ReadonlyMap<string, string>;
  /** Photos attached (P1...): their lines are the AI's reading of them. */
  photoCount: number;
  today: CalendarDate;
  rights: ChangeRights;
}

interface Evidence {
  ref: string;
  text: string;
  kind: (typeof evidenceKinds)[number];
}

const PHOTO_LINE = /^P([1-9]\d*)\.L[1-9]\d*$/;

/** Where a line code numbered is from: L is the message, A an answer, and P (when code has it) the PDF. */
const codeKind = (ref: string): Evidence["kind"] =>
  ref.startsWith("L") ? "message" : ref.startsWith("A") ? "answer" : "pdf";

/** Reads any line by its ref: code's own text, else the AI's reading of a real photo's line. */
function lineReader(context: GroundContext, photoLines: ReadonlyMap<string, string>) {
  return (ref: string): Evidence | undefined => {
    const code = context.lines.get(ref);
    if (code !== undefined) return { ref, text: code, kind: codeKind(ref) };
    const photo = PHOTO_LINE.exec(ref);
    const read = photo !== null && Number(photo[1]) <= context.photoCount ? photoLines.get(ref) : undefined;
    return read === undefined ? undefined : { ref, text: read, kind: "photo" };
  };
}

/** One change per itinerary, AI switch and field: the last the AI gave, since applying several would keep only one. */
function lastOfEach(changes: readonly AnsweredChange[]): AnsweredChange[] {
  const keyOf = (change: AnsweredChange) =>
    change.kind === "trip_field"
      ? `field:${change.field}`
      : change.kind === "itinerary" || change.kind === "ai_selling"
        ? change.kind
        : null;
  return changes.filter((change, index) => {
    const key = keyOf(change);
    return key === null || !changes.slice(index + 1).some((later) => keyOf(later) === key);
  });
}

const departureKinds = new Set<AnsweredChange["kind"]>([
  "departures_add",
  "departure_cancel",
  "departure_reopen",
  "departure_prices",
  "departure_seats",
]);
const groupOnly = new Set<AnsweredChange["kind"]>([...departureKinds, "season_add", "season_change"]);

export function groundChanges(answer: ChangesAnswer, context: GroundContext): PackageChange[] {
  const read = lineReader(context, new Map(answer.photoLines.map((line) => [line.ref.trim(), line.text.trim()])));
  const { snapshot, today } = context;
  const changes: PackageChange[] = [];
  for (const change of lastOfEach(answer.changes)) {
    if (snapshot.trip.kind !== "group" && groupOnly.has(change.kind)) continue;
    const seen = new Set<string>();
    const evidence = change.lines.flatMap((ref) => {
      const line = seen.has(ref) ? undefined : read(ref);
      seen.add(ref);
      return line === undefined ? [] : [line];
    });
    const grounding = { snapshot, today, texts: evidence.map((one) => one.text) };
    const built = departureKinds.has(change.kind)
      ? groundDeparture(change as Parameters<typeof groundDeparture>[0], grounding)
      : [groundTrip(change as TripChange, grounding)].flatMap((one) => (one === null ? [] : [one]));
    for (const one of built) {
      const flags = new Set<ChangeFlag>(one.flags);
      if (evidence.length === 0) flags.add("not_in_message");
      const refs = evidence.map((line) => line.ref);
      if (aboutOtherTrip(refs, (ref) => read(ref)?.text, snapshot.trip.nights)) flags.add("other_trip");
      const right = rightNeeded(one.body.kind);
      if (right !== null && !context.rights[right]) flags.add("not_allowed");
      const parsed = packageChange.safeParse({
        ...one.body,
        id: `c${String(changes.length + 1)}`,
        evidence,
        flags: packageChangeFlags.filter((flag) => flags.has(flag)),
      });
      if (parsed.success && changes.length < MAX_PACKAGE_CHANGES) changes.push(parsed.data);
    }
  }
  return changes;
}
