// The write step of the turn: ask for the reply, fill its placeholders, check it; a reply the check refuses (or an answer
// that doesn't fit) is asked for once more with the reason, and refused twice it is blocked. Every ask is one counted call.
import { indianTravelPlaces, type WriteAnswer } from "@travel-crm/contracts/ai";
import type { AiModel } from "@travel-crm/integrations/ai";
import { cleanReply } from "../clean-reply.js";
import type { Card } from "./card.js";
import { checkReply, type ReplyContext } from "./check.js";
import { fillPlaceholders } from "./fill.js";
import type { Lookup } from "./lookup-types.js";
import { findWord } from "./phrase-match.js";
import { countedCall, type CallEnvironment } from "./turn-calls.js";
import { writeReply, type WriteInput } from "./write.js";

export type Written =
  | { kind: "ok"; text: string; actions: WriteAnswer["actions"] }
  | { kind: "blocked"; code: string }
  /** The turn ends with this outcome and nothing to flag: the limit, or the model being down. */
  | { kind: "ended"; outcome: string };

/** The check's context: the agency's places and the ones the card's package texts name. */
export function replyContext(lookup: Lookup, destinationNames: string[]): ReplyContext {
  const knownPlaces = [...new Set([...destinationNames, ...indianTravelPlaces])];
  const texts = lookup.packages
    .flatMap((one) => [
      one.name,
      one.title,
      one.destination ?? "",
      one.summary,
      ...one.highlights,
      one.inclusions,
      ...one.dayTitles,
      one.startCity,
      one.pickupPoints,
    ])
    .join("\n");
  return {
    knownPlaces,
    packagePlaces: knownPlaces.filter((place) => findWord(texts, place).length > 0),
    notRun: lookup.notRun,
    customTrips: lookup.customTrips,
  };
}

export async function writeChecked(
  ai: AiModel,
  environment: CallEnvironment,
  input: WriteInput,
  card: Card,
  context: ReplyContext,
  /** Why the reply is written at all (a nudge, a follow-up); kept on the second ask. */
  base?: string,
): Promise<Written> {
  let reason = base;
  let code: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const asked = await countedCall(environment, () => writeReply(ai, input, reason));
    if (!asked.ok) {
      if (asked.reason === "unfit") {
        code = "unfit";
        reason = [base, "unfit: your last answer did not fit the JSON shape asked for"].filter(Boolean).join(". ");
        continue;
      }
      // Having refused one reply, a second that cannot be asked for still leaves the customer waiting: tell the team.
      return code === null ? { kind: "ended", outcome: asked.reason } : { kind: "blocked", code };
    }
    const filled = fillPlaceholders(cleanReply(asked.value.reply, input.settings), card);
    if (filled.unknown.length > 0) {
      code = "unknown_placeholder";
      reason = [base, `unknown_placeholder: the card has no ${filled.unknown.join(", ")}; use only its placeholders`]
        .filter(Boolean)
        .join(". ");
      continue;
    }
    const verdict = checkReply(filled.text, filled.filled, context);
    if (verdict.ok) return { kind: "ok", text: filled.text, actions: asked.value.actions };
    code = verdict.reason;
    reason = [
      base,
      `The check refused your last reply (${verdict.reason}) near: ${verdict.excerpt}. Write it again: every amount, date and seat count only as a placeholder from the card, and nothing the check named.`,
    ]
      .filter(Boolean)
      .join(". ");
  }
  return { kind: "blocked", code: code ?? "unfit" };
}
