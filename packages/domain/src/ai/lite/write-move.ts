// What the Write model is told for a move: the instruction, the blanks it may copy, and what was looked up. Amounts, dates
// and seat counts are blanks that are described, never shown, so the model has no number to type.
import type { AgencyAnswers, ChecklistItem, LiteFacts } from "@travel-crm/contracts/ai";
import { roomTypes } from "@travel-crm/contracts/quotes";
import { formatRupees, formatShortDay, type CalendarDate } from "../../kernel/index.js";
import { Blanks } from "./blanks.js";
import { oneLine } from "./context/blocks.js";
import { roomWords } from "./fixed-texts.js";
import { itemPurposes, moveLines } from "./prompts/write-text.js";
import type { DepartureLine, Move, PackageDetails, PackageIndexEntry, Situation } from "./types.js";

export interface WriteMove {
  instruction: string;
  blanks: Blanks;
  looked: string[];
}

export interface WritingAgency {
  agencyName: string;
  agentName: string;
  answers: AgencyAnswers;
}

/** T5: a seat count is told only when it is this few or fewer. */
export const FEW_SEATS = 5;

const then = (ask: ChecklistItem | null): string =>
  ask === null ? "" : ` ${moveLines.then_ask.replace("{item}", itemPurposes[ask])}`;
const day = (value: string, today: CalendarDate): string => formatShortDay(value as CalendarDate, today);

const detailLines = (one: PackageDetails): string[] =>
  [
    ["Days", one.days.join("; ")],
    ["Highlights", one.highlights.join("; ")],
    ["Included", one.inclusions],
    ["Not included", one.exclusions],
    ["Notes", one.notes],
    ["Cancellation", one.cancellation],
    ["Pickups", one.pickups.join("; ")],
  ]
    .filter(([, text]) => (text ?? "") !== "")
    .map(([label, text]) => `${one.title} - ${label ?? ""}: ${oneLine(text ?? "")}`);

const entryLine = (one: PackageIndexEntry): string =>
  oneLine(
    `${one.title} (${[one.place, one.nights === null ? null : `${String(one.nights)} nights`, `from ${one.startCity}`]
      .filter((part) => part !== null && part !== "")
      .join(", ")})`,
  );

/** The lookups that help words (a trip's details, which trips matched); prices, dates and answers reach the reply as blanks. */
export function lookedLines(situation: Situation): string[] {
  return situation.looked.flatMap(({ result }) => {
    if ("error" in result) return result.tool === "package_details" ? ["The trip's details could not be read."] : [];
    if (result.tool === "package_details") return detailLines(result.details);
    if (result.tool === "find_packages") {
      return [...result.exact, ...result.closest].map((one) => `Trip: ${entryLine(one)}`);
    }
    return [];
  });
}

function withTrips(blanks: Blanks, ids: string[], index: Map<string, PackageIndexEntry>, withPrice: boolean): void {
  for (const id of ids) {
    const entry = index.get(id);
    if (entry === undefined) continue;
    const name = blanks.add("package", entry.title, "a trip's name", true);
    if (withPrice && entry.fromPaise != null) {
      blanks.add("from", formatRupees(entry.fromPaise), `the starting price per person of ${name}`, false);
    }
  }
}

function withDates(blanks: Blanks, pkgName: string, departures: DepartureLine[], today: CalendarDate): void {
  for (const one of departures) {
    const date = blanks.add("date", formatShortDay(one.startsOn, today), `a departure date of ${pkgName}`, false);
    if (one.freeSeats <= FEW_SEATS) {
      blanks.add(
        "seats",
        String(one.freeSeats),
        `the seats left on the departure of ${date}; few are left, say so`,
        false,
      );
    }
  }
}

function choicesIn(
  blanks: Blanks,
  item: ChecklistItem,
  choices: string[],
  facts: LiteFacts,
  today: CalendarDate,
): void {
  for (const choice of choices) {
    if (item === "when") blanks.add("choice", day(choice, today), "a departure date to offer", false);
    else if (item === "room") {
      const room = roomTypes.find((type) => type === choice);
      blanks.add("choice", room === undefined ? choice : roomWords(room, facts.language), "a room to offer", true);
    } else blanks.add("choice", choice, "an option to offer", true);
  }
}

/** The model's part of a move, or null when the move has nothing for it (code writes it all, or says nothing). */
export function writeMoveOf(
  move: Move,
  situation: Situation,
  facts: LiteFacts,
  agency: WritingAgency,
  today: CalendarDate,
  index: readonly PackageIndexEntry[] = [],
): WriteMove | null {
  const blanks = new Blanks();
  blanks.add("agency", agency.agencyName, "the agency's name", true);
  blanks.add("agent", agency.agentName, "your name", true);
  const trips = new Map(
    [...index, ...(situation.package === null ? [] : [situation.package])].map((one) => [one.id, one]),
  );
  const looked = lookedLines(situation);
  const made = (instruction: string): WriteMove => ({ instruction, blanks, looked });
  switch (move.kind) {
    case "greet":
      withTrips(blanks, move.packageIds, trips, true);
      return made(move.packageIds.length === 0 ? moveLines.greet_no_packages : moveLines.greet);
    case "show_other_trips":
      withTrips(blanks, move.packageIds, trips, true);
      return made(moveLines.show_other_trips);
    case "confirm_place":
      withTrips(blanks, move.packageIds, trips, false);
      return made(moveLines.confirm_place);
    case "answer_package": {
      if (situation.package?.id !== move.packageId) return null;
      blanks.add("package", situation.package.title, "the trip's name", true);
      return made(`${moveLines.answer_package}${then(move.ask)}`);
    }
    case "answer_agency": {
      const answer = agency.answers[move.topic];
      if (answer === undefined || answer.trim() === "") return null;
      blanks.add("answer", answer, `the agency's own answer about ${move.topic.replace(/_/g, " ")}`, false);
      return made(`${moveLines.answer_agency}${then(move.ask)}`);
    }
    case "give_dates": {
      const pkg = situation.package;
      if (pkg?.id !== move.packageId) return null;
      const departures = move.departureIds.flatMap((id) => pkg.departures.filter((one) => one.id === id));
      if (departures.length === 0) return null;
      const name = blanks.add("package", pkg.title, "the trip's name", true);
      withDates(blanks, name, departures, today);
      return made(`${moveLines.give_dates}${then(move.ask)}`);
    }
    case "give_price":
      // The price is code's own text; the model writes only the question that follows it.
      return move.ask === null
        ? null
        : made(`${moveLines.give_price} ${moveLines.ask_detail.replace("{item}", itemPurposes[move.ask])}`);
    case "ask_detail": {
      choicesIn(blanks, move.item, move.choices, facts, today);
      const line = move.choices.length > 0 ? moveLines.ask_detail_choices : moveLines.ask_detail;
      return made(line.replace("{item}", itemPurposes[move.item]));
    }
    case "follow_up":
      if (move.number === 2) return made(moveLines.follow_up_last);
      return made(
        move.ask === null ? moveLines.follow_up_open : moveLines.follow_up.replace("{item}", itemPurposes[move.ask]),
      );
    default:
      return null;
  }
}
