// The offer card: code writes its words from the offer record, so the figures a customer taps are never the model's.
import type { LiveOffer } from "@travel-crm/contracts/ai";
import { BUTTON_LIMITS, type WhatsAppButton } from "@travel-crm/integrations/whatsapp";
import { formatRupees, formatShortDay, isUuid, parseCalendarDate, type CalendarDate } from "../../kernel/index.js";
import { travellerWords } from "../lite/context/lead-card.js";
import { isText, roomNames } from "../natural/trips/trip-text.js";
import type { TripSheet } from "../natural/types.js";

export const BOOK_TITLE = "Book these seats";
export const CHANGE_TITLE = "Change something";

const cut = (text: string, most: number) => (text.length <= most ? text : `${text.slice(0, most - 1)}…`);

/** The card's body (BT4): trip, day, party, room, start city, total and advance, within WhatsApp's limit. */
export function offerCardBody(offer: LiveOffer, sheets: readonly TripSheet[], today: CalendarDate): string {
  const sheet = sheets.find((one) => one.packageId === offer.packageId);
  const money = offer.payInFull
    ? `Total ${formatRupees(offer.totalPaise)}, all now`
    : `Total ${formatRupees(offer.totalPaise)} · ${formatRupees(offer.advancePaise)} advance now`;
  const details = [
    formatShortDay(parseCalendarDate(offer.startsOn), today),
    travellerWords(offer.adults, offer.childrenAges),
    offer.room === null
      ? null
      : `${roomNames[offer.room][0]?.toUpperCase() ?? ""}${roomNames[offer.room].slice(1)} room`,
  ]
    .filter(isText)
    .join(" · ");
  const body = [
    `*${sheet === undefined ? "Your trip" : cut(sheet.title, 60)}*`,
    details,
    sheet === undefined || sheet.startCity === "" ? null : `From ${cut(sheet.startCity, 60)}`,
    money,
  ]
    .filter(isText)
    .join("\n");
  return cut(body, BUTTON_LIMITS.body);
}

/** The two buttons; each id names the offer it answers, never a person. */
export function offerButtons(offerId: string): WhatsAppButton[] {
  return [
    { id: `book:${offerId}`, title: BOOK_TITLE },
    { id: `change:${offerId}`, title: CHANGE_TITLE },
  ];
}

/** What a tapped button's id says, or null for any id that isn't one of ours. */
export function tapOf(buttonReplyId: string | null): { button: "book" | "change"; offerId: string } | null {
  const match = /^(book|change):(.+)$/u.exec(buttonReplyId ?? "");
  const [, button, offerId] = match ?? [];
  return (button === "book" || button === "change") && offerId !== undefined && isUuid(offerId)
    ? { button, offerId }
    : null;
}
