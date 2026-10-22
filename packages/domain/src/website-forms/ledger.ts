// The submission ledger (W21, W22, spec 7.2): one row for each submission that got as far as the ledger, holding ids, an
// outcome and a time, never a name, phone, email, message, address or browser string. Append only for the runtime role.
import type { OrgTx } from "@travel-crm/db";
import { formLimits } from "./limits.js";

export type SubmissionOutcome = "new_lead" | "repeat_enquiry" | "blocked" | "duplicate" | "spam";

export interface SubmissionRow {
  id: string;
  formId: string;
  submissionId: string;
  outcome: SubmissionOutcome;
  reason: "honeypot" | null;
  leadId: string | null;
  personId: string | null;
  createdAt: Date;
}

const DAY_MS = 86_400_000;

/**
 * The ledger row of a submission id, or null. It first takes the id's lock for the rest of the transaction, so two
 * submissions racing with one id take turns: the second waits for the first to commit, then finds its row (W21).
 */
export async function findSubmission(tx: OrgTx, submissionId: string): Promise<SubmissionRow | null> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`website-form-submission:${submissionId}`}, 0))`;
  const row = await tx.websiteFormSubmission.findFirst({ where: { submissionId } });
  return row === null
    ? null
    : { ...row, outcome: row.outcome as SubmissionOutcome, reason: row.reason as "honeypot" | null };
}

/** Writes the ledger row. A row with the same submission id already there (a racer wrote it first) is left as it is. */
export async function recordSubmission(
  tx: OrgTx,
  input: {
    formId: string;
    submissionId: string;
    outcome: SubmissionOutcome;
    reason?: "honeypot";
    leadId?: string;
    personId?: string;
    now: Date;
  },
): Promise<void> {
  await tx.websiteFormSubmission.createMany({
    data: [
      {
        formId: input.formId,
        submissionId: input.submissionId,
        outcome: input.outcome,
        reason: input.reason ?? null,
        leadId: input.leadId ?? null,
        personId: input.personId ?? null,
        createdAt: input.now,
      },
    ],
    skipDuplicates: true,
  });
}

/** Enquiries that reached a person in the last 24 hours: blocked, duplicate and spam rows do not count (W22). */
export async function recentEnquiryCount(tx: OrgTx, personId: string, now: Date): Promise<number> {
  return tx.websiteFormSubmission.count({
    where: {
      personId,
      outcome: { in: ["new_lead", "repeat_enquiry"] },
      createdAt: { gte: new Date(now.getTime() - DAY_MS) },
    },
  });
}

/** The settings page's "Last 30 days": enquiries (new leads and repeat enquiries), each of those, and those stopped. */
export async function formCounts(
  tx: OrgTx,
  formId: string,
  now: Date,
): Promise<{ enquiries: number; newLeads: number; repeatEnquiries: number; stopped: number }> {
  const groups = await tx.websiteFormSubmission.groupBy({
    by: ["outcome"],
    where: { formId, createdAt: { gte: new Date(now.getTime() - formLimits.countDays * DAY_MS) } },
    _count: { _all: true },
  });
  const countOf = (...outcomes: SubmissionOutcome[]) =>
    groups
      .filter((group) => outcomes.includes(group.outcome as SubmissionOutcome))
      .reduce((sum, group) => sum + group._count._all, 0);
  const newLeads = countOf("new_lead");
  const repeatEnquiries = countOf("repeat_enquiry");
  return {
    enquiries: newLeads + repeatEnquiries,
    newLeads,
    repeatEnquiries,
    stopped: countOf("blocked", "duplicate", "spam"),
  };
}
