"use client";

// A departure linked to a group package carries its own price per person for each room type, instead of the single price:
// the form's values for them (one text per room type), read into the contract's prices, and which of them to show.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { roomTypes, type RoomPrices, type RoomType } from "@travel-crm/contracts/quotes";
import { rupeesFieldText } from "@/components/forms/money-field";
import { usePackage } from "@/packages/use-packages";

export type RoomPriceKey = `room_${RoomType}`;
export type RoomPriceValues = Record<RoomPriceKey, string>;

export const roomPriceKey = (room: RoomType): RoomPriceKey => `room_${room}`;

export function roomPriceValues(prices: RoomPrices | undefined): RoomPriceValues {
  const text = (room: RoomType) => {
    const paise = prices?.[room] ?? null;
    return paise === null ? "" : rupeesFieldText(paise);
  };
  return {
    room_single: text("single"),
    room_double: text("double"),
    room_triple: text("triple"),
    room_quad: text("quad"),
    room_child_bed: text("child_bed"),
    room_child_no_bed: text("child_no_bed"),
  };
}

/** The typed prices in paise (null where empty), and the fields whose text is not an amount. */
export function roomPricesOf(typed: RoomPriceValues): {
  prices: RoomPrices;
  unreadable: Partial<Record<RoomPriceKey, "invalid">>;
} {
  const unreadable: Partial<Record<RoomPriceKey, "invalid">> = {};
  const read = (room: RoomType): number | null => {
    const text = typed[roomPriceKey(room)].trim();
    if (text === "") return null;
    const paise = paiseFromRupeesText(text);
    if (paise === null) unreadable[roomPriceKey(room)] = "invalid";
    return paise;
  };
  const prices: RoomPrices = {
    single: read("single"),
    double: read("double"),
    triple: read("triple"),
    quad: read("quad"),
    child_bed: read("child_bed"),
    child_no_bed: read("child_no_bed"),
  };
  return { prices, unreadable };
}

/** The field a refusal about the prices at this path belongs to. */
export function roomPriceFieldAt(path: readonly PropertyKey[]): RoomPriceKey | undefined {
  const room = roomTypes.find((type) => type === path[1]);
  return room === undefined ? undefined : roomPriceKey(room);
}

/** The room types a linked departure shows: those the package sells (all while it loads), and any already priced. */
export function useShownRoomTypes(packageId: string | null, priced: RoomPrices | undefined): RoomType[] {
  const offered = usePackage(packageId ?? "", packageId !== null).data?.roomTypes;
  return roomTypes.filter(
    (room) => offered === undefined || offered.includes(room) || (priced?.[room] ?? null) !== null,
  );
}
