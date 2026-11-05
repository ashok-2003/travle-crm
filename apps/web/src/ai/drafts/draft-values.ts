// A drafted package as the review form holds it (text and lists of text), and back as the api's save input. Where the
// documents disagree the form starts empty and a choice per disagreement must be made before anything can be saved.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import type { CreateGroupPackageInput, PackageDraft } from "@travel-crm/contracts/ai";
import { roomTypes, type RoomType } from "@travel-crm/contracts/quotes";
import { rupeesFieldText } from "@/components/forms/money-field";
import { roomPriceKey, roomPricesFromText, type RoomPriceValues } from "@/room-prices/room-prices";

export interface SeasonValues {
  label: string;
  startsOn: string;
  endsOn: string;
  prices: RoomPriceValues;
  /** The alternative chosen for each room type the documents disagree on ("" until chosen). */
  choices: Record<RoomType, string>;
}

export interface ReviewValues {
  name: string;
  title: string;
  destination: string;
  nights: string;
  seats: string;
  startCity: string;
  pickupPoints: string;
  inclusions: string;
  exclusions: string;
  cancellationNotes: string;
  summary: string;
  /** One highlight per line. */
  highlights: string;
  advance: string;
  advanceChoice: string;
  weeklyDays: string[];
  weeklyDaysChoice: string;
  departureMonths: string[];
  roomTypes: string[];
  pricesIncludeGst: boolean;
  seasons: SeasonValues[];
  days: { title: string; description: string }[];
}

const textOf = (field: { value: string | null }) => field.value ?? "";
const emptyChoices = (): Record<RoomType, string> => ({
  single: "",
  double: "",
  triple: "",
  quad: "",
  child_bed: "",
  child_no_bed: "",
});

/** Fields the owner may keep as proposed, for the audit: the form value is compared with the draft's. */
const KEPT_FIELDS = [
  "name",
  "title",
  "destination",
  "nights",
  "startCity",
  "pickupPoints",
  "inclusions",
  "exclusions",
  "cancellationNotes",
  "summary",
  "highlights",
  "advance",
  "weeklyDays",
  "departureMonths",
  "roomTypes",
  "pricesIncludeGst",
] as const;

/** Only one alternative is a given; several are a disagreement and start unchosen. */
const onlyOne = <T>(alternatives: readonly T[]): T | undefined =>
  alternatives.length === 1 ? alternatives[0] : undefined;

export function valuesOf(draft: PackageDraft): ReviewValues {
  const weekly = onlyOne(draft.weeklyDays);
  const advance = onlyOne(draft.advancePerPersonPaise);
  return {
    name: textOf(draft.name),
    title: textOf(draft.title),
    destination: textOf(draft.destination),
    nights: draft.nights.value === null ? "" : String(draft.nights.value),
    seats: "",
    startCity: textOf(draft.startCity),
    pickupPoints: textOf(draft.pickupPoints),
    inclusions: textOf(draft.inclusions),
    exclusions: textOf(draft.exclusions),
    cancellationNotes: textOf(draft.cancellationNotes),
    summary: textOf(draft.summary),
    highlights: (draft.highlights.value ?? []).join("\n"),
    advance: advance?.value == null ? "" : rupeesFieldText(advance.value),
    advanceChoice: "",
    weeklyDays: (weekly?.value ?? []).map(String),
    weeklyDaysChoice: "",
    departureMonths: (draft.departureMonths.value ?? []).map(String),
    roomTypes: draft.roomTypes.value ?? [],
    pricesIncludeGst: draft.pricesIncludeGst.value ?? false,
    seasons: draft.seasons.map((season) => {
      const text = (room: RoomType) => {
        const price = onlyOne(season.prices[room]);
        return price?.value == null ? "" : rupeesFieldText(price.value);
      };
      return {
        label: textOf(season.label),
        startsOn: season.startsOn,
        endsOn: season.endsOn,
        prices: Object.fromEntries(roomTypes.map((room) => [roomPriceKey(room), text(room)])) as RoomPriceValues,
        choices: emptyChoices(),
      };
    }),
    days: draft.days.flatMap((day) => (day.value === null ? [] : [{ ...day.value }])),
  };
}

/** How many disagreements still wait for a choice. */
export function unchosen(draft: PackageDraft, values: ReviewValues): number {
  let left = 0;
  if (draft.weeklyDays.length > 1 && values.weeklyDaysChoice === "") left += 1;
  if (draft.advancePerPersonPaise.length > 1 && values.advanceChoice === "") left += 1;
  draft.seasons.forEach((season, index) => {
    for (const room of roomTypes) {
      if (season.prices[room].length > 1 && values.seasons[index]?.choices[room] === "") left += 1;
    }
  });
  return left;
}

const wholeNumber = (text: string): number | null => (/^\d{1,4}$/.test(text.trim()) ? Number(text) : null);

/** What blocks saving besides a missing choice: a required field empty, or an amount or number that cannot be read. */
export function isSaveable(values: ReviewValues): boolean {
  const filled = [values.name, values.title, values.destination].every((text) => text.trim() !== "");
  const nights = values.nights.trim() === "" || wholeNumber(values.nights) !== null;
  const seats = values.seats.trim() === "" || wholeNumber(values.seats) !== null;
  const advance = values.advance.trim() === "" || paiseFromRupeesText(values.advance) !== null;
  const seasons = values.seasons.every(
    (season) =>
      season.label.trim() !== "" &&
      season.startsOn !== "" &&
      season.endsOn >= season.startsOn &&
      Object.keys(roomPricesFromText(season.prices).unreadable).length === 0,
  );
  return filled && nights && seats && advance && seasons;
}

/** The api's save input from the checked form; null where the form cannot be read (isSaveable says so first). */
export function inputOf(draft: PackageDraft, values: ReviewValues): CreateGroupPackageInput {
  const first = valuesOf(draft);
  const advance = values.advance.trim();
  return {
    fillId: draft.fillId,
    name: values.name.trim(),
    title: values.title.trim(),
    destinationName: values.destination.trim(),
    nights: wholeNumber(values.nights),
    roomTypes: roomTypes.filter((room) => values.roomTypes.includes(room)),
    weeklyDays: values.weeklyDays.map(Number),
    departureMonths: values.departureMonths.map(Number),
    seatsPerDeparture: wholeNumber(values.seats),
    seasons: values.seasons.map((season) => ({
      label: season.label.trim(),
      startsOn: season.startsOn,
      endsOn: season.endsOn,
      prices: roomPricesFromText(season.prices).prices,
    })),
    pricesIncludeGst: values.pricesIncludeGst,
    advancePerPersonPaise: advance === "" ? null : paiseFromRupeesText(advance),
    pickupPoints: values.pickupPoints.trim(),
    startCity: values.startCity.trim(),
    inclusions: values.inclusions.trim(),
    exclusions: values.exclusions.trim(),
    cancellationNotes: values.cancellationNotes.trim(),
    summary: values.summary.trim(),
    highlights: values.highlights
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== ""),
    days: values.days
      .filter((day) => day.title.trim() !== "")
      .map((day) => ({ title: day.title.trim(), description: day.description.trim() })),
    brochureKnowledgeId: draft.brochureKnowledgeId,
    appliedFields: KEPT_FIELDS.filter(
      (key) =>
        JSON.stringify(values[key]) === JSON.stringify(first[key]) &&
        ![`""`, "[]"].includes(JSON.stringify(first[key])),
    ),
  };
}
