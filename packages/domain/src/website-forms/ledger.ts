// The submission ledger (W21, W22, spec 7.2): one row for each submission that got as far as the ledger, holding ids, an
// outcome and a time, never a name, phone, email, message, address or browser string. Append only for the runtime role.
import { sql, type OrgTx, type Sql } from "@travel-crm/db";
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
  const [row] = await tx.$queryRaw<
    (Omit<SubmissionRow, "outcome" | "reason"> & { outcome: string; reason: string | null })[]
  >(submissionQuery(submissionId));
  return row === undefined
    ? null
    : { ...row, outcome: row.outcome as SubmissionOutcome, reason: row.reason as "honeypot" | null };
}

/** The SQL of findSubmission's read, exported so a test plans exactly what runs. Row-level security picks the agency. */
export const submissionQuery = (submissionId: string): Sql => sql`
  SELECT id, form_id AS "formId", submission_id AS "submissionId", outcome, reason, lead_id AS "leadId",
    person_id AS "personId", created_at AS "createdAt"
  FROM website_form_submission
  WHERE submission_id = ${submissionId}::uuid
  LIMIT 1`;

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

/** The SQL of recentEnquiryCount's read: the person's enquiries since `since`, from the per-person index. */
export const recentEnquiryQuery = (personId: string, since: Date): Sql => sql`
  SELECT count(*)::int AS count
  FROM website_form_submission
  WHERE person_id = ${personId}::uuid AND outcome IN ('new_lead', 'repeat_enquiry') AND created_at >= ${since}`;

/** Enquiries that reached a person in the last 24 hours: blocked, duplicate and spam rows do not count (W22). */
export async function recentEnquiryCount(tx: OrgTx, personId: string, now: Date): Promise<number> {
  const [row] = await tx.$queryRaw<{ count: number }[]>(recentEnquiryQuery(personId, new Date(now.getTime() - DAY_MS)));
  return row?.count ?? 0;
}

/** The SQL of formCounts' read: a form's rows since `since`, counted by outcome, from the counts index. */
export const formCountsQuery = (formId: string, since: Date): Sql => sql`
  SELECT outcome, count(*)::int AS count
  FROM website_form_submission
  WHERE form_id = ${formId}::uuid AND created_at >= ${since}
  GROUP BY outcome`;

/** The settings page's "Last 30 days": enquiries (new leads and repeat enquiries), each of those, and those stopped. */
export async function formCounts(
  tx: OrgTx,
  formId: string,
  now: Date,
): Promise<{ enquiries: number; newLeads: number; repeatEnquiries: number; stopped: number }> {
  const groups = await tx.$queryRaw<{ outcome: string; count: number }[]>(
    formCountsQuery(formId, new Date(now.getTime() - formLimits.countDays * DAY_MS)),
  );
  const countOf = (...outcomes: SubmissionOutcome[]) =>
    groups
      .filter((group) => outcomes.includes(group.outcome as SubmissionOutcome))
      .reduce((sum, group) => sum + group.count, 0);
  const newLeads = countOf("new_lead");
  const repeatEnquiries = countOf("repeat_enquiry");
  return {
    enquiries: newLeads + repeatEnquiries,
    newLeads,
    repeatEnquiries,
    stopped: countOf("blocked", "duplicate", "spam"),
  };
}
