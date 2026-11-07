// A drafted package as the review form holds it (text and lists of text), and back as the api's save input. Where the
// documents disagree the form starts empty and a choice per disagreement must be made before anything can be saved.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { createGroupPackageInput, type CreateGroupPackageInput, type PackageDraft } from "@travel-crm/contracts/ai";
import { roomTypes, type RoomType } from "@travel-crm/contracts/quotes";
import { checked, type Checked } from "@/components/forms/checked";
import { rupeesFieldText } from "@/components/forms/money-field";
import { roomPricesFromText, type RoomPriceValues } from "@/room-prices/room-prices";

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
  /** The knowledge piece whose file is copied to the package, or NO_BROCHURE. */
  brochure: string;
  seasons: SeasonValues[];
  days: { title: string; description: string }[];
}

/** The brochure choice that copies nothing (a radio needs a value). */
export const NO_BROCHURE = "none";

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
    pricesIncludeGst: draft.pricesIncludeGst.value ?? true,
    brochure: draft.brochureKnowledgeId ?? NO_BROCHURE,
    seasons: draft.seasons.map((season) => {
      const text = (room: RoomType) => {
        const price = onlyOne(season.prices[room]);
        return price?.value == null ? "" : rupeesFieldText(price.value);
      };
      return {
        label: textOf(season.label),
        startsOn: season.startsOn,
        endsOn: season.endsOn,
        prices: {
          room_single: text("single"),
          room_double: text("double"),
          room_triple: text("triple"),
          room_quad: text("quad"),
          room_child_bed: text("child_bed"),
          room_child_no_bed: text("child_no_bed"),
        },
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
/** A typed number for the contract: empty is "not given", and text that is no number is NaN, which the contract refuses. */
const typedNumber = (text: string): number | null => (text.trim() === "" ? null : (wholeNumber(text) ?? Number.NaN));

/** What the contract can refuse on the form, said on its field; the form's words are `ai.drafts.review.problems`. */
export type ReviewProblem = "required" | "tooLong" | "number" | "amount" | "seasons" | "days" | "highlights";

/** The form's fields that a refusal can be placed on, by the name the contract gives them. */
const fieldNames = [
  "name",
  "title",
  "destination",
  "nights",
  "seats",
  "startCity",
  "pickupPoints",
  "inclusions",
  "exclusions",
  "cancellationNotes",
  "summary",
  "highlights",
  "advance",
  "seasons",
  "days",
] as const;
const renamed: Record<string, (typeof fieldNames)[number]> = {
  destinationName: "destination",
  seatsPerDeparture: "seats",
  advancePerPersonPaise: "advance",
};
const fieldAt = (path: readonly PropertyKey[]): (typeof fieldNames)[number] | undefined => {
  const key = String(path[0]);
  return renamed[key] ?? fieldNames.find((field) => field === key);
};
const problemOf = (field: keyof ReviewValues): ReviewProblem => {
  switch (field) {
    case "nights":
    case "seats":
      return "number";
    case "advance":
      return "amount";
    case "seasons":
    case "days":
    case "highlights":
      return field;
    default:
      return "tooLong";
  }
};

/** The form checked by the same contract the api saves with: the input to send, or what is refused, field by field. */
export function checkReview(
  draft: PackageDraft,
  values: ReviewValues,
): Checked<ReviewValues, CreateGroupPackageInput, ReviewProblem> {
  const first = valuesOf(draft);
  const advance = values.advance.trim();
  const seasons = values.seasons.map((season) => ({ season, read: roomPricesFromText(season.prices) }));
  const raw = {
    fillId: draft.fillId,
    name: values.name,
    title: values.title,
    destinationName: values.destination,
    nights: typedNumber(values.nights),
    roomTypes: roomTypes.filter((room) => values.roomTypes.includes(room)),
    weeklyDays: values.weeklyDays.map(Number),
    departureMonths: values.departureMonths.map(Number),
    seatsPerDeparture: typedNumber(values.seats),
    seasons: seasons.map(({ season, read }) => ({
      label: season.label,
      startsOn: season.startsOn,
      endsOn: season.endsOn,
      prices: read.prices,
    })),
    pricesIncludeGst: values.pricesIncludeGst,
    advancePerPersonPaise: advance === "" ? null : (paiseFromRupeesText(advance) ?? Number.NaN),
    pickupPoints: values.pickupPoints,
    startCity: values.startCity,
    inclusions: values.inclusions,
    exclusions: values.exclusions,
    cancellationNotes: values.cancellationNotes,
    summary: values.summary,
    highlights: values.highlights
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== ""),
    days: values.days
      .filter((day) => day.title.trim() !== "")
      .map((day) => ({ title: day.title, description: day.description })),
    brochureKnowledgeId: values.brochure === NO_BROCHURE ? null : values.brochure,
    appliedFields: KEPT_FIELDS.filter(
      (key) =>
        JSON.stringify(values[key]) === JSON.stringify(first[key]) &&
        ![`""`, "[]"].includes(JSON.stringify(first[key])),
    ),
  };
  // An amount that cannot be read is null in the input, which the contract accepts: say it here.
  const unreadable = seasons.some(({ read }) => Object.keys(read.unreadable).length > 0);
  return checked(
    createGroupPackageInput.safeParse(raw),
    values,
    fieldAt,
    problemOf,
    unreadable ? { seasons: "seasons" } : {},
  );
}

// The form's paths through its lists: the lint rule refuses a number in a template, and the form's types need the number.
// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
export const seasonPath = (index: number): `seasons.${number}` => `seasons.${index}`;
export const dayPath = (index: number, field: "title" | "description"): `days.${number}.${typeof field}` =>
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  `days.${index}.${field}`;
