// How the connectors bring a lead in: who can work leads and who the agency's Owner is (identity, asked before the
// transaction), then crm's one way in for a lead from outside, as the system.
import type { IncomingLead } from "@travel-crm/contracts/connectors";
import type { Database, OrgTx } from "@travel-crm/db";
import { addIncomingLead, type IncomingOrigin, type IntakeOutcome } from "../crm/index.js";
import { systemActor } from "../kernel/index.js";

/** What identity tells the connectors about an agency's people: names never, ids only. */
export interface IntakePeople {
  leadWorkerIds(organizationId: string): Promise<ReadonlySet<string>>;
  firstOwner(organizationId: string): Promise<string | null>;
}

export interface IntakeDependencies {
  db: Pick<Database, "forOrg">;
  people: IntakePeople;
}

/** The agency's lead workers and its Owner, to assign a lead; null when it has no Owner to fall back on. */
export async function intakeContextFor(people: IntakePeople, organizationId: string, now: Date) {
  const fallback = await people.firstOwner(organizationId);
  if (fallback === null) return null;
  return { workers: await people.leadWorkerIds(organizationId), fallback, now };
}

/** Brings one lead in, in the organization's own transaction (with whatever else `within` does there). */
export async function takeLead(
  dependencies: IntakeDependencies,
  organizationId: string,
  lead: IncomingLead,
  origin: IncomingOrigin,
  within?: (tx: OrgTx, outcome: IntakeOutcome) => Promise<void>,
): Promise<IntakeOutcome | null> {
  const context = await intakeContextFor(dependencies.people, organizationId, new Date());
  if (context === null) return null;
  return dependencies.db.forOrg(organizationId, async (tx) => {
    const outcome = await addIncomingLead(tx, systemActor(organizationId), lead, origin, context);
    if (within) await within(tx, outcome);
    return outcome;
  });
}
