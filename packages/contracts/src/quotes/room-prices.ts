// Room types of a group trip and the price of each, in paise per person: the shapes a season, a departure and a quote share.
import { z } from "zod";
import { MAX_SEATS } from "../departures/seat-limit.js";
import { MAX_QUOTE_PAISE } from "./quotes.js";

const paise = z.int().min(0).max(MAX_QUOTE_PAISE);

export const roomTypes = ["single", "double", "triple", "quad", "child_bed", "child_no_bed"] as const;
export const roomType = z.enum(roomTypes);
export type RoomType = z.infer<typeof roomType>;

/** How many people share a room of this type; null for a child's place, which is not a room of its own. */
export const roomCapacity: Record<RoomType, number | null> = {
  single: 1,
  double: 2,
  triple: 3,
  quad: 4,
  child_bed: null,
  child_no_bed: null,
};

/** The price per person of each room type; null where the agency does not sell it. */
export const roomPrices = z.strictObject({
  single: paise.nullable(),
  double: paise.nullable(),
  triple: paise.nullable(),
  quad: paise.nullable(),
  child_bed: paise.nullable(),
  child_no_bed: paise.nullable(),
});
export type RoomPrices = z.infer<typeof roomPrices>;

/** How many people take rooms of one type. */
export const roomBooking = z.strictObject({ roomType, people: z.int().min(1).max(MAX_SEATS) });
export type RoomBooking = z.infer<typeof roomBooking>;
