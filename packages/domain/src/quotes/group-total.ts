// What a group trip's rooms cost the customer, GST included, and how that splits into the quote's lines. The group quote
// and the AI's lookup both call this, so the total the customer is told is the total the quote charges. The agency's GST
// state only decides CGST/SGST against IGST, never the total: the lookup, which does not know it, passes any valid one.
import type { RoomBooking, RoomPrices, RoomType } from "@travel-crm/contracts/quotes";
import { exTaxSubtotal, totalFor } from "./room-prices.js";
import { quoteMoney } from "./totals.js";

export interface GroupTax {
  pricesIncludeGst: boolean;
  taxRateBasisPoints: number;
  supplierStateCode: string;
}

export type GroupTotal =
  | {
      ok: true;
      /** What the quote charges: the pre-tax subtotal plus its GST. */
      totalPaise: number;
      subtotalPaise: number;
      /** One per room type, their shares adding up to the subtotal. */
      lines: { roomType: RoomType; people: number; sharePaise: number }[];
    }
  | { ok: false; reason: "NO_PRICE" | "ROOM_SPLIT"; roomType: RoomType };

const taxLine = (unitPricePaise: number) => ({
  description: "Tour package",
  detail: "",
  quantity: 1,
  unitPricePaise,
});

/** The total of the rooms of a package selling `offered` (one room type sold alone is per person: see `totalFor`). */
export function groupTotal(
  prices: RoomPrices,
  rooms: readonly RoomBooking[],
  tax: GroupTax,
  offered: readonly RoomType[],
): GroupTotal {
  const priced = totalFor(prices, rooms, offered);
  if (!priced.ok) return priced;
  const moneyOf = (subtotalPaise: number) =>
    quoteMoney([taxLine(subtotalPaise)], tax.taxRateBasisPoints, tax.supplierStateCode, null);
  // Prices that include GST are split back into the subtotal the quote adds its GST to.
  const subtotalPaise = tax.pricesIncludeGst
    ? exTaxSubtotal(priced.totalPaise, tax.taxRateBasisPoints, (subtotal) => moneyOf(subtotal).taxPaise)
    : priced.totalPaise;
  // Each line takes its share of the subtotal; the last takes what rounding left.
  let given = 0;
  const lines = priced.lines.map((line, index) => {
    const last = index === priced.lines.length - 1;
    const sharePaise = last
      ? subtotalPaise - given
      : Math.floor((subtotalPaise * line.amountPaise) / priced.totalPaise);
    given += sharePaise;
    return { roomType: line.roomType, people: line.people, sharePaise };
  });
  return { ok: true, totalPaise: moneyOf(subtotalPaise).totalPaise, subtotalPaise, lines };
}
