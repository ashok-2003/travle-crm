// A public package page's enquiry becomes a lead (release 7b): the same save path as the website form (saveEnquiry, as an
// unverified enquiry by the public actor), with the source "package_page" and a first note "Enquired about <package>". The
// ledger (package_enquiry) holds ids and the outcome, so a double tap or a retry saves once, and keeps one person to three
// enquiries a day. Every outcome that is not a refusal is answered alike by the caller, so the page can't be used to learn who
// is a customer. The caller owns the transaction and reruns it once on a unique violation.
import type { TravelWhen, TripInput } from "@travel-crm/contracts/crm";
import type { PackageEnquiryInput } from "@travel-crm/contracts/package-pages";
import { sql, type OrgTx } from "@travel-crm/db";
import { DomainError, publicActor } from "../kernel/index.js";
import { assertNoLinks, formLimits } from "../website-forms/index.js";
import { isBlocked } from "./blocking.js";
import { matchPerson } from "./people.js";
import { saveEnquiry, type Enquiry } from "./save-enquiry.js";

const DAY_MS = 86_400_000;

export type PackageEnquiryOutcome = "new_lead" | "repeat_enquiry" | "blocked" | "duplicate" | "spam";

export interface PackageEnquiryContext {
  organizationId: string;
  /** The agency Owner the lead goes to (or, with assignment on, the fallback), found afresh for the enquiry. */
  ownerUserId: string;
  workers: ReadonlySet<string>;
  package: { id: string; name: string; destinationId: string | null };
  /** The departure the visitor joins, already checked to be open for the package. */
  departure: { id: string; title: string; startDate: string; endDate: string; full: boolean } | null;
  now: Date;
}

export interface PackageEnquiryResult {
  outcome: PackageEnquiryOutcome;
  leadId: string | null;
  /** Who owns the lead the enquiry is on, for the task that follows. */
  leadOwnerUserId: string | null;
}

/** What the ledger already holds for a submission id. */
export async function findPackageSubmission(
  tx: OrgTx,
  submissionId: string,
): Promise<{ outcome: PackageEnquiryOutcome } | null> {
  const row = await tx.packageEnquiry.findFirst({ where: { submissionId }, select: { outcome: true } });
  return row === null ? null : { outcome: row.outcome as PackageEnquiryOutcome };
}

/** Writes the honeypot's catch to the ledger. */
export async function recordPackageSpam(
  tx: OrgTx,
  input: { submissionId: string; packageId: string; now: Date },
): Promise<void> {
  await tx.packageEnquiry.createMany({
    data: [{ submissionId: input.submissionId, packageId: input.packageId, outcome: "spam", createdAt: input.now }],
    skipDuplicates: true,
  });
}

async function recentCount(tx: OrgTx, personId: string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - DAY_MS);
  const [row] = await tx.$queryRaw<{ count: number }[]>(sql`
    SELECT count(*)::int AS count
    FROM package_enquiry
    WHERE person_id = ${personId}::uuid AND outcome IN ('new_lead', 'repeat_enquiry') AND created_at >= ${since}`);
  return row?.count ?? 0;
}

function tripOf(context: PackageEnquiryContext, input: PackageEnquiryInput): TripInput {
  const { departure } = context;
  const month = input.answers.travelMonth;
  let when: TravelWhen = { kind: "unknown" };
  if (departure !== null) when = { kind: "dates", from: departure.startDate, to: departure.endDate };
  else if (month === "flexible") when = { kind: "flexible" };
  else if (typeof month === "string") when = { kind: "month", month };
  return {
    destination:
      context.package.destinationId === null
        ? null
        : { kind: "existing", destinationId: context.package.destinationId },
    when,
    adults: input.answers.travellers ?? null,
    childrenAges: [],
    budget: null,
    departureCity: null,
    tripType: null,
    hotelCategory: null,
    food: null,
    roomType: null,
  };
}

const dayFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const dayYearFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** A calendar day as the product shows one: "16 Oct", with the year when it is not this year's. */
function dayWords(day: string, now: Date): string {
  const date = new Date(`${day}T00:00:00Z`);
  return (date.getUTCFullYear() === now.getUTCFullYear() ? dayFormat : dayYearFormat).format(date);
}

/** The lead's first note: what the page was, the departure joined, and the visitor's words. */
function noteOf(context: PackageEnquiryContext, input: PackageEnquiryInput): string {
  const lines = [`Enquired about ${context.package.name}`];
  const { departure } = context;
  if (departure !== null) {
    const seats = input.answers.travellers ?? 1;
    lines.push(
      `${departure.full ? "Wants to join the waitlist" : "Wants to join the departure"}: ${departure.title}, ${dayWords(departure.startDate, context.now)}, ${String(seats)} ${seats === 1 ? "seat" : "seats"}`,
    );
  }
  if (input.answers.message !== undefined && input.answers.message !== "") lines.push(input.answers.message);
  return lines.join("\n").slice(0, 4000);
}

/** Saves one enquiry in the caller's transaction and says what became of it. Throws only a refusal the visitor can fix. */
export async function receivePackageEnquiry(
  tx: OrgTx,
  context: PackageEnquiryContext,
  input: PackageEnquiryInput,
): Promise<PackageEnquiryResult> {
  const { now } = context;
  const prior = await findPackageSubmission(tx, input.submissionId);
  if (prior !== null) return { outcome: prior.outcome, leadId: null, leadOwnerUserId: null };
  const { name, phone, email, message } = input.answers;
  assertNoLinks({ name, phone, ...(message === undefined ? {} : { message }) });
  const record = (outcome: PackageEnquiryOutcome, ids: { leadId?: string; personId?: string } = {}) =>
    tx.packageEnquiry.create({
      data: {
        submissionId: input.submissionId,
        packageId: context.package.id,
        departureId: context.departure?.id ?? null,
        outcome,
        createdAt: now,
        ...ids,
      },
    });
  if (await isBlocked(tx, { phone, email })) {
    await record("blocked");
    return { outcome: "blocked", leadId: null, leadOwnerUserId: null };
  }
  const known = await matchPerson(tx, { phone });
  // Submissions with different ids for one person take turns here, so the daily count can't be passed by sending at once.
  if (known !== null) await tx.$queryRaw`SELECT id FROM person WHERE id = ${known.person.id}::uuid FOR UPDATE`;
  if (known !== null && (await recentCount(tx, known.person.id, now)) >= formLimits.perPersonPerDay) {
    await record("duplicate", { personId: known.person.id });
    return { outcome: "duplicate", leadId: null, leadOwnerUserId: null };
  }
  const enquiry: Enquiry = {
    person: { name, phone, ...(email === undefined ? {} : { email }) },
    trip: tripOf(context, input),
    note: noteOf(context, input),
    source: "package_page",
    sourceDetail: context.package.name.slice(0, 120),
  };
  const saved = await saveEnquiry(tx, publicActor(context.organizationId), enquiry, now, {
    from: "import",
    ownerUserId: context.ownerUserId,
    stage: "new",
    createdAt: null,
    notify: "each",
    assign: { workers: context.workers },
    unverified: true,
    auditDetail: { packageId: context.package.id },
  });
  const outcome = saved.outcome === "created" ? "new_lead" : "repeat_enquiry";
  await record(outcome, { leadId: saved.leadId, personId: saved.personId });
  return { outcome, leadId: saved.leadId, leadOwnerUserId: saved.leadOwnerUserId };
}

/** The refusal of a departure that cannot take the visitor's request. */
export const departureUnavailable = () =>
  new DomainError("NOT_FOUND", "DEPARTURE_UNAVAILABLE", "This departure is not taking requests");
