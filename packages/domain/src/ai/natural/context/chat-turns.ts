// The chat as real turns (spec 4.3): the customer's lines as user messages with a short time, everyone else's as
// assistant messages with who wrote them, the newest that fit the budget, and which customer lines this turn answers.
import { withoutAmountsAndDates } from "@travel-crm/contracts/ai";
import type { AiMessage } from "@travel-crm/integrations/ai";
import { calendarDateIn, formatShortDay, type CalendarDate } from "../../../kernel/index.js";
import { newestThatFit, oneLine } from "../../lite/context/blocks.js";
import { clockWords } from "../../lite/context/messages.js";
import type { NaturalChatLine } from "../types.js";
import { cutText, NATURAL_BUDGETS } from "./tokens.js";

export const CHAT_LINES = 40;
export const CHAT_DAYS = 14;
export const CHAT_MIN_LINES = 6;
export const LINE_CUT = 1_000;
const DAY_MS = 86_400_000;

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
 * What a line says on one line, fenced, cut past `most` characters: a past action in brackets, media as a marker, an
 * earlier assistant's figures out (unless `earlierWhole`).
 */
export function lineWords(line: NaturalChatLine, most: number, options: { earlierWhole?: boolean } = {}): string {
  if (line.action !== undefined) return `[${oneLine(line.action)}]`;
  const text = cutText(
    oneLine(line.from === "earlier" && options.earlierWhole !== true ? withoutAmountsAndDates(line.text) : line.text),
    most,
  );
  const marker =
    line.mayBePayment === true
      ? "[payment screenshot]"
      : line.kind === "document"
        ? line.fileName === undefined
          ? "[file]"
          : `[file: ${oneLine(line.fileName)}]`
        : line.kind === "text" || line.kind === "template"
          ? null
          : (markers[line.kind] ?? "[message]");
  if (marker === null) return text === "" ? "[message]" : text;
  return text === "" ? marker : `${marker} ${text}`;
}

const customerLine = (line: NaturalChatLine, clock: Omit<ChatClock, "now">, most: number) =>
  `[${stampOf(line.at, clock)}] ${lineWords(line, most)}`;

/** A new line as the turn block lists it: whole, since these are the words this turn answers. */
export const newLineWords = (line: NaturalChatLine, clock: Omit<ChatClock, "now">) =>
  customerLine(line, clock, Number.POSITIVE_INFINITY);

function writtenLine(line: NaturalChatLine, clock: ChatClock): string {
  if (line.from === "customer") return customerLine(line, clock, LINE_CUT);
  const words = lineWords(line, LINE_CUT);
  if (line.from === "team") {
    const name = line.teamName === undefined || line.teamName.trim() === "" ? "" : `, ${oneLine(line.teamName)}`;
    return `(Team${name}) ${words}`;
  }
  if (line.from === "earlier") return `[earlier assistant] ${words}`;
  if (line.from === "automatic") return `[automatic] ${words}`;
  return words;
}

/** The last 40 lines, none older than 14 days unless fewer than 6 remain. */
function windowOf(lines: readonly NaturalChatLine[], now: Date): readonly NaturalChatLine[] {
  const last = lines.slice(-CHAT_LINES);
  const since = now.getTime() - CHAT_DAYS * DAY_MS;
  const recent = last.filter((line) => line.at.getTime() >= since);
  return recent.length >= CHAT_MIN_LINES ? recent : last.slice(-CHAT_MIN_LINES);
}

/**
 * The chat before the new lines as user and assistant messages (lines of one role in a row join, one per line), and
 * the lines it shows, which are all the model reads of the chat before them.
 */
export function chatTurns(
  lines: readonly NaturalChatLine[],
  clock: ChatClock,
): { messages: AiMessage[]; shown: NaturalChatLine[] } {
  const written = windowOf(lines, clock.now).map((line) => ({ line, text: writtenLine(line, clock) }));
  // The budget in characters, at estimateTokens' four a token.
  const fit = newestThatFit(
    written.map((one) => one.text),
    NATURAL_BUDGETS.chat * 4,
  );
  const kept = written.slice(written.length - fit);
  const messages: AiMessage[] = [];
  for (const { line, text } of kept) {
    const role = line.from === "customer" ? "user" : "assistant";
    const last = messages.at(-1);
    if (last?.role === role) last.content = `${last.content}\n${text}`;
    else messages.push({ role, content: text });
  }
  return { messages, shown: kept.map((one) => one.line) };
}
