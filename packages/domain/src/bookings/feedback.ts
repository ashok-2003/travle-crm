// Feedback (spec 2.8). Staff press "Request feedback" once a trip is on or over (never by itself): the trip link goes to the
// traveller on WhatsApp, and the trip page then shows the form: stars overall and for the hotel, transport and guide, a
// comment, up to five photos, and whether the agency may share the review. One to three stars tell the lead's owner and the
// managers at once. The Google review link, from the settings, is shown to everyone after the private feedback.
import { publicFeedbackInput, type PublicFeedbackInput } from "@travel-crm/contracts/bookings";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { noticeKey } from "../crm/index.js";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError, publicActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import { QUOTE_RECORD_TYPE } from "../quotes/index.js";
import { fillParams, leadFacts, sendToLead, type FillContext } from "../sales/index.js";
import { createShareLink } from "../share-links/index.js";
import { tripUpdatesAgreed } from "./reminders.js";
import { assertConfirmed, findBookingForChange, findBookingForSystem } from "./rows.js";
import { bookingSettingsOf } from "./settings.js";
import { recordBookingEvent } from "./timeline.js";

export const LOW_FEEDBACK_KIND = "booking.low-feedback";
const DAY = 24 * 3_600_000;

export interface FeedbackRequestDependencies {
  /** The web app's address, for the trip link. */
  appUrl: string;
  /** The agency's name and the lead owner's, for the blanks. */
  names: (organizationId: string, ownerUserId: string | null) => Promise<Omit<FillContext, "payment">>;
}

/** Asks the traveller for feedback, once; says whether the message was queued (otherwise staff send the trip link themselves). */
export async function requestFeedback(
  tx: OrgTx,
  access: MemberAccess,
  input: { bookingId: string },
  dependencies: FeedbackRequestDependencies,
  now: Date,
): Promise<{ sent: boolean }> {
  const booking = await findBookingForChange(tx, access, input.bookingId);
  assertConfirmed(booking);
  if (booking.feedbackRequestedAt !== null) {
    throw new DomainError("CONFLICT", "FEEDBACK_ALREADY_REQUESTED", "Feedback was already asked for");
  }
  await tx.booking.update({ where: { id: booking.id }, data: { feedbackRequestedAt: now } });
  const facts = await leadFacts(tx, booking.leadId);
  const settings = await bookingSettingsOf(tx);
  const agreed = await tripUpdatesAgreed(tx, booking.lead.personId);
  let sent = false;
  if (facts !== null && (agreed || settings.feedbackTemplateId !== null)) {
    const names = await dependencies.names(access.organizationId, booking.lead.ownerUserId);
    const shared = await createShareLink(
      tx,
      access,
      {
        recordType: QUOTE_RECORD_TYPE,
        recordId: booking.quoteId,
        label: `Trip ${booking.number}`,
        expiresAt: new Date(now.getTime() + 60 * DAY),
      },
      now,
    );
    const link = `${dependencies.appUrl.replace(/\/$/, "")}${shared.path}`;
    const first = facts.firstName === "" ? "there" : facts.firstName;
    const result = await sendToLead(
      tx,
      {
        organizationId: access.organizationId,
        leadId: booking.leadId,
        templateId: settings.feedbackTemplateId,
        params: fillParams(settings.feedbackParams, facts, {
          ...names,
          payment: { amountPaise: 0, dueOn: now.toISOString().slice(0, 10), link },
        }),
        sessionText: `Hi ${first}, we hope you had a lovely trip. We would love your feedback, it takes a minute: ${link}\n\n${names.agencyName}`,
        agreed,
        clientToken: `booking-feedback:${booking.id}`,
      },
      now,
    );
    sent = result.kind === "sent";
  }
  await recordAudit(tx, access, {
    action: "booking.feedback-requested",
    entityType: "booking",
    entityId: booking.id,
    after: { sent },
  });
  await recordBookingEvent(tx, access, { leadId: booking.leadId, bookingId: booking.id, event: "feedback-requested" });
  return { sent };
}

/** The traveller's feedback from the trip page; one per booking. Low stars tell the owner and the managers now. */
export async function submitFeedbackFromLink(
  tx: OrgTx,
  input: { organizationId: string; quoteId: string; feedback: PublicFeedbackInput; managers: readonly string[] },
): Promise<string> {
  const feedback = publicFeedbackInput.parse(input.feedback);
  const found = await tx.booking.findFirst({
    where: { quoteId: input.quoteId, status: { in: ["confirmed", "completed"] }, feedbackRequestedAt: { not: null } },
    select: { id: true },
  });
  if (found === null) throw new DomainError("CONFLICT", "FEEDBACK_NOT_ASKED", "Feedback isn't open for this booking");
  const booking = await findBookingForSystem(tx, found.id, true);
  if ((await tx.bookingFeedback.count({ where: { bookingId: booking.id } })) > 0) {
    throw new DomainError("CONFLICT", "FEEDBACK_ALREADY_SENT", "Your feedback was already sent");
  }
  if (feedback.photoAttachmentIds.length > 0) {
    const ready = await tx.attachment.count({
      where: {
        id: { in: feedback.photoAttachmentIds },
        recordType: "booking_feedback",
        recordId: booking.id,
        status: "ready",
        contentType: { startsWith: "image/" },
      },
    });
    if (ready !== new Set(feedback.photoAttachmentIds).size)
      throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such file");
  }
  const actor = publicActor(input.organizationId);
  const row = await tx.bookingFeedback.create({
    data: {
      bookingId: booking.id,
      overall: feedback.overall,
      hotel: feedback.hotel,
      transport: feedback.transport,
      guide: feedback.guide,
      comment: feedback.comment,
      mayShare: feedback.mayShare,
    },
    select: { id: true },
  });
  if (feedback.overall <= 3) {
    const recipients = [
      ...new Set([...(booking.lead.ownerUserId === null ? [] : [booking.lead.ownerUserId]), ...input.managers]),
    ];
    if (recipients.length > 0) {
      await notify(tx, actor, {
        recipientUserIds: recipients,
        sourceEventId: noticeKey(row.id, LOW_FEEDBACK_KIND),
        kind: LOW_FEEDBACK_KIND,
        title: `${booking.lead.person.name} gave ${String(feedback.overall)} ${feedback.overall === 1 ? "star" : "stars"}`,
        body: `Feedback on booking ${booking.number}. Call them soon.`,
        link: `/bookings/${booking.id}`,
        channels: ["push"],
      });
    }
  }
  await recordAudit(tx, actor, {
    action: "booking.feedback-received",
    entityType: "booking",
    entityId: booking.id,
    after: { feedbackId: row.id, overall: feedback.overall },
  });
  await recordBookingEvent(tx, actor, { leadId: booking.leadId, bookingId: booking.id, event: "feedback-received" });
  await publishEvent(tx, { type: "feedback.submitted", payload: { feedbackId: row.id, bookingId: booking.id } });
  return row.id;
}
