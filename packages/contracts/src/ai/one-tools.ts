// The one agent's tools as the model sees them: natural's fourteen, with book on the terms alone and hand_over open to
// b2b, each schema carrying its trip labels and its parse-only checks, and the parse that answers a refused call.
import { z } from "zod";
import { naturalHandOverReasons } from "./natural.js";
import {
  checked,
  handOverArguments,
  naturalReadTools,
  naturalToolNames,
  naturalTools,
  offerBookingArguments,
  parseOnTable,
  tool,
  withLabels,
  type NaturalToolName,
  type ToolEntry,
  type ToolTable,
} from "./natural-tools.js";

export const oneHandOverReasons = [...naturalHandOverReasons, "b2b"] as const;
export type OneHandOverReason = (typeof oneHandOverReasons)[number];

/** The terms alone: the booking takes the lead's or WhatsApp's name, and no words of the customer's are copied. */
export const oneBookArguments = offerBookingArguments;
export const oneHandOverArguments = z.strictObject({
  reason: z.enum(oneHandOverReasons),
  summary: handOverArguments.shape.summary,
});

/** One's brochure is picked by its label; natural's `send_brochure` keeps `trip_id`. */
export const oneSendBrochureArguments = z.strictObject({ brochure_id: z.string() });

const oneTools: ToolTable = {
  ...naturalTools,
  send_brochure: tool(
    "Sends one brochure, captioned with its name, and up to two of its trip's photos not sent before in this chat.",
    oneSendBrochureArguments,
  ),
  offer_booking: tool(
    "Records a booking offer on the chat and returns its terms, total and advance. The app sends the offer card with Book and Change buttons after your words.",
    offerBookingArguments,
  ),
  book: tool(
    "Holds the seats on the live offer's terms, or a total told, once the customer said yes. After your reply, the app sends the payment message and QR.",
    oneBookArguments,
  ),
  hand_over: tool(naturalTools.hand_over.description, oneHandOverArguments),
};

/** Offered only when the turn has trips (ruling 21), as natural's: these name a trip or read the sheets. */
const tripTools: readonly NaturalToolName[] = [
  "find_trips",
  "get_trip",
  "quote",
  "send_brochure",
  "offer_booking",
  "book",
];

export type OneMediaToolName = "transcribe_voice_note" | "look_at_image";
export type OneToolName = NaturalToolName | OneMediaToolName;
const mediaToolNames: readonly OneMediaToolName[] = ["transcribe_voice_note", "look_at_image"];
/** The tools that only read: the model is called again with their results. */
export const oneReadTools: readonly OneToolName[] = [...naturalReadTools, ...mediaToolNames];

/** `message` is a reference the chat shows (m3); the turn's own are the only ones offered. */
const mediaTable: Record<OneMediaToolName, ToolEntry> = {
  transcribe_voice_note: tool(
    "Hears what a customer's voice note says. Pass its reference, as [voice note m3] shows it, then answer it like a typed message.",
    z.strictObject({ message: z.string() }),
  ),
  look_at_image: tool(
    "Looks at a customer's photo, as [photo m7] shows it. You can pass a question about what to look for. Not for a sticker or a forward that needs no reply.",
    z.strictObject({ message: z.string(), question: z.string().min(1).max(200).optional() }),
  ),
};

export interface OneToolSchema {
  name: OneToolName;
  description: string;
  schema: z.ZodType<Record<string, unknown>>;
}

/** Natural's fourteen tools with book and hand_over replaced; trip tools left out with no labels (ruling 21), and send_brochure with no brochures. */
export function oneToolSchemas(input: {
  tripLabels: readonly string[];
  brochureLabels?: readonly string[];
  /** References of the turn's voice notes and photos; each tool is offered with one at least. */
  voiceNotes?: readonly string[];
  photos?: readonly string[];
}): OneToolSchema[] {
  const brochureLabels = input.brochureLabels ?? [];
  const { voiceNotes = [], photos = [] } = input;
  // A media tool is offered with the references of its own kind, and only when the turn has one.
  const media = mediaToolNames.flatMap((name): OneToolSchema[] => {
    const refs = name === "look_at_image" ? photos : voiceNotes;
    const { description, fields } = mediaTable[name];
    return refs.length === 0 ? [] : [{ name, description, schema: fields.extend({ message: z.enum(refs) }) }];
  });
  const natural: OneToolSchema[] = naturalToolNames
    .filter(
      (name) =>
        (input.tripLabels.length > 0 || !tripTools.includes(name)) &&
        (name !== "send_brochure" || brochureLabels.length > 0),
    )
    .map((name) => {
      const fields =
        name === "send_brochure"
          ? oneSendBrochureArguments.extend({ brochure_id: z.enum(brochureLabels) })
          : withLabels(oneTools[name].fields, input.tripLabels);
      return { name, description: oneTools[name].description, schema: checked(oneTools[name], fields) };
    });
  return [...natural, ...media];
}

/** As parseToolArguments, on one's table; `brochureLabels`, when given, are the brochures `send_brochure` may name. */
export function parseOneToolArguments(
  name: string,
  raw: string | Readonly<Record<string, unknown>>,
  tripLabels: readonly string[],
  more: { brochureLabels?: readonly string[]; voiceNotes?: readonly string[]; photos?: readonly string[] } = {},
): { ok: true; name: OneToolName; args: Record<string, unknown> } | { ok: false; problem: string } {
  const media = mediaToolNames.find((known) => known === name);
  if (media !== undefined) return parseMedia(media, raw, media === "look_at_image" ? more.photos : more.voiceNotes);
  const parsed = parseOnTable(oneTools, name, raw, tripLabels);
  const { brochureLabels } = more;
  if (parsed.ok && parsed.name === "send_brochure" && brochureLabels !== undefined) {
    const id = parsed.args.brochure_id;
    if (typeof id === "string" && !brochureLabels.includes(id)) {
      const listed =
        brochureLabels.length > 0 ? `the brochures are ${brochureLabels.join(", ")}` : "there are no brochures listed";
      return { ok: false, problem: `${id} isn't one of the brochures; ${listed}` };
    }
  }
  return parsed;
}

/** A media call's arguments, the reference checked against the turn's own (another chat's or a typo is refused). */
function parseMedia(
  name: OneMediaToolName,
  raw: string | Readonly<Record<string, unknown>>,
  refs: readonly string[] = [],
): { ok: true; name: OneToolName; args: Record<string, unknown> } | { ok: false; problem: string } {
  const parsed = parseOnTable(mediaTable, name, raw, []);
  const message = parsed.ok ? parsed.args.message : null;
  if (!parsed.ok || typeof message !== "string" || refs.includes(message)) return parsed;
  const kind = name === "look_at_image" ? "photos" : "voice notes";
  return {
    ok: false,
    problem: `${message} isn't one of this chat's ${kind}; ${refs.join(", ") || "there are none"}`,
  };
}
