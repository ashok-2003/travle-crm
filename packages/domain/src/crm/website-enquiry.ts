// A website form's submission becomes a lead (website form W12-W24): the one save path, saveEnquiry, as an unverified
// enquiry by the public actor. Every outcome that is not a refusal is answered alike (W20), so the form can't be used to
// learn who a customer is. The caller owns the transaction and reruns it once on a unique violation (B26).
import { features } from "@travel-crm/contracts/features";
import type { TravelWhen, TripInput } from "@travel-crm/contracts/crm";
import {
  OFFERS_WORDING_VERSION,
  offersWording,
  type EnquiryAnswers,
  type WebsiteEnquiryInput,
} from "@travel-crm/contracts/website-forms";
import type { OrgTx } from "@travel-crm/db";
import { destinationById } from "../catalog/index.js";
import { DomainError, publicActor } from "../kernel/index.js";
import {
  assertAnswersMatchModes,
  assertNoLinks,
  findSubmission,
  formLimits,
  recentEnquiryCount,
  recordSubmission,
  type SubmissionOutcome,
  type WebsiteFormRow,
} from "../website-forms/index.js";
import { isBlocked } from "./blocking.js";
import { recordConsent } from "./consent.js";
import { matchPerson } from "./people.js";
import { saveEnquiry, type Enquiry } from "./save-enquiry.js";

export interface WebsiteEnquiryContext {
  organizationId: string;
  /** The agency Owner the lead goes to (or, with assignment on, the fallback), found afresh for the enquiry. */
  ownerUserId: string;
  workers: ReadonlySet<string>;
  form: WebsiteFormRow;
  agencyName: string;
  via: "hosted" | "embedded";
  embeddedOn: string | null;
  now: Date;
}

export type WebsiteEnquiryOutcome = "new_lead" | "repeat_enquiry" | "blocked" | "duplicate";

/**
 * The one answer to every enquiry that is not refused, the honeypot's included (W20). A switch, not a constant, so a new
 * outcome has to be given its answer here and can't leak a different one.
 */
export function answerOf(outcome: WebsiteEnquiryOutcome | "spam"): { status: 201; body: { ok: true } } {
  switch (outcome) {
    case "new_lead":
    case "repeat_enquiry":
    case "blocked":
    case "duplicate":
    case "spam":
      return { status: 201, body: { ok: true } };
  }
}

