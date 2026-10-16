// Adding a lead by hand (spec 3.2, 4): a new person or a known one, a repeat enquiry on their open lead or a new trip,
// and the owner the form names. Release 1's Task C2 builds it.
import type { CreatedLead, CreateLeadInput } from "@travel-crm/contracts/crm";
import type { Database } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";

/**
 * Adds the lead, or the enquiry to the person's open lead. Takes the database, not a transaction: a save that races
 * another for the same new contact reruns once in a new transaction (R23). `owners` are the lead workers (R14).
 */
export const createLead: (
  database: Database,
  access: MemberAccess,
  input: CreateLeadInput,
  context: { owners: ReadonlySet<string>; now: Date },
) => Promise<CreatedLead> = () => {
  throw new Error("Not built yet: release 1 plan, Task C2");
};
