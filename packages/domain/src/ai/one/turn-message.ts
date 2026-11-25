// The one agent's last message each turn: the app's notice for this turn, then the customer's new words, each stamped
// with its year, so the model reads the time from them (no clock block: the owner, 2026-11-24). With no new words (a
// follow-up), the time alone.
import { calendarDateIn, formatShortDay, type CalendarDate } from "../../kernel/index.js";
import { clockWords } from "../lite/context/messages.js";
import { lineWords } from "../natural/context/chat-turns.js";
import { isText } from "../natural/trips/trip-text.js";
import type { NaturalChatLine } from "../natural/types.js";

export interface TurnMessageInput {
  now: Date;
  today: CalendarDate;
  timeZone: string;
  notice: string | null;
  newLines: readonly NaturalChatLine[];
}

/** "Tue 24 Nov 2026, 9:55 pm" on the agency's clock: the year always, since nothing else in the call gives it. */
function stampWithYear(at: Date, clock: Pick<TurnMessageInput, "today" | "timeZone">): string {
  const day = calendarDateIn(at, clock.timeZone);
  const year = day.slice(0, 4);
  const words = formatShortDay(day, clock.today);
  return `${year === clock.today.slice(0, 4) ? `${words} ${year}` : words}, ${clockWords(at, clock.timeZone)}`;
}

export function turnMessage(input: TurnMessageInput): string {
  const said = input.newLines.map(
    (line) => `[${stampWithYear(line.at, input)}] ${lineWords(line, Number.POSITIVE_INFINITY)}`,
  );
  return [
    said.length === 0 ? `Now: ${stampWithYear(input.now, input)}.` : null,
    input.notice,
    ...(said.length === 0 ? [] : ["New messages:", ...said]),
  ]
    .filter(isText)
    .join("\n");
}
