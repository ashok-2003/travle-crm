// The chat as the model reads it: one line per message, who said it and when, the customer's words fenced as data.
import { calendarDateIn, formatShortDay, type CalendarDate } from "../../../kernel/index.js";
import { fenced } from "../../fenced.js";
import { AI_TOKEN_PREFIX } from "../../may-write.js";
import type { ContextMessage } from "../types.js";

const LINE_TEXT = 200;
const who = { customer: "Customer", you: "You", team: "Team" } as const;
const markers: Record<string, string> = {
  image: "[photo]",
  video: "[video]",
  audio: "[voice note]",
  document: "[file]",
  sticker: "[sticker]",
  location: "[location]",
};

/** The time on a clock as people say it: "3:40 pm", "9 am". */
export function clockWords(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(at);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0") % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "am" : "pm";
  return minute === 0
    ? `${String(twelve)} ${suffix}`
    : `${String(twelve)}:${String(minute).padStart(2, "0")} ${suffix}`;
}

const cut = (text: string): string => (text.length > LINE_TEXT ? `${text.slice(0, LINE_TEXT)}…` : text);

function saidBy(message: ContextMessage): string {
  const text = cut(message.text.replace(/\s+/g, " ").trim());
  const words = message.from === "customer" ? `<<${fenced(text)}>>` : fenced(text);
  if (message.kind === "text" || message.kind === "template") return text === "" ? "[message]" : words;
  const marker = markers[message.kind] ?? "[message]";
  return text === "" ? marker : `${marker} ${words}`;
}

/** One line for each message, oldest first as given. */
export function messageLines(messages: ContextMessage[], timeZone: string, today: CalendarDate): string[] {
  return messages.map((message) => {
    const day = formatShortDay(calendarDateIn(message.at, timeZone), today);
    return `${who[message.from]} (${day}, ${clockWords(message.at, timeZone)}): ${saidBy(message)}`;
  });
}

/** The columns of a stored message that `contextMessageOf` reads. */
export const storedMessageFields = {
  id: true,
  direction: true,
  kind: true,
  body: true,
  caption: true,
  clientToken: true,
  occurredAt: true,
} as const;

/** Who wrote it (the customer, this AI by its "ai:" token, or the team) and its words, as the prompts read them. */
export function contextMessageOf(row: {
  id: string;
  direction: string;
  kind: string;
  body: string | null;
  caption: string | null;
  clientToken: string | null;
  occurredAt: Date;
}): ContextMessage {
  return {
    id: row.id,
    from:
      row.direction === "in" ? "customer" : (row.clientToken?.startsWith(AI_TOKEN_PREFIX) ?? false) ? "you" : "team",
    at: row.occurredAt,
    kind: row.kind,
    text: row.body ?? row.caption ?? "",
  };
}
