// A drafted package saved as it stands, for a PDF uploaded on New package: no review form, so what the documents agree on
// is kept, and what they disagree on or don't say stays empty (the package page then lists it as a gap to fill).
import { createGroupPackageInput, type CreateGroupPackageInput, type PackageDraft } from "@travel-crm/contracts/ai";
import { MAX_HIGHLIGHTS, roomTypes, type RoomPrices } from "@travel-crm/contracts/quotes";

/** Only one alternative is a given; several are a disagreement, left for the owner. */
const onlyOne = <T>(alternatives: readonly T[]): T | undefined =>
  alternatives.length === 1 ? alternatives[0] : undefined;
const cut = (text: string | null, max: number) => (text ?? "").trim().slice(0, max);

function seasonsOf(draft: PackageDraft): CreateGroupPackageInput["seasons"] {
  return draft.seasons.flatMap((season, index) => {
    const prices = Object.fromEntries(
      roomTypes.map((room) => [room, onlyOne(season.prices[room])?.value ?? null]),
    ) as RoomPrices;
    // A season with no price agreed on is no season yet.
    if (Object.values(prices).every((price) => price === null)) return [];
    const label = cut(season.label.value, 60);
    return [
      {
        label: label === "" ? `Season ${String(index + 1)}` : label,
        startsOn: season.startsOn,
        endsOn: season.endsOn,
        prices,
      },
    ];
  });
}

/**
 * The save input for a draft as the AI proposed it, or null when even its name and place can't be told. `name` is the
 * package's name to use (the caller makes it unique); the PDF it came from is its brochure.
 */
export function packageInputOf(
  draft: PackageDraft,
  name: string,
  brochureKnowledgeId: string,
  placeWords: string,
): CreateGroupPackageInput | null {
  const nights = draft.nights.value;
  const input = {
    fillId: draft.fillId,
    name: cut(name, 80),
    title: cut(draft.title.value ?? name, 120) || cut(name, 120),
    destinationName: cut(draft.destination.value ?? placeWords, 80) || cut(placeWords, 80),
    nights: nights !== null && nights >= 0 && nights <= 60 ? nights : null,
    roomTypes: [...new Set(draft.roomTypes.value ?? [])],
    weeklyDays: [...new Set(onlyOne(draft.weeklyDays)?.value ?? [])].filter((day) => day >= 0 && day <= 6),
    departureMonths: [...new Set(draft.departureMonths.value ?? [])].filter((month) => month >= 1 && month <= 12),
    seatsPerDeparture: null,
    seasons: seasonsOf(draft).slice(0, 12),
    pricesIncludeGst: draft.pricesIncludeGst.value ?? true,
    advancePerPersonPaise: onlyOne(draft.advancePerPersonPaise)?.value ?? null,
    pickupPoints: cut(draft.pickupPoints.value, 500),
    startCity: cut(draft.startCity.value, 80),
    inclusions: cut(draft.inclusions.value, 3000),
    exclusions: cut(draft.exclusions.value, 3000),
    cancellationNotes: cut(draft.cancellationNotes.value, 2000),
    summary: cut(draft.summary.value, 600),
    highlights: (draft.highlights.value ?? [])
      .map((line) => cut(line, 160))
      .filter((line) => line !== "")
      .slice(0, MAX_HIGHLIGHTS),
    days: draft.days.flatMap((day) => (day.value === null ? [] : [day.value])),
    brochureKnowledgeId,
    appliedFields: ["fromPdf"],
  };
  const checked = createGroupPackageInput.safeParse(input);
  return checked.success ? checked.data : null;
}
