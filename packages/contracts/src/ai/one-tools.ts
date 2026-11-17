// The one agent's tools as the model sees them: natural's fourteen, with book on the terms alone and hand_over open to
// b2b, each schema carrying its trip labels and its parse-only checks, and the parse that answers a refused call.
import { z } from "zod";
import { naturalHandOverReasons } from "./natural.js";
import {
  checked,
  handOverArguments,
  naturalToolNames,
  naturalTools,
  offerBookingArguments,
  parseOnTable,
  tool,
  withLabels,
  type NaturalToolName,
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

export interface OneToolSchema {
  name: NaturalToolName;
  description: string;
  schema: z.ZodType<Record<string, unknown>>;
}

/** Natural's fourteen tools with book and hand_over replaced; trip tools left out with no labels (ruling 21), and send_brochure with no brochures. */
export function oneToolSchemas(input: {
  tripLabels: readonly string[];
  brochureLabels?: readonly string[];
}): OneToolSchema[] {
  const brochureLabels = input.brochureLabels ?? [];
  return naturalToolNames
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
}

/** As parseToolArguments, on one's table; `brochureLabels`, when given, are the brochures `send_brochure` may name. */
export function parseOneToolArguments(
  name: string,
  raw: string | Readonly<Record<string, unknown>>,
  tripLabels: readonly string[],
  more: { brochureLabels?: readonly string[] } = {},
): { ok: true; name: NaturalToolName; args: Record<string, unknown> } | { ok: false; problem: string } {
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
