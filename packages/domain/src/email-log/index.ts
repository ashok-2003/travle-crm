// Public API of the email-log module: every email the product sends, recorded as sent (the failed-emails spec), what
// Brevo's reports mark failed, and what the console reads, sends again and deletes. Only this module reaches email_log.
export { emailToResend, failedEmails, storedEmailOf } from "./failed-emails.js";
export { recordProviderFailures, type ProviderFailure } from "./provider-failures.js";
export {
  EMAIL_REFERENCE_HEADER,
  failureCodeOf,
  recordedEmailSender,
  type RecordedEmailSender,
  type ResendOutcome,
} from "./recorded-email-sender.js";
export { deleteEmailsTo, FAILED_KEEP_DAYS, purgeEmailLog, SENT_KEEP_DAYS } from "./retention.js";
export { emailLogStore, type EmailLogStore } from "./store.js";
