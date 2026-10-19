// Adding a lead by hand (spec 3.2, 4): a new person or a known one, a repeat enquiry on their open lead or a new trip
// marked returning, and the owner the form names (R14). The form must choose before anything goes on an open lead
// (R24); the save itself is saveEnquiry's, shared with the import.
import type { CreatedLead, CreateLeadInput } from "@travel-crm/contracts/crm";
import { isUniqueViolation, type Database, type OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { isLeadInScope } from "./lead-detail.js";
import { saveEnquiry } from "./save-enquiry.js";

/**
 * Adds the lead, or the enquiry to the person's open lead. Takes the database, not a transaction: a save that races
 * another for the same new contact reruns once in a new transaction (R23), where it finds the person the other save
 * added and asks about their open lead. `owners` are the lead workers (R14), needed only for another owner.
 */
export async function createLead(
  database: Database,
  access: MemberAccess,
  input: CreateLeadInput,
  context: { owners: ReadonlySet<string>; now: Date },
): Promise<CreatedLead> {
  const ownerUserId = input.ownerUserId ?? access.userId;
  if (ownerUserId !== access.userId) {
    if (!access.permissions.has("leads:assign")) {
      throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Requires leads:assign");
    }
    if (!context.owners.has(ownerUserId)) {
      throw new DomainError("VALIDATION", "NOT_A_LEAD_WORKER", "That person can't work leads");
    }
  }
  const save = () =>
    database.forOrg(access.organizationId, (tx) => saveLead(tx, access, input, ownerUserId, context.now));
  try {
    return await save();
  } catch (error) {
    // Postgres aborted the transaction on the duplicate contact, so the second look needs a transaction of its own.
    if (!isUniqueViolation(error)) throw error;
    return save();
  }
}

async function saveLead(
  tx: OrgTx,
  access: MemberAccess,
  input: CreateLeadInput,
  ownerUserId: string,
  now: Date,
): Promise<CreatedLead> {
  const saved = await saveEnquiry(tx, access, input, now, {
    from: "form",
    ownerUserId,
    whenOpenLead: input.whenOpenLead,
  });
  // A lead the person can't see is never named to them (R24).
  return {
    outcome: saved.outcome,
    leadId: isLeadInScope(access, saved.leadOwnerUserId) ? saved.leadId : null,
    returning: saved.returning,
  };
}
