// The reply check's context for a lite reply: the places the turn's own trips name (saying them invents nothing), the
// customer's own places and the ones we don't run.
import { indianTravelPlaces } from "@travel-crm/contracts/ai";
import type { LiteFacts } from "@travel-crm/contracts/ai";
import { findWord } from "./phrase-match.js";
import type { ReplyContext } from "./reply-check.js";
import type { PackageIndexEntry, Situation } from "./types.js";

const entryText = (one: PackageIndexEntry): string => [one.title, one.place ?? "", one.startCity].join("\n");

/**
 * `places` are the places the agency knows (its destinations); `shown` are the index entries a move names by title
 * (greet, show_other_trips, confirm_place), whose places may be said too. customTrips is false: the lite agent never
 * offers a custom trip, so "we make custom trips" is no excuse for a place we don't run.
 */
export function liteReplyContext(
  situation: Situation,
  facts: LiteFacts,
  places: string[],
  shown: readonly PackageIndexEntry[] = [],
): ReplyContext {
  const knownPlaces = [...new Set([...places, ...indianTravelPlaces])];
  const found = situation.looked.flatMap(({ result }) => {
    if ("error" in result) return [];
    if (result.tool === "find_packages") return [...result.exact, ...result.closest].map(entryText);
    if (result.tool === "package_details") {
      const one = result.details;
      return [
        [
          one.title,
          one.place ?? "",
          one.startCity,
          ...one.pickups,
          ...one.days,
          ...one.highlights,
          one.inclusions,
          one.exclusions,
          one.notes,
          one.cancellation,
        ].join("\n"),
      ];
    }
    return [];
  });
  const chosen = situation.package;
  const texts = [
    ...found,
    ...shown.map(entryText),
    ...(chosen === null ? [] : [entryText(chosen), ...chosen.pickups]),
  ].join("\n");
  return {
    knownPlaces,
    packagePlaces: knownPlaces.filter((place) => findWord(texts, place).length > 0),
    customerPlaces: [facts.pickupCity ?? "", facts.placeWords ?? ""].filter((place) => place.trim() !== ""),
    notRun: facts.notRun,
    customTrips: false,
  };
}
