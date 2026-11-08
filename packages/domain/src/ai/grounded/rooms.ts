// The rooms a chat's travellers take in one package: what the lookup totals and the booking quotes, by one rule.
import type { ChatFacts } from "@travel-crm/contracts/ai";
import type { RoomType } from "@travel-crm/contracts/quotes";
import { onlyRoomType } from "../../quotes/index.js";

/**
 * The customer's own rooms, except in a package selling one room type (a trek of triple tents, priced per person): there
 * every traveller takes it once their number is known, whatever room counts were said ("1 triple" from a party of four
 * is four in triple). The lookup and the booking both call this, so the total told is the total quoted.
 */
export function roomsFor(
  facts: Pick<ChatFacts, "rooms" | "travellers">,
  offered: readonly RoomType[],
): ChatFacts["rooms"] {
  const only = onlyRoomType(offered);
  return only === null || facts.travellers === null ? facts.rooms : [{ roomType: only, people: facts.travellers }];
}
