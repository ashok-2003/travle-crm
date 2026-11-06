// The keys the read step is given (D<n> for a destination, S<n> for a sellable package) and the chat line it reads.
import type { CalendarDate } from "../../kernel/index.js";

/** A line of the chat: what the customer wrote, or what the agency (we) answered, which is never evidence. */
export interface ChatLine {
  from: "customer" | "agency";
  text: string;
}

export interface ReadKeys {
  destinations: { key: string; id: string; name: string }[];
  /** `destination` is the destination's name. */
  packages: { key: string; id: string; title: string; destination: string }[];
  /** Today in the agency's time zone: a date or month before it is not a start. */
  today: CalendarDate;
}
