// A Meta lead becomes a lead (spec M9-M11): the form's questions are the columns of a row, so the lead import's own reading
// makes the enquiry (names, phones, trips, the note), and the one save path, saveEnquiry, finds the person by phone, then
// email, then Instagram handle, adds to their open lead as a repeat enquiry or makes a new lead (returning when they are
// known), assigns it by the agency's rules, and tells the owner. Source `meta_lead_ad`, detail "<form> · Facebook" or
// "· Instagram". The caller owns the transaction and writes the ledger in it.
import type { MetaProblemReason } from "@travel-crm/contracts/meta-leads";
import type { OrgTx } from "@travel-crm/db";
import type { MetaLead } from "@travel-crm/integrations/meta-graph";
import type { Actor, CalendarDate } from "../../kernel/index.js";
import { leadAsRow, type QuestionMatch } from "../../meta-leads/index.js";
import { isBlocked } from "../blocking.js";
import { readLeadRow } from "../lead-import/lead-row.js";
import type { ColumnMatches } from "../../imports/index.js";
import { saveEnquiry } from "../save-enquiry.js";

export interface MetaLeadContext {
  /** Meta's id for the form, kept in the audit entries with the lead's. */
  formId: string;
  formName: string;
  /** The agency Owner: the fallback owner when the agency's rules and mode choose no one (release 4). */
  ownerUserId: string;
  /** Everyone who can work leads: the assignment chooses among them. */
  workers: ReadonlySet<string>;
  today: CalendarDate;
  timeZone: string;
  /** "none" when the owner is told by one summary of the catch-up instead (spec 11). */
  notify: "each" | "none";
}

export type MetaLeadOutcome =
  | {
      kind: "saved";
      status: "added" | "merged";
      leadId: string;
      personId: string;
      /** The owner of the lead the enquiry is on. */
      ownerUserId: string | null;
    }
  | { kind: "not_added"; reasons: MetaProblemReason[]; exampleName: string | null };

const platformWords = { facebook: "Facebook", instagram: "Instagram" } as const;

/** "<form> · Facebook" or "· Instagram"; the form's name alone for any other platform (M9). */
export function sourceDetailOf(formName: string, platform: MetaLead["platform"]): string {
  return platform === "other" ? formName : `${formName} · ${platformWords[platform]}`;
}

function columnMatchesOf(fieldAt: ReadonlyMap<number, string>): ColumnMatches {
  const fieldOf = new Map(fieldAt) as ColumnMatches["fieldOf"];
  return {
    fieldOf,
    positionsOf: (field) => [...fieldOf].filter(([, matched]) => matched === field).map(([position]) => position),
  };
}

/** The import's reasons as the ledger's codes (CHECK meta_lead_reasons_value). */
function reasonsOf(codes: readonly string[], phoneWasGiven: boolean): MetaProblemReason[] {
  const mapped = new Set<MetaProblemReason>();
  for (const code of codes) {
    if (code === "no_name" || code === "notes_too_long") mapped.add(code);
    else if (code === "no_contact") mapped.add(phoneWasGiven ? "phone_invalid" : "no_contact");
    else mapped.add("could_not_add");
  }
  return [...mapped];
}

/** Saves one lead in the caller's transaction and says what became of it. */
export async function receiveMetaLead(
  tx: OrgTx,
  actor: Actor,
  lead: Pick<MetaLead, "id" | "createdAt" | "platform" | "answers">,
  matches: readonly QuestionMatch[],
  context: MetaLeadContext,
  now: Date,
): Promise<MetaLeadOutcome> {
  const row = leadAsRow(lead, matches);
  const detail = sourceDetailOf(context.formName, lead.platform);
  const reading = readLeadRow(
    { rowNumber: 1, cells: row.cells },
    {
      columns: columnMatchesOf(row.fieldAt),
      headers: row.headers,
      ownerOf: () => null,
      stageOf: () => null,
      defaults: { stage: "new", ownerUserId: context.ownerUserId, budgetBasis: "for_everyone" },
      fileName: detail,
      today: context.today,
      timeZone: context.timeZone,
      source: { source: "meta_lead_ad", detail },
    },
  );
  if (reading.kind === "not_added") {
    return {
      kind: "not_added",
      reasons: reasonsOf(
        reading.reasons.map((reason) => reason.code),
        row.phoneGiven && reading.contacts.phone === null,
      ),
      exampleName: reading.exampleName,
    };
  }
  const { contacts } = reading;
  if (await isBlocked(tx, { phone: contacts.phone ?? undefined, email: contacts.email ?? undefined })) {
    return { kind: "not_added", reasons: ["blocked"], exampleName: reading.exampleName };
  }
  const saved = await saveEnquiry(tx, actor, reading.enquiry, now, {
    from: "import",
    ownerUserId: context.ownerUserId,
    stage: "new",
    // Meta's own time for the enquiry, in UTC, shown in the agency's zone (M9).
    createdAt: lead.createdAt,
    notify: context.notify,
    assign: { workers: context.workers },
    auditDetail: { formId: context.formId, metaLeadId: lead.id },
  });
  return {
    kind: "saved",
    status: saved.outcome === "created" ? "added" : "merged",
    leadId: saved.leadId,
    personId: saved.personId,
    ownerUserId: saved.leadOwnerUserId,
  };
}
