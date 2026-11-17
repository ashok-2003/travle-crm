// The live natural turn's ways to the data, as Plan 1's loop asks for them (plan 2, Task 6): each model call counted
// against the month, each read tool and each action's checks in a transaction of its own on the agency's data, the
// guards on what this chat shows (what is paid or confirmed included), and whether the customer wrote again since the
// turn began, which ends it for the newer turn.
import type { Database, OrgTx } from "@travel-crm/db";
import type { LiteDependencies, LiteTurnInput } from "../lite/types.js";
import type { NaturalContext } from "./context/build.js";
import { countedModel } from "./counted-model.js";
import { checkWords } from "./guards/check-words.js";
import type { LoopIO } from "./loop.js";
import type { NaturalPrepared } from "./prepare.js";
import { stageAction, type ActionContext } from "./tools/action-tools.js";
import { quoteFor, type ReadContext } from "./tools/read-tools.js";
import { guardReads, readTools, type FlagContext } from "./turn-reads.js";
import type { NaturalChatLine } from "./types.js";

export interface LiveLoop {
  io: LoopIO;
  /** What the trace's flags read, updated in place as the turn reads a trip whole. */
  flagContext: FlagContext;
}

/**
 * Whether a customer line came after the one the turn answers: a reply's token is its message, the chat's newest when the
 * job began; a follow-up's silence ends with any line after the last one the turn read.
 */
export async function newerLineIn(db: Database, input: LiteTurnInput, lastInboundAt: Date): Promise<boolean> {
  const newest = await db.forOrg(input.organizationId, (tx) =>
    tx.whatsappMessage.findFirst({
      where: { conversationId: input.conversationId, direction: "in" },
      orderBy: { occurredAt: "desc" },
      select: { id: true, occurredAt: true },
    }),
  );
  if (newest === null) return false;
  return input.kind === "reply" ? newest.id !== input.token : newest.occurredAt > lastInboundAt;
}

/** What an action's staging and checks read in a live turn: the prepared chat, the labels and new lines the context made. */
export function liveActionContext(
  db: Database,
  prepared: NaturalPrepared,
  input: LiteTurnInput,
  turn: { labels: ReadonlyMap<string, string>; newLines: readonly NaturalChatLine[] },
  now: Date,
): Omit<ActionContext, "quotedThisTurn"> {
  const { organizationId, conversationId } = input;
  const { sheets, today, timeZone, booking } = prepared;
  const readContext = (tx: OrgTx): ReadContext => ({ tx, sheets, labels: turn.labels, today, now });
  return {
    sheets,
    labels: turn.labels,
    today,
    now,
    timeZone,
    facts: prepared.facts,
    lead: prepared.lead,
    lines: prepared.lines,
    newLines: turn.newLines,
    paymentReady: prepared.paymentReady,
    booking: booking === null ? null : { id: booking.id, awaitingPayment: booking.awaitingPayment },
    profileName: prepared.chat.profileName,
    quoteOf: (terms) => db.forOrg(organizationId, (tx) => quoteFor(readContext(tx), terms)),
    conversationId,
    typed: prepared.typed,
    lastInboundAt: prepared.lastInboundAt,
    adPackageId: prepared.adPackageId,
  };
}

/** The loop's IO for one live turn on `context`, the context built from `prepared`; `clock` in epoch milliseconds. */
export function liveLoopIO(
  deps: Pick<LiteDependencies, "db" | "ai">,
  prepared: NaturalPrepared,
  input: LiteTurnInput,
  context: NaturalContext,
  now: Date,
  clock: () => number,
): LiveLoop {
  const { db } = deps;
  const { organizationId } = input;
  const { sheets, today, timeZone, booking } = prepared;
  const reads = guardReads(prepared, context.shown, prepared.facts, now, {
    paymentConfirmed: booking?.paymentConfirmed ?? false,
    bookingConfirmed: booking?.confirmed ?? false,
  });
  const readContext = (tx: OrgTx): ReadContext => ({ tx, sheets, labels: context.labels, today, now });
  const actions = liveActionContext(db, prepared, input, context, now);
  const io: LoopIO = {
    call: countedModel(deps.ai, { db, organizationId, now, timeZone }),
    read: readTools(db, organizationId, readContext, reads),
    stage: (name, args, words, quoted) => stageAction({ ...actions, quotedThisTurn: quoted }, name, args, words),
    check: (words, staged, quoted) => checkWords(words, reads.context(staged, quoted)),
    newerLine: () => newerLineIn(db, input, prepared.lastInboundAt),
    clock,
  };
  return { io, flagContext: reads.flagContext };
}
