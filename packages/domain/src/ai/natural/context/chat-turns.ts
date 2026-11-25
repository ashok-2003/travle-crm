// The chat's lines as the model reads them (spec 4.3): which customer lines this turn answers, a line's short time, and
// a line's words, cut and fenced.
import { withoutAmountsAndDates } from "@travel-crm/contracts/ai";
import { calendarDateIn, formatShortDay, type CalendarDate } from "../../../kernel/index.js";
import { oneLine } from "../../lite/context/blocks.js";
import { clockWords } from "../../lite/context/messages.js";
import type { NaturalChatLine } from "../types.js";
import { cutText } from "./tokens.js";

export interface ChatClock {
  now: Date;
  today: CalendarDate;
  timeZone: string;
}

const markers: Partial<Record<string, string>> = {
  image: "[photo]",
  video: "[video]",
  audio: "[voice note]",
  sticker: "[sticker]",
  location: "[location]",
};

/**
 * The customer's lines after our last message (an automatic line doesn't end their burst) and after the last turn
 * that ran, so a line or a photo an earlier turn saw is old.
 */
export function newLinesOf(lines: readonly NaturalChatLine[], lastTurnAt: Date | null): NaturalChatLine[] {
  const ours = lines.findLastIndex((line) => line.from !== "customer" && line.from !== "automatic");
  return lines
    .slice(ours + 1)
    .filter((line) => line.from === "customer" && (lastTurnAt === null || line.at.getTime() > lastTurnAt.getTime()));
}

/** "Tue 10 Nov, 1:04 am" on the agency's clock, so a four-day gap or a 1 am message shows. */
export const stampOf = (at: Date, clock: Omit<ChatClock, "now">) =>
  `${formatShortDay(calendarDateIn(at, clock.timeZone), clock.today)}, ${clockWords(at, clock.timeZone)}`;

/**
 * What a line says on one line, fenced, cut past `most` characters: a past action in brackets, media or a pick from the
 * trip menu as a marker, an earlier assistant's figures out (unless `earlierWhole`).
 */
export function lineWords(line: NaturalChatLine, most: number, options: { earlierWhole?: boolean } = {}): string {
  if (line.action !== undefined) return `[${oneLine(line.action)}]`;
  const text = cutText(
    oneLine(line.from === "earlier" && options.earlierWhole !== true ? withoutAmountsAndDates(line.text) : line.text),
    most,
  );
  // The one agent's reference names the file, so the model can ask for it, before a payment guess.
  const named = line.ref === undefined ? null : `[${line.kind === "audio" ? "voice note" : "photo"} ${line.ref}]`;
  const marker =
    named ??
    (line.mayBePayment === true
      ? "[payment screenshot]"
      : line.kind === "document"
        ? line.fileName === undefined
          ? "[file]"
          : `[file: ${oneLine(line.fileName)}]`
        : line.kind === "text" || line.kind === "template"
          ? line.fromMenu === true
            ? "[picked from the trip menu]"
            : null
          : (markers[line.kind] ?? "[message]"));
  const said =
    // Only the one agent names a file (ref) and so reads what was heard or seen; natural's words stay as they were. A
    // PDF has no reference (no tool reads it), but its words are kept as it arrives (read-on-arrival.ts).
    line.aiText === undefined || (line.ref === undefined && line.kind !== "document")
      ? ""
      : ` (${line.aiText.kind === "transcript" ? "heard" : "seen"}: "${oneLine(line.aiText.text)}")`;
  if (marker === null) return text === "" ? "[message]" : text;
  return `${text === "" ? marker : `${marker} ${text}`}${said}`;
}
