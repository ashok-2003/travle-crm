# email-log

Every email the product sends, kept as sent, so the console's super admins see the ones that failed and send them
again ([the failed-emails spec](../../../../docs/superpowers/specs/2026-11-02-failed-emails-design.md)). It catches our
own failures (the SMTP send threw) and the provider's (Brevo accepted the email, then dropped it, and said so in its
webhook).

## Public functions and values (`index.ts`)

- `recordedEmailSender(sender, store, logger)` wraps the real `EmailSender`; the api, the worker and the console send
  through it (`apps/api/src/services.ts`). For each message it records a `sending` row with the content, sends with
  `X-Mailin-custom: <row id>` (`EMAIL_REFERENCE_HEADER`), then marks the row `sent`, or `failed` (source `smtp`, the
  code from `failureCodeOf`) and rethrows the same error. Its `resend(stored)` sends a stored email again as a new row
  naming it (`resent_from_id`) and answers `{ id, status }` (with `failureCode` when it failed) instead of throwing.
- `emailLogStore(db)`: the `EmailLogStore` the wrapper writes to, each step in its own `db.withoutOrg()` transaction.
- `recordProviderFailures(db, failures)`: marks the rows Brevo reported dropped `failed` (source `provider`, its event
  as the code, its reason, its time), in one transaction. An unknown or malformed reference changes nothing; twice
  gives the same row. For the `brevo` webhook provider (`apps/api/src/brevo-webhook-provider.ts`).
- For the console, in a platform transaction: `failedEmails(tx, { cursor, limit }, now)` (the last 30 days' failed
  emails, newest first), `storedEmailOf(tx, id)` (one email as sent, with its resends), `emailToResend(tx, id)` (the
  failed email a resend copies), `purgeEmailLog(tx, now)` and `deleteEmailsTo(tx, addresses)` (an erasure).
- `SENT_KEEP_DAYS` (7) and `FAILED_KEEP_DAYS` (30); `PURGE_EMAIL_LOG_QUEUE` (`email-log.purge`), the console's daily
  job (`emailLogPurgeSchedule` in the platform module), which also blanks Brevo's stored reports after 7 days;
  `BREVO_PROVIDER` (`brevo`), the webhook provider's name; the types `RecordedEmailSender`, `ResendOutcome`,
  `EmailLogStore`, `ProviderFailure`.

## Events

None.

## Rules worth knowing

- The record never stops an email: if the `sending` insert fails, the email is sent anyway, without the reference, and
  one warning is logged by names and codes. A failure to mark the outcome is a warning too; the email is never sent
  twice for it.
- `sent` only replaces `sending`: a provider's report processed before our send finished stays.
- A retried email makes one row per attempt. The failed list shows each `source_ref`'s last automatic attempt only, and
  never a resend: the email it copies says whether a resend got through (`resent`), and its page lists them all.
- Retention: `sent` and `sending` rows go after 7 days; failed rows, and resends, after 30. The console's job
  `email-log.purge` runs `purgeEmailLog` daily. Erasing a member deletes the emails to their addresses at once.
- `email_log` has no `organization_id` and no row-level security: only this module reaches it, as `emailLogs(tx)` from
  `@travel-crm/db/email-log`. `OrgTx` leaves the model out, an organization's transaction refuses it
  (`UnscopedModelError`), dependency-cruiser keeps the entry point to this module, and ESLint flags raw SQL naming
  `email_log` anywhere else. The runtime role inserts and may change only the outcome columns; the platform role reads
  and deletes, and writes nothing.
- The rows hold working reset and invite links: only super admins see them (`superAdminProcedure`).
