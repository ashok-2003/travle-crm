// The events bookings publish (ids only, never personal data), for the listeners and for the lead's timeline.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

export const bookingCreatedEvent = z.strictObject({ bookingId: recordId });
export const bookingConfirmedEvent = z.strictObject({ bookingId: recordId });
export const bookingCancelledEvent = z.strictObject({ bookingId: recordId });
export const paymentClaimSubmittedEvent = z.strictObject({ claimId: recordId, bookingId: recordId });
export const feedbackSubmittedEvent = z.strictObject({ feedbackId: recordId, bookingId: recordId });
