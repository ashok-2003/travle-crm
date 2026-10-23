// Saving one lead Meta gave us (M7 step 5, M8, 8.2): in one transaction, the ledger row is held, a lead already settled is
// left alone, the lead goes through the one save path, and the outcome and the Page's counters are written with it, so a
// lead is either saved and marked or not saved and pending (the catch-up retries pending rows).
import type { OrgTx } from "@travel-crm/db";
import type { Database } from "@travel-crm/db";
import type { MetaLead } from "@travel-crm/integrations/meta-graph";
import { calendarDateIn, systemActor } from "../../kernel/index.js";
import {
  holdLedger,
  isSettled,
  writeOutcome,
  type MetaFormRow,
  type MetaPageRow,
  type QuestionMatch,
} from "../../meta-leads/index.js";
import type { AgencyFacts } from "./agency-facts.js";
import { receiveMetaLead, type MetaLeadOutcome } from "./receive-meta-lead.js";

export interface SaveContext {
  page: MetaPageRow;
  form: Pick<MetaFormRow, "formId" | "formName">;
  matches: readonly QuestionMatch[];
  agency: AgencyFacts;
  notify: "each" | "none";
}

export type SavedFetchedLead =
  | { kind: "settled" }
  | { kind: "saved"; status: "added" | "merged"; ownerUserId: string | null }
  | { kind: "not_added" };

/** Saves the lead in the caller's transaction. */
export async function saveFetchedLeadIn(
  tx: OrgTx,
  context: SaveContext,
  lead: MetaLead,
  now: Date,
): Promise<SavedFetchedLead> {
  const row = await holdLedger(tx, { metaLeadId: lead.id, formId: context.form.formId, now });
  if (isSettled(row)) return { kind: "settled" };
  const outcome: MetaLeadOutcome = await receiveMetaLead(
    tx,
    systemActor(context.page.organizationId),
    // A time in the future (a clock that runs ahead) is the lead's arrival instead.
    { ...lead, createdAt: lead.createdAt > now ? now : lead.createdAt },
    context.matches,
    {
      formId: context.form.formId,
      formName: context.form.formName,
      ownerUserId: context.agency.ownerUserId,
      workers: context.agency.workers,
      today: calendarDateIn(now, context.agency.timeZone),
      timeZone: context.agency.timeZone,
      notify: context.notify,
    },
    now,
  );
  const facts = { createdAtMeta: lead.createdAt, platform: lead.platform, now };
  if (outcome.kind === "not_added") {
    await writeOutcome(
      tx,
      row,
      { status: "not_added", reasons: outcome.reasons, exampleName: outcome.exampleName },
      facts,
    );
    return { kind: "not_added" };
  }
  await writeOutcome(tx, row, { status: outcome.status, leadId: outcome.leadId, personId: outcome.personId }, facts);
  await tx.metaPage.update({
    where: { id: context.page.id },
    data: outcome.status === "added" ? { leadsAdded: { increment: 1 } } : { leadsMerged: { increment: 1 } },
  });
  return { kind: "saved", status: outcome.status, ownerUserId: outcome.ownerUserId };
}

/** The same in a transaction of its own. */
export function saveFetchedLead(
  db: Database,
  context: SaveContext,
  lead: MetaLead,
  now: Date,
): Promise<SavedFetchedLead> {
  return db.forOrg(context.page.organizationId, (tx) => saveFetchedLeadIn(tx, context, lead, now));
}
