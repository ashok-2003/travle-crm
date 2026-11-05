// The price of each room type as a form holds it (one rupee text per type) and as the contracts do (paise): shared by a
// package's seasons and a departure's own prices, so neither keeps a copy.
import { paiseFromRupeesText } from "@travel-crm/contracts/kernel";
import { roomTypes, type RoomPrices, type RoomType } from "@travel-crm/contracts/quotes";
import { useQuery } from "@tanstack/react-query";
import { rupeesFieldText } from "@/components/forms/money-field";
import { useTRPC } from "@/data/trpc";

export type RoomPriceKey = `room_${RoomType}`;
export type RoomPriceValues = Record<RoomPriceKey, string>;
export type UnreadablePrices = Partial<Record<RoomPriceKey, "invalid">>;

export const roomPriceKey = (room: RoomType): RoomPriceKey => `room_${room}`;

/** Prices in paise as the form's texts ("12,500", empty where none). */
export function roomPricesToText(prices: RoomPrices | undefined | null): RoomPriceValues {
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

/** The typed texts in paise (null where empty), and the fields whose text is not an amount. */
export function roomPricesFromText(typed: RoomPriceValues): { prices: RoomPrices; unreadable: UnreadablePrices } {
  const unreadable: UnreadablePrices = {};
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

/** The field a refusal about the prices at this path (`["prices", "double"]`) belongs to. */
export function roomPriceFieldAt(path: readonly PropertyKey[]): RoomPriceKey | undefined {
  const room = roomTypes.find((type) => type === path[1]);
  return room === undefined ? undefined : roomPriceKey(room);
}

/** The room types to show: those the package sells (all while that loads), and any already priced. */
export function shownRoomTypes(offered: readonly RoomType[] | undefined, priced: RoomPrices | undefined): RoomType[] {
  return roomTypes.filter(
    (room) => offered === undefined || offered.includes(room) || (priced?.[room] ?? null) !== null,
  );
}

/** The room types a package sells, once it has loaded; undefined for no package. */
export function usePackageRoomTypes(packageId: string | null): readonly RoomType[] | undefined {
  const trpc = useTRPC();
  const detail = useQuery({
    ...trpc.packages.get.queryOptions({ packageId: packageId ?? "" }),
    enabled: packageId !== null,
  });
  return detail.data?.roomTypes;
}
