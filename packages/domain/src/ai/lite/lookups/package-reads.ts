// Reads of one package's saved data the one agent shares: its text without contacts, its rooms and its lowest adult
// price.
import { type LiteFacts } from "@travel-crm/contracts/ai";
import { adultRoomTypes, type RoomBooking, type RoomPrices, type RoomType } from "@travel-crm/contracts/quotes";
import { type CalendarDate } from "../../../kernel/index.js";
import { fromPrices } from "../../../quotes/index.js";

/** Only splits CGST/SGST from IGST, never the total, so the lookup (which has no GST state) may use any valid one. */
export const ANY_STATE = "27";
/** Drops an email ("x@y") and a handle ("@sharmatrips"); an "@" standing alone ("Gate @ ISBT") stays. */
export const withoutContacts = (text: string) =>
  text
    .replace(/\S+@\S+|(?<!\S)@[\p{L}\p{N}_.]+/gu, "")
    .replace(/[ \t]{2,}/gu, " ")
    .trim();
export const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one): one is string => typeof one === "string") : [];

const adultRoomsOf = (offered: readonly RoomType[]): RoomType[] =>
  adultRoomTypes.filter((type) => offered.includes(type));

/**
 * The adults' room: the only adult room the package sells, whatever room they said (a triple-only trek has nothing else
 * to give "2 sharing"); else the one they chose; null while it is open.
 */
function adultsRoom(roomType: RoomType | null, offered: readonly RoomType[]): RoomType | null {
  const [only, ...others] = adultRoomsOf(offered);
  if (only !== undefined && others.length === 0) return only;
  return roomType;
}

/** The rooms the party takes. A child takes a child bed if offered, else no bed, else shares the adults' room. */
export function liteRooms(
  facts: Pick<LiteFacts, "adults" | "children" | "roomType">,
  offered: RoomType[],
): RoomBooking[] {
  const room = adultsRoom(facts.roomType, offered);
  if (facts.adults === null || room === null) return [];
  const children = facts.children?.count ?? 0;
  const childRoom = offered.includes("child_bed")
    ? "child_bed"
    : offered.includes("child_no_bed")
      ? "child_no_bed"
      : room;
  const rooms: RoomBooking[] = [{ roomType: room, people: facts.adults + (childRoom === room ? children : 0) }];
  if (children > 0 && childRoom !== room) rooms.push({ roomType: childRoom, people: children });
  return rooms;
}

/** The lowest adult price per person still to come, over the seasons not yet ended and the open departures' own prices. */
export function lowestAdultPrice(
  seasons: Parameters<typeof fromPrices>[0],
  open: readonly { prices: RoomPrices }[],
  today: CalendarDate,
  offered: readonly RoomType[],
): number | null {
  const from = fromPrices(
    seasons,
    open.map((one) => one.prices),
    today,
    offered,
  );
  const given = adultRoomTypes.flatMap((type) => (from[type] === null ? [] : [from[type]]));
  return given.length === 0 ? null : Math.min(...given);
}
