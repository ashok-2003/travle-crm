// The lite turn's steps after Understand: look up and decide in one transaction, have the move written, and act. Decide
// settles facts the lookups could not know (the ad's package, the departure on the day the customer gave), so the
// situation is read again for them and decided again; else a day picked this turn would be priced only "from", and
// "book" would find no total to hold.
import type { Database } from "@travel-crm/db";
import type { AiModel } from "@travel-crm/integrations/ai";
import { DomainError } from "../../kernel/index.js";
import type { CallEnvironment } from "../grounded/turn-calls.js";
import { actOnMove, type LiteActInput, type LiteActResult } from "./act.js";
import { decide, type DecideInput } from "./decide/decide.js";
import { situationOf, type LookupContext } from "./lookups/situation.js";
import type { LitePrepared } from "./prepare.js";
import { writeRequest } from "./prompts/write-prompt.js";
import { withoutMessages } from "./turn-trace.js";
import type { Decision, LiteDependencies, LookupRequest, Move, PackageIndexEntry, Situation } from "./types.js";
import { liteReplyContext, writeMove, writeMoveOf, type LiteWritten } from "./write.js";

/** A package and a departure settled after the first read take at most two more: the ad's package, then its day's departure. */
const MORE_READS = 2;

export async function decided(
  db: Database,
  organizationId: string,
  base: Omit<DecideInput, "situation">,
  context: LookupContext,
  requests: LookupRequest[],
): Promise<{ situation: Situation; decision: Decision }> {
  return db.forOrg(organizationId, async (tx) => {
    let read = context.facts;
    let situation = await situationOf(tx, context, requests);
    let decision = decide({ ...base, situation });
    for (let round = 0; round < MORE_READS; round += 1) {
      const { packageId, departureId } = decision.facts;
      const newPackage = packageId !== null && packageId !== read.packageId;
      const newDeparture = departureId !== null && departureId !== read.departureId;
      if (!newPackage && !newDeparture) break;
      read = { ...read, packageId, departureId };
      // The lookups the model asked for stand: only the chosen package and its price are read again.
      situation = { ...(await situationOf(tx, { ...context, facts: read }, [])), looked: situation.looked };
      decision = decide({ ...base, situation });
    }
    return { situation, decision };
  });
}

/** The index entries a move names by title, whose places the reply may say. */
const shownBy = (move: Move, index: readonly PackageIndexEntry[]): PackageIndexEntry[] =>
  "packageIds" in move ? index.filter((entry) => move.packageIds.includes(entry.id)) : [];

/**
 * The model's words for the move, checked, or null when the move needs none (code writes it all, or nothing is sent).
 * The blocks of its first ask go to the trace.
 */
export async function written(
  ai: AiModel,
  environment: CallEnvironment,
  prepared: Pick<LitePrepared, "basics" | "index" | "today" | "answers" | "messages" | "timeZone" | "places" | "sent">,
  step: { decision: Decision; situation: Situation; agencyName: string; summary: string },
): Promise<{ written: LiteWritten; blocks: Record<string, string> } | null> {
  const { decision, situation, agencyName } = step;
  const { basics, index, today } = prepared;
  const move = writeMoveOf(
    decision.move,
    situation,
    decision.facts,
    { agencyName, agentName: basics.agentName, answers: prepared.answers },
    today,
    index,
  );
  if (move === null) return null;
  const prompt = {
    agentName: basics.agentName,
    agencyName,
    tone: basics.tone,
    summary: step.summary,
    messages: prepared.messages,
    language: decision.facts.language,
    timeZone: prepared.timeZone,
    today,
  };
  const { blocks } = writeRequest({
    ...prompt,
    instruction: move.instruction,
    facts: move.blanks.lines(),
    looked: move.looked,
    correction: null,
  });
  const context = liteReplyContext(situation, decision.facts, prepared.places.known, shownBy(decision.move, index));
  return {
    written: await writeMove(ai, environment, prompt, move, context, prepared.sent),
    blocks: withoutMessages(blocks),
  };
}

/**
 * ACT in one transaction. Who to tell of a booking and the plan's storage limit are read before it opens: each is a
 * read of its own, which would nest. A refusal rolled everything back and comes back as its reason: nothing was sent.
 */
export async function acted(
  deps: LiteDependencies,
  supplierStateCode: string | null,
  act: LiteActInput,
): Promise<LiteActResult | { refused: string }> {
  const { move, note } = act.decision;
  const money = move.kind === "book" || move.kind === "resend_payment";
  const managers = money ? await deps.managers(act.organizationId) : [];
  const storageLimitBytes =
    (money || note === "package_picked") && deps.subscriptions !== undefined
      ? ((await deps.subscriptions.entitlementsOf(act.organizationId))?.limits.storageBytes ?? null)
      : null;
  try {
    return await deps.db.forOrg(act.organizationId, (tx) =>
      actOnMove(
        tx,
        { files: deps.files, recipients: () => Promise.resolve(managers), storageLimitBytes, supplierStateCode },
        act,
      ),
    );
  } catch (error) {
    if (error instanceof DomainError) return { refused: error.reason };
    throw error;
  }
}
