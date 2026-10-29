// What crm records in the audit log (spec 4: every change staff make), as one list of actions by record kind: every
// crm change records through recordCrmAudit, so audit.json's sentences and what the module writes stay one list (the
// web app's audit words test reads these unions). Snapshots never hold note text, task titles or a blocked contact's
// value; a person's contacts appear only in person.* entries, which erasure redacts (R28).
import type { OrgTx } from "@travel-crm/db";
import { recordAudit, type AuditSnapshot } from "../audit/index.js";
import type { Actor } from "../kernel/index.js";

interface PersonChange {
  entityType: "person";
  action: "person.added" | "person.edited" | "person.consent-recorded" | "person.consent-withdrawn";
}

/** A lead added, or something added to it. */
interface LeadAddition {
  entityType: "lead";
  action:
    | "lead.added"
    | "lead.repeat-enquiry"
    | "lead.note-added"
    | "lead.call-logged"
    | "lead.call-edited"
    | "lead.call-deleted";
}

/** A change to the lead itself. */
interface LeadChange {
  entityType: "lead";
  action: "lead.stage-changed" | "lead.reopened" | "lead.reassigned" | "lead.trip-edited";
}

interface BlockedContactChange {
  entityType: "blocked_contact";
  action: "blocked-contact.added" | "blocked-contact.removed";
}

export type CrmAuditChange = (PersonChange | LeadAddition | LeadChange | BlockedContactChange) & {
  entityId: string;
  before?: AuditSnapshot | null;
  after?: AuditSnapshot | null;
};

/** Records one crm change in the caller's transaction. */
export async function recordCrmAudit(tx: OrgTx, actor: Actor, change: CrmAuditChange): Promise<void> {
  await recordAudit(tx, actor, change);
}
