// A live turn's ways to the data the one agent shares: the action context that checks and stages each action on the
// agency's data, and whether the customer wrote again since the turn began, which ends it for the newer turn.
import type { Database, OrgTx } from "@travel-crm/db";
import type { LiteTurnInput } from "../lite/types.js";
import type { NaturalPrepared } from "./prepare.js";
import type { ActionContext } from "./tools/action-tools.js";
import { quoteFor, type ReadContext } from "./tools/read-tools.js";
import type { NaturalChatLine } from "./types.js";

/**
 * Whether a customer line came after the one the turn answers: a reply's token is its message, the chat's newest when the
 * job began; a follow-up's silence ends with any line after the last one the turn read.
 */
export async function newerLineIn(db: Database, input: LiteTurnInput, lastInboundAt: Date): Promise<boolean> {
  const newest = await db.forOrg(input.organizationId, (tx) =>
    tx.whatsappMessage.findFirst({
      where: { conversationId: input.conversationId, direction: "in", revokedAt: null },
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
