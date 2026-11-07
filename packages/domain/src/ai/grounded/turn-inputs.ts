// What the grounded turn works out from its input before and between its steps: the empty read of a nudge, why it
// writes, the messages it answers, and whether a place it can't check sends the chat to a person.
import type { ChatFacts, ReadAnswer } from "@travel-crm/contracts/ai";
import { inAnotherScript } from "./phrase-match.js";
import type { Prepared } from "./turn-prepare.js";
import type { TurnInput } from "./turn-types.js";

/** A nudge or a follow-up reads nothing: the write step gets the stored facts and why it writes. */
export const quiet: ReadAnswer = {
  places: [],
  startsOn: null,
  rooms: [],
  travellers: null,
  budgetRupees: null,
  pickupCity: null,
  chosen: null,
  wants: "information",
  wantsEvidence: "",
  special: null,
  nearest: [],
};

/** Whether the read names a place not run, in a script other than Latin, that the chat's facts didn't hold before. */
export const newNotRunInAnotherScript = (read: ReadAnswer, before: ChatFacts): boolean =>
  read.places.some(
    (place) =>
      place.destination === "none" &&
      inAnotherScript(place.words) &&
      !before.notRun.some((seen) => seen.trim().toLowerCase() === place.words.trim().toLowerCase()),
  );

/** Who and what a flag of this turn is about. */
export const flagOf = (input: TurnInput, prepared: Prepared, now: Date) => ({
  organizationId: input.organizationId,
  chat: prepared.chat,
  token: input.token,
  now,
});

/** The customer's messages after the agency's last line: what this turn answers. */
export const latestOf = (prepared: Prepared): string[] => {
  const after = prepared.transcript.map((line) => line.from).lastIndexOf("agency") + 1;
  return prepared.transcript.slice(after).flatMap((line) => (line.from === "customer" ? [line.text] : []));
};

/** Why a reply is written at all when it answers no message: a nudge or a follow-up that came due. */
export const reasonFor = (input: TurnInput): string | undefined =>
  input.kind === "nudge"
    ? "they went quiet"
    : input.kind === "followUp"
      ? `this follow-up is due: ${input.followUp ?? ""}`
      : undefined;
