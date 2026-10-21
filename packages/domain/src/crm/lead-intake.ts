// A lead that arrives from outside (release D): a website form, a link another tool posts to, an API call, a Meta lead
// ad, an IndiaMART enquiry. One way in for all of them, the import's own save: a blocked contact is turned away, a
// known person's open lead gets a repeat enquiry, and a new lead is assigned by the agency's rules and mode, its owner
// told. The system acts, not a member.
import type { IncomingLead } from "@travel-crm/contracts/connectors";
import type { LeadSource, TripInput } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import type { Actor } from "../kernel/index.js";
import { isBlocked } from "./blocking.js";
import { saveEnquiry } from "./save-enquiry.js";

export interface IncomingOrigin {
  source: LeadSource;
  /** Where in it: the form's name, the campaign, the tool. */
  sourceDetail: string | null;
  /** When the lead was made there, if it says; now otherwise. */
  createdAt?: Date | null;
}

export interface IntakeContext {
  /** Who can work leads now (identity's lead workers). */
  workers: ReadonlySet<string>;
  /** Who gets a lead nothing else decides: the agency's Owner. */
  fallback: string;
  now: Date;
}

export type IntakeOutcome =
  { outcome: "created" | "added-to-open-lead"; leadId: string | null } | { outcome: "blocked"; leadId: null };

/** The trip a lead from outside describes: only what such a lead can say. */
function tripOf(lead: IncomingLead): TripInput {
  return {
    destination: lead.destination === undefined ? null : { kind: "new", name: lead.destination },
    when: lead.travelMonth === undefined ? { kind: "unknown" } : { kind: "month", month: lead.travelMonth },
    adults: lead.adults ?? null,
    childrenAges: [],
    budget: null,
    departureCity: null,
    tripType: null,
    hotelCategory: null,
    food: null,
    roomType: null,
  };
}

export async function addIncomingLead(
  tx: OrgTx,
  actor: Actor,
  lead: IncomingLead,
  origin: IncomingOrigin,
  context: IntakeContext,
): Promise<IntakeOutcome> {
  const contacts = {
    ...(lead.phone === undefined ? {} : { phone: lead.phone }),
    ...(lead.email === undefined ? {} : { email: lead.email }),
  };
  if (await isBlocked(tx, contacts)) return { outcome: "blocked", leadId: null };
  const saved = await saveEnquiry(
    tx,
    actor,
    {
      person: { name: lead.name, ...contacts },
      trip: tripOf(lead),
      note: lead.message ?? null,
      source: origin.source,
      sourceDetail: lead.sourceDetail ?? origin.sourceDetail,
    },
    context.now,
    {
      from: "import",
      ownerUserId: context.fallback,
      stage: "new",
      createdAt: origin.createdAt ?? null,
      notify: "each",
      assign: { workers: context.workers },
    },
  );
  return { outcome: saved.outcome, leadId: saved.leadId };
}
