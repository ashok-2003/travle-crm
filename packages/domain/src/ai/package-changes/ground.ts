// Turning the AI's answer into the changes a member ticks: each built by code from the lines it cites (ground-trip.ts,
// ground-departures.ts), with the cited lines as evidence and the flags that start it unticked: a value not printed in
// them, a line about another trip's nights, a change the member's role may not make. A change naming nothing real, or
// changing nothing, is dropped.
import { packageChange, packageChangeFlags, type PackageChange } from "@travel-crm/contracts/ai";
import type { MemberAccess } from "../../identity/index.js";
import type { CalendarDate } from "../../kernel/index.js";
import type { AnsweredChange, ChangesAnswer } from "./answer.js";
import { groundDeparture } from "./ground-departures.js";
import { groundTrip, type TripChange } from "./ground-trip.js";
import { namesOtherTrip, type ChangeFlag } from "./ground-values.js";
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

const PHOTO_LINE = /^P(\d+)\.L\d+$/;

/** The cited lines as evidence, in the order cited, once each: code's own text, or the AI's reading of a photo. */
function evidenceOf(cited: readonly string[], context: GroundContext, photoLines: ReadonlyMap<string, string>) {
  const seen = new Set<string>();
  return cited.flatMap((ref) => {
    const photo = PHOTO_LINE.exec(ref);
    const text =
      context.lines.get(ref) ??
      (photo !== null && Number(photo[1]) <= context.photoCount ? photoLines.get(ref) : undefined);
    if (text === undefined || seen.has(ref)) return [];
    seen.add(ref);
    return [{ ref, text }];
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
  const photoLines = new Map(answer.photoLines.map((line) => [line.ref.trim(), line.text.trim()]));
  const { snapshot, today } = context;
  const changes: PackageChange[] = [];
  for (const change of answer.changes) {
    if (snapshot.trip.kind !== "group" && groupOnly.has(change.kind)) continue;
    const evidence = evidenceOf(change.lines, context, photoLines);
    const grounding = { snapshot, today, texts: evidence.map((one) => one.text) };
    const built = departureKinds.has(change.kind)
      ? groundDeparture(change as Parameters<typeof groundDeparture>[0], grounding)
      : groundTrip(change as TripChange, grounding);
    if (built === null) continue;
    const flags = new Set<ChangeFlag>(built.flags);
    if (evidence.length === 0) flags.add("not_in_message");
    if (namesOtherTrip(grounding.texts, snapshot.trip.nights)) flags.add("other_trip");
    const right = rightNeeded(built.body.kind);
    if (right !== null && !context.rights[right]) flags.add("not_allowed");
    const parsed = packageChange.safeParse({
      ...built.body,
      id: `c${String(changes.length + 1)}`,
      evidence,
      flags: packageChangeFlags.filter((flag) => flags.has(flag)),
    });
    if (parsed.success) changes.push(parsed.data);
  }
  return changes;
}