const HOST_NAME = /^(?=.{1,80}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

/** "Hosted link", the embedding site's host name, or "Embedded" when the page's report is not a host name (W14). */
function sourceDetailOf(context: WebsiteEnquiryContext): string {
  if (context.via === "hosted") return "Hosted link";
  const host = context.embeddedOn?.trim().toLowerCase() ?? "";
  return HOST_NAME.test(host) ? host : "Embedded";
}

const paiseOf = (rupees: number) => rupees * 100;

function tripOf(answers: EnquiryAnswers, destinationId: string | null): TripInput {
  let when: TravelWhen = { kind: "unknown" };
  if (answers.travelMonth === "flexible") when = { kind: "flexible" };
  else if (typeof answers.travelMonth === "string") when = { kind: "month", month: answers.travelMonth };
  return {
    destination: destinationId === null ? null : { kind: "existing", destinationId },
    when,
    adults: answers.adults ?? null,
    childrenAges: answers.childrenAges ?? [],
    budget: answers.budget
      ? {
          amount: { amountPaise: paiseOf(answers.budget.rupees), currency: "INR" },
          basis: answers.budget.basis === "everyone" ? "for_everyone" : "per_person",
        }
      : null,
    departureCity: null,
    tripType: null,
    hotelCategory: null,
    food: null,
    roomType: null,
  };
}

/**
 * The destination the visitor meant: one chosen by id, or a typed name that is a live destination ignoring case and
 * surrounding spaces. Anything else makes no destination (the form never creates one, W8); a typed name is then
 * returned for the note.
 */
async function destinationOf(
  tx: OrgTx,
  answer: EnquiryAnswers["destination"],
): Promise<{ destinationId: string | null; askedFor: string | null }> {
  if (answer === undefined) return { destinationId: null, askedFor: null };
  if (answer.kind === "existing") {
    return { destinationId: (await destinationById(tx, answer.destinationId))?.id ?? null, askedFor: null };
  }
  const text = answer.text.trim();
  const named = await tx.destination.findFirst({
    // "insensitive" compiles to ILIKE, so escape its pattern characters to compare the name literally.
    where: { name: { equals: text.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" } },
    select: { id: true },
  });
  return named === null ? { destinationId: null, askedFor: text } : { destinationId: named.id, askedFor: null };
}

/** W12: the message, then "Destination asked for" when a typed name matched nothing; saveEnquiry adds the email line. */
function noteOf(message: string | undefined, askedFor: string | null): string | null {
  const lines = [message, askedFor === null ? null : `Destination asked for: ${askedFor}`].filter(
    (line): line is string => line !== undefined && line !== null && line !== "",
  );
  return lines.length === 0 ? null : lines.join("\n").slice(0, 4000);
}

const asOutcome = (outcome: SubmissionOutcome): WebsiteEnquiryOutcome => (outcome === "spam" ? "duplicate" : outcome);

/** Saves one submission in the caller's transaction and says what became of it. Throws only a refusal the visitor can fix. */
export async function receiveWebsiteEnquiry(
  tx: OrgTx,
  context: WebsiteEnquiryContext,
  input: WebsiteEnquiryInput,
): Promise<WebsiteEnquiryOutcome> {
  // While the switch is off the form shows no tickbox, so `offers` in any value is not something it sends.
  if (input.answers.offers !== undefined && !features.marketingConsent) {
    throw new DomainError("VALIDATION", "FORM_OFFERS_NOT_AVAILABLE", "This form does not take offers");
  }
  const { form, now } = context;
  // The embed can be switched off (W30): a submission from it is then as unavailable as from a closed form.
  if (input.via === "embedded" && !form.allowEmbed) {
    throw new DomainError("FORBIDDEN", "FORM_UNAVAILABLE", "This form is not taking enquiries");
  }
  const prior = await findSubmission(tx, input.submissionId);
  if (prior !== null) return asOutcome(prior.outcome);
  const answers = assertAnswersMatchModes(form, input.answers);
  assertNoLinks(answers);
  const record = (outcome: SubmissionOutcome, ids: { leadId?: string; personId?: string } = {}) =>
    recordSubmission(tx, { formId: form.id, submissionId: input.submissionId, outcome, now, ...ids });

  if (await isBlocked(tx, { phone: answers.phone, email: answers.email })) {
    await record("blocked");
    return "blocked";
  }
  const known = await matchPerson(tx, { phone: answers.phone });
  // Submissions with different ids for one person take turns here, so W22's count can't be passed by sending at once.
  // Always taken after the submission id's lock (findSubmission), so the order is fixed.
  if (known !== null) await tx.$queryRaw`SELECT id FROM person WHERE id = ${known.person.id}::uuid FOR UPDATE`;
  if (known !== null && (await recentEnquiryCount(tx, known.person.id, now)) >= formLimits.perPersonPerDay) {
    await record("duplicate", { personId: known.person.id });
    return "duplicate";
  }
  const { destinationId, askedFor } = await destinationOf(tx, answers.destination);
  const enquiry: Enquiry = {
    person: {
      name: answers.name,
      phone: answers.phone,
      ...(answers.email === undefined ? {} : { email: answers.email }),
    },
    trip: tripOf(answers, destinationId),
    note: noteOf(answers.message, askedFor),
    source: "web_form",
    sourceDetail: sourceDetailOf(context),
  };
  const saved = await saveEnquiry(tx, publicActor(context.organizationId), enquiry, now, {
    from: "import",
    ownerUserId: context.ownerUserId,
    stage: "new",
    createdAt: null,
    notify: "each",
    // As imports and Sheets do: the agency's rules and mode decide the owner (W7, release 4).
    assign: { workers: context.workers },
    unverified: true,
    auditDetail: { formId: form.id },
  });
  const outcome = saved.outcome === "created" ? "new_lead" : "repeat_enquiry";
  await record(outcome, { leadId: saved.leadId, personId: saved.personId });
  if (answers.offers === true) {
    await recordConsent(tx, publicActor(context.organizationId), {
      personId: saved.personId,
      wording: offersWording(context.agencyName),
      wordingVersion: OFFERS_WORDING_VERSION,
      formId: form.id,
      now,
    });
  }
  return outcome;
}
