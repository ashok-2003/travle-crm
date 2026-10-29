// Public API of @travel-crm/domain/bookings: an accepted quote as a booking the agency confirms, collects money on and gives
// the traveller a trip page for (release 6): its travellers' details, stays and vouchers, payment claims, reminders,
// feedback, and a cancellation with a refund worked out from the agency's policy. It sits above quotes, sales and crm; a
// quote's acceptance reaches it as the "quote.accepted" event, never as a call.
export { cancelBooking, markRefunded, previewCancellation } from "./cancel.js";
export {
  CLAIM_KIND,
  CLAIM_WAITING_KIND,
  confirmClaim,
  raiseStaleClaims,
  rejectClaim,
  submitPaymentClaim,
} from "./claims.js";
export { confirmBooking, defaultSchedule, offeredSchedule, saveSchedule } from "./confirm.js";
export { recordTripUpdatesConsentByStaff, setRemindersPaused } from "./controls.js";
export {
  BOOKING_REQUESTED_KIND,
  createBookingFromQuote,
  lastDayOf,
  quoteAcceptedListener,
  quoteRevertedListener,
} from "./create-booking.js";
export {
  BOOKING_COMPLETE_QUEUE,
  BOOKING_DUE_WORK_QUEUE,
  completeFinishedBookings,
  runBookingDueWork,
  type BookingJobDependencies,
} from "./due-work.js";
export { eraseBookingParts, type BookingsErased } from "./erasure.js";
export {
  LOW_FEEDBACK_KIND,
  requestFeedback,
  submitFeedbackFromLink,
  type FeedbackRequestDependencies,
} from "./feedback.js";
export { cancellationCosts, daysBefore, ruleFor, snapshotOf, type CancellationCosts } from "./policy.js";
export {
  BOOKING_VOUCHER_RECORD_TYPE,
  isTripDocument,
  isTripFile,
  publicTripOf,
  type PublicTrip,
} from "./public-trip.js";
export { getBooking, listBookings, listLeadBookings } from "./reads.js";
export {
  BOOKING_REMINDERS_QUEUE,
  rebuildReminders,
  runBookingRemindersFor,
  tripUpdatesAgreed,
  type ReminderDependencies,
} from "./reminders.js";
export { findBookingInScope } from "./rows.js";
export { defaultBookingSettings, defaultPolicyRules, bookingSettingsOf, saveBookingSettings } from "./settings.js";
export { bookingsMissingDetails, DETAILS_HORIZON_DAYS, type DetailsMissing } from "./today-source.js";
export {
  isComplete,
  saveTravellerByStaff,
  saveTravellerFromLink,
  setLevel,
  setTravellerCount,
  travellerIdentityOf,
} from "./travellers.js";
export { issueVoucher, prepareTripPdf, removeStay, saveEssentials, saveStay } from "./trip-essentials.js";
