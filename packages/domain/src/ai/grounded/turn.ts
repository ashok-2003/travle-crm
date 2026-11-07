// The grounded turn (plan 4): READ the chat into facts the customer's words back, LOOK UP the packages and build the card,
// WRITE a reply whose figures are placeholders, FILL and CHECK it, then ACT. Every model call is counted against the
// month's limit; a reply the check refuses twice is not sent and the team is told. The old agent hands over to this one
// for an agency that switched it on (`ai_autopilot.grounded`); nothing logged holds a customer's word.
import { type ReadAnswer } from "@travel-crm/contracts/ai";
import { DomainError } from "../../kernel/index.js";
import { openLeadOfChat } from "../../crm/index.js";
import type { ChatFacts } from "@travel-crm/contracts/ai";
import { allowedActions, chosenActions } from "./actions.js";
import { actOnReply } from "./act.js";
import { buildCard } from "./card.js";
import { lookUp } from "./lookup.js";
import { mergeFacts } from "./merge-facts.js";
import type { GroundedPack } from "./prompt.js";
import { readChat } from "./read.js";
import { countedCall, type CallEnvironment } from "./turn-calls.js";
import { flagChat, keepFacts, noteRepeat } from "./turn-flag.js";
import { prepareTurn, type Prepared } from "./turn-prepare.js";
import type { GroundedDependencies, TurnInput, TurnOutcome } from "./turn-types.js";
import { replyContext, writeChecked } from "./turn-write.js";

export type { GroundedDependencies, TurnInput, TurnOutcome };

/** A nudge or a follow-up reads nothing: the write step gets the stored facts and why it writes. */
const quiet: ReadAnswer = {
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

/** The customer's messages after the agency's last line: what this turn answers. */
const latestOf = (prepared: Prepared): string[] => {
  const after = prepared.transcript.map((line) => line.from).lastIndexOf("agency") + 1;
  return prepared.transcript.slice(after).flatMap((line) => (line.from === "customer" ? [line.text] : []));
};

const reasonFor = (input: TurnInput): string | undefined =>
  input.kind === "nudge"
    ? "they went quiet"
    : input.kind === "followUp"
      ? `this follow-up is due: ${input.followUp ?? ""}`
      : undefined;

export async function runGroundedTurn(deps: GroundedDependencies, input: TurnInput, now: Date): Promise<TurnOutcome> {
  const finish = (outcome: TurnOutcome, reason?: string): TurnOutcome => {
    deps.logger?.info(
      { event: "ai.turn", outcome, ...(reason === undefined ? {} : { reason }) },
      "The grounded AI turn ended",
    );
    return outcome;
  };
  const prepared = await prepareTurn(deps, input, now);
  if (typeof prepared === "string") return finish(prepared);
  const environment: CallEnvironment = {
    db: deps.db,
    organizationId: input.organizationId,
    now,
    timeZone: prepared.timeZone,
  };
  const block = async (outcome: "blocked" | "unfit", code: string, facts: ChatFacts | null) => {
    await flagChat(deps.db, {
      organizationId: input.organizationId,
      chat: prepared.chat,
      token: input.token,
      code,
      facts,
      now,
    });
    return finish(outcome, code);
  };

  // READ (replies only).
  let facts = prepared.facts;
  let read = quiet;
  let nearest: string[] = [];
  if (input.kind === "reply") {
    const asked = await countedCall(environment, () =>
      readChat(deps.ai, {
        transcript: prepared.transcript,
        destinations: prepared.keys.destinations,
        packages: prepared.keys.packages,
        facts,
        today: prepared.today,
        timeZone: prepared.timeZone,
      }),
    );
    if (!asked.ok) {
      if (asked.reason === "unfit") return block("unfit", "unfit", null);
      return finish(asked.reason);
    }
    read = asked.read;
    facts = mergeFacts(facts, read, prepared.keys);
    nearest = read.nearest.flatMap((key) => prepared.keys.packages.find((one) => one.key === key)?.id ?? []);
  }

  // LOOK UP and build the card.
  const looked = await deps.db.forOrg(input.organizationId, async (tx) => ({
    lookup: await lookUp(tx, facts, prepared.today, now, nearest),
    hasLead: (await openLeadOfChat(tx, prepared.chat.personId)) !== null,
  }));
  const card = buildCard(looked.lookup);
  const allowed = allowedActions(looked.lookup, facts, read, {
    natural: prepared.natural,
    hasLead: looked.hasLead,
    settings: prepared.settings,
    latest: latestOf(prepared),
    notRunBefore: prepared.facts.notRun,
    hasGstState: (prepared.supplierStateCode ?? "") !== "",
  });
  const pack: GroundedPack = packOf(prepared, input, card, allowed, read);

  // WRITE, FILL and CHECK.
  const written = await writeChecked(
    deps.ai,
    environment,
    {
      settings: prepared.settings,
      agency: await deps.agencyName(input.organizationId),
      kind: input.kind,
      pack,
      messages: prepared.messages,
    },
    card,
    replyContext(looked.lookup, prepared.destinationNames, facts),
    prepared.sent,
    reasonFor(input),
  );
  if (written.kind === "ended") {
    // Nothing usable came back (the model is down, the limit): the read still counts, so the next turn knows it.
    await keepFacts(deps.db, input.organizationId, prepared.chat.id, facts);
    return finish(written.outcome);
  }
  if (written.kind === "repeated") {
    await noteRepeat(deps.db, {
      organizationId: input.organizationId,
      chat: prepared.chat,
      token: input.token,
      facts,
      now,
    });
    // The old agent's outcome for this case.
    return finish("replied_flagged", "repeat");
  }
  if (written.kind === "blocked") return block("blocked", written.code, facts);

  // ACT.
  const chosen = chosenActions(written.actions, allowed);
  const actions =
    input.kind === "reply"
      ? chosen
      : { ...chosen, sendAgencyFiles: false, sendPayment: false, requestBooking: false, handOver: null, task: null };
  // Who to tell of a booking is asked before the transaction: the real lookup opens a transaction of its own, which would nest.
  const managers = actions.requestBooking ? await deps.managers(input.organizationId) : [];
  // The same for the plan's storage limit, which the files copied in the transaction are held to.
  const sendsFiles = actions.sendFiles.length > 0 || actions.sendAgencyFiles || actions.sendPayment;
  const storageLimitBytes =
    sendsFiles && deps.subscriptions !== undefined
      ? ((await deps.subscriptions.entitlementsOf(input.organizationId))?.limits.storageBytes ?? null)
      : null;
  try {
    const result = await deps.db.forOrg(input.organizationId, (tx) =>
      actOnReply(
        tx,
        {
          files: deps.files,
          recipients: () => Promise.resolve(managers),
          storageLimitBytes,
          supplierStateCode: prepared.supplierStateCode,
        },
        {
          organizationId: input.organizationId,
          conversationId: prepared.chat.id,
          token: input.token,
          text: written.text,
          actions,
          lookup: looked.lookup,
          facts,
          now,
          kind: input.kind,
          settings: prepared.settings,
          followUp: written.followUp,
        },
      ),
    );
    if (result === "already") return finish("answered");
    const outcome = result.handedOver ? "handed_off" : result.flagged ? "replied_flagged" : "replied";
    return finish(outcome, allowed.forcedFlag ?? (result.flagged ? "model" : undefined));
  } catch (error) {
    // A refusal (the seats went, the total changed, the window closed...) rolled the turn back: nothing was sent.
    if (error instanceof DomainError) return block("blocked", error.reason, facts);
    throw error;
  }
}

function packOf(
  prepared: Prepared,
  input: TurnInput,
  card: GroundedPack["card"],
  allowed: GroundedPack["allowed"],
  read: ReadAnswer,
): GroundedPack {
  return {
    knowledge: prepared.knowledge,
    learnings: prepared.learnings,
    voice: prepared.voice,
    natural: prepared.natural,
    instructions: prepared.instructions,
    facts: prepared.factsWords,
    calendar: prepared.calendar,
    dateChecks: prepared.dateChecks,
    followUp: input.followUp ?? null,
    card,
    allowed:
      input.kind === "reply"
        ? allowed
        : { ...allowed, sendAgencyFiles: false, sendPayment: false, requestBooking: false, task: false },
    wants: read.wants,
  };
}
