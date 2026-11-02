# Failed emails in the console: design

The owner asked for this on 2 Nov 2026. For three days, Brevo held our account in a new-account review. It
**accepted** every email over SMTP and dropped it afterwards: password resets, invites and staff alerts never
arrived, and nothing in the product showed it.

Super admins get a console page that lists the emails that failed and shows each one as it was sent, so they can
send it again once the cause is fixed.

## The owner's decisions (2026-11-02)

- **Catch our failures and the provider's.**
  - Ours: a send our SMTP adapter saw fail.
  - The provider's: an email Brevo accepted and then dropped (blocked, bounced, the account disabled), reported by
    Brevo's transactional webhook.
- **Show each email as it was sent, links included.** That covers password-reset and invite links too; the owner
  chose this over hiding them. It makes the page sensitive, so it is for **super admins only**, never support, and
  the rows are kept for a limited time (see Retention).
- **View and resend.** A super admin can send a failed email again, as it was.

## What is recorded

**Every** email the product sends is recorded when it is sent, not only the failed ones: a provider's report arrives
after the send, and by then the content must already be kept.

### The `email_log` table

- **What kind of table it is:**
  - It has no `organization_id` and no row-level security, like `webhook_event`.
  - Only its own module reaches it, through `@travel-crm/db/email-log`, inside `db.withoutOrg` in the api and the
    worker; `OrgTx` hides it.
  - The platform role reads it, and deletes from it, for the console.
  - dependency-cruiser and the ESLint raw-SQL guard keep it to its module, as they do for webhook events.

| Column           | What it holds                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| `id`             | UUID v7. Also our reference on the message: the `X-Mailin-custom` header, which Brevo returns in webhooks |
| `purpose`        | What sent it: `notification`, `password-reset`, `staff-invite`, `platform`... (CHECK `^[a-z][a-z-]*$`) |
| `source_ref`     | Optional, e.g. `notification:<id>`: ties a retry's attempts together                                   |
| `to_address`     | Who it was for                                                                                         |
| `to_name`        | Who it was for (optional)                                                                              |
| `from_name`      | As sent                                                                                                |
| `reply_to`       | As sent                                                                                                |
| `subject`        | As sent                                                                                                |
| `text_body`      | As sent                                                                                                |
| `html_body`      | As sent                                                                                                |
| `status`         | `sending`, `sent` or `failed`                                                                          |
| `failure_source` | `smtp` (our send failed) or `provider` (Brevo reported it)                                             |
| `failure_code`   | Ours: the adapter's safe code, e.g. `EAUTH (SMTP 535)`. The provider's: its event, e.g. `blocked`, `hard_bounce`, `error` |
| `failure_reason` | The provider's reason, at most 1,000 characters                                                        |
| `created_at`     | When the send started                                                                                  |
| `sent_at`        | When it was sent                                                                                       |
| `failed_at`      | When it failed                                                                                         |
| `resent_from_id` | The failed email a resend copies (`ON DELETE SET NULL`)                                                |

- **Indexes:**
  - the failed list, newest first: `(id DESC) WHERE status = 'failed'`;
  - `created_at`, for the purge;
  - `source_ref`, for the retry check.

### Recording a send

- **A port addition:**
  - `EmailMessage` (`packages/integrations/src/email/email-sender.ts`) gets two optional fields, `purpose` and
    `sourceRef`.
  - The SMTP adapter ignores both; neither becomes a header.
  - Every caller sets `purpose`; the notification delivery also sets `sourceRef: notification:<id>`.
- **The wrapper:** the email-log module wraps the real sender as `recordedEmailSender(sender, store, logger)`. Each
  process (the api, the worker and the console) sends through it. For each message it:
  1. inserts a `sending` row with the content;
  2. sends with the extra header `X-Mailin-custom: <row id>`;
  3. marks the row `sent`, or marks it `failed` (`smtp`, with the adapter's safe code), then rethrows the **same**
     error. The callers' retry and give-up logic does not change.
- **If the insert fails** (the database is down), the email is sent anyway and one warning is logged, by names and
  codes only. The record never stops an email.
- **A retried notification** makes one row per attempt.
  - The failed list hides a failure whose `source_ref` has a later `sent` row: the retry got it through.
  - A failure with no later success stays listed.

### Brevo's reports

- **The provider:** a webhook provider `brevo` (`apps/api/src/brevo-webhook-provider.ts`), registered in
  `webhook-providers.ts` when its settings are set. It is received and processed like the MSG91 one.
- **Where Brevo posts:** `/webhooks/brevo/<BREVO_WEBHOOK_TOKEN>`.
- **How we check it's Brevo:** the request must carry `Authorization: Bearer <BREVO_WEBHOOK_KEY>`. Both values are
  random (`openssl rand -hex 32`), compared in constant time, and come both or neither.
- **The body** is one event, or an array of events if Brevo batches.
- **Each event is identified** by `message-id`, `event` and `ts_epoch`, with the type `brevo.<event>`.
- **What processing does (worker):**
  - `hard_bounce`, `soft_bounce`, `blocked`, `spam`, `invalid_email` and `error` mark the row named by
    `X-Mailin-custom` as `failed`: source `provider`, code = the event, reason = Brevo's `reason`, time =
    `ts_epoch`.
  - A missing or unknown reference, and every other event (`deferred`, `delivered`...), change nothing.
  - Processing it twice gives the same row.
- **Settings:**
  - `BREVO_WEBHOOK_TOKEN` and `BREVO_WEBHOOK_KEY` go in `environment.ts`, `service-variables.ts`,
    `docker-compose.server.yml` (the api and the worker), `scripts/server/secrets.sh` (blank leaves Brevo's reports
    off, and `check` does not ask), `.env.example` and `docs/deploy-checklist.md`.
  - The owner's steps in Brevo go in the runbook: Transactional, Settings, Webhooks; the URL; the bearer token; the
    six failure events.

## The console

- **A new router, `emails`, in `packages/api/src/platform`,** with every procedure on `superAdminProcedure`. Support
  staff are refused.
  - `emails.failed({ cursor })`: failed rows of the last 30 days, newest first, by cursor. A row shows when, to,
    subject, purpose, source, code, a short reason, and whether a resend of it was later sent.
  - `emails.get({ id })`: the whole message.
    - Shows to, from name, reply-to, subject, purpose and the times.
    - Shows the failure, the text and the HTML.
    - Lists the resends of it, with their statuses.
  - `emails.resend({ id })`: sends the stored message again, through the console's recorded sender.
    - The new row has the same `purpose` and `source_ref`, and `resent_from_id` set.
    - It goes in the platform log (`recordPlatformAudit`, action `email.resent`).
    - It answers the new row's status: `sent` or `failed`.
- **Schemas** go in `@travel-crm/contracts/platform`: strict inputs, outputs with `z.object`.
- **The screens:**
  - `/console/emails`, "Failed emails", in the console's navigation for super admins:
    - a `PageHeader`;
    - the registry `Table` on a desktop, `Item`s on a phone, as the Jobs page does;
    - `useCursorPages` with `ShowMoreButton`;
    - `EmptyState` when nothing failed.
  - Each row opens `/console/emails/[emailId]`:
    - `Details` for the headers and the failure;
    - the email as sent, in an `<iframe sandbox="" srcDoc=…>`, so no script runs and nothing can navigate;
    - its plain text;
    - its resends;
    - **Resend** in a `ConfirmDialog`. The result shows on the page and the list refreshes.
  - Times are in `PLATFORM_TIME_ZONE`, and every word is a message in the console's messages.
- **Every owner's UI rule applies:** registry components only, no borders or shadows outside `components/ui`, and
  `BackLink` to the list.

## Retention and erasure

- **The purge:** a console job, `email-log.purge`, runs daily (Asia/Kolkata). It deletes `sent` and `sending` rows
  after 7 days, and `failed` rows after 30. Working links, the owner's choice, are therefore never kept beyond 30
  days.
- **Erasure:** erasing a member also deletes the rows to their address (`packages/domain/src/platform/erasure.ts`).
  Customers are never emailed, so they need no step.

## Out of scope (later)

- An incident on the dashboard when emails fail. The incident's own email could not get out either; the page is
  where to look.
- Delivered and opened tracking.
- Filters by agency or purpose.

## Risks

- **Brevo may not webhook every drop.** We haven't confirmed that its account-review drop sends an `error` event; its
  logs record that error once a day. The page then misses those drops. The runbook should say to check Brevo's own
  logs too.
- **Storage:** about 100 rows a day today, under a megabyte of the database. The purge keeps it small.

## Rulings (the build, 2026-11-02)

- Ruling: `email_log` gets a `headers` column (JSON object, the message's own extra headers, never our reference) —
  a resend "as it was" must carry a notification's `List-Unsubscribe`, which the table as listed would drop — a column
  that holds nothing a resend needs, if headers never matter.
- Ruling: the runtime role may insert and update only the outcome columns (`status`, `failure_*`, `sent_at`,
  `failed_at`); it keeps SELECT, and has no DELETE. The platform role reads and deletes and writes nothing; a resend is
  recorded by the console's runtime connection like any send — a broader runtime grant would let a bug rewrite what
  was sent; if the console ever needs to write a row itself, a grant.
- Ruling: `sent` replaces only `sending`, and a provider report replaces any status — Brevo's report can be processed
  before our own send is marked sent, and must not be overwritten — none known.
- Ruling: the failed list shows each `source_ref`'s last automatic attempt only (a later attempt that failed again
  hides the earlier failure too, not only one that got through), and never a resend; the email a resend copies stays
  listed with `resent` (a resend of it was sent), and its page lists every resend — a notification retried five times
  would otherwise show five times, and a resend with the same `source_ref` would hide the very email it copies — a
  super admin who wanted every attempt listed opens the email instead.
- Ruling: only a `failed` email is sent again (`EMAIL_NOT_FAILED`), and one already resent can be sent again — the
  page is for failures; a second resend is the super admin's call, asked in a ConfirmDialog — a duplicate email if
  they press it twice on purpose.
- Ruling: the resend is logged first (`email.resent`, target type `email`, after `{ purpose }`, no address), and again
  as `email.resend-failed` with the code when it fails too, as the failed jobs' retry is — nothing is sent that the log
  doesn't show — two entries for one failed resend.
- Ruling: resends are kept 30 days like failed emails, not 7 like other sent ones, and `sending` rows go after 7 —
  the email a resend copies says how it went for as long as it is listed; a send that never finished has nothing to
  wait for — links in a resend kept 30 days, the owner's limit.
- Ruling: the purge also blanks Brevo's stored webhook payloads processed more than 7 days ago (the webhooks module's
  `blankProcessedPayloads`, as MSG91's are) — they name the recipient and the subject, and `webhook_event` would
  otherwise keep them for good — none.
- Ruling: an organization's purge doesn't delete its people's emails at once; the 30-day purge does — the spec names
  the erasure only, and the purge has no list of addresses without a new identity query — up to 30 days of a purged
  organization's emails in the log.
- Ruling: a purpose the email log can't store (not lower-case words, or none) is recorded as `other`, and the
  incident emails' purpose is `platform-incident` — the record never stops an email, and a CHECK failure would lose
  the row — a mislabelled kind on the page.
- Ruling: Brevo's events are identified by a SHA-256 of `message-id`, `event` and the event's time, one event or each
  of a batch (type `brevo.<event>`, `brevo.batch` for several, `brevo.unknown` for an unreadable body), and every body
  that carries both secrets is stored and answered 200, as MSG91's are — a delivery repeated with other fields is the
  same event, and a 4xx could make Brevo pause the webhook — an unreadable body stored, then blanked after 7 days.
- Ruling: `ts_epoch` is read as milliseconds, or as seconds when it is below 10^12, falling back to `ts` (seconds) and
  then to when we received it — Brevo's documents show both — a failure time off by the delivery delay.
- Ruling: a path token reaches any provider at `/webhooks/<provider>/<token>` (the generic route sets the internal
  header, and removes one a caller sent on `/webhooks/<provider>`), and `sameSecret` moved to `webhook-route.ts` for
  MSG91's provider and Brevo's — one route and one comparison instead of a copy per provider — none.
- Ruling: `PURGE_EMAIL_LOG_QUEUE` lives in the email-log module, as `RATE_LIMIT_PURGE_QUEUE` lives in rate-limits —
  the platform log's action test reads every `"x.y"` constant in the platform module as an action — none.
- Ruling: the console's frame is `<iframe sandbox="" srcDoc>` in a Card, 36rem tall, scrolling inside; the
  `no-inner-html` test now allows `srcDoc` only in that one file and only with `sandbox=""` — no script can size it,
  and the HTML is shown only where it can do nothing — a long email scrolls in its frame. The journey checks the frame
  renders under the console's Content-Security-Policy, and runs axe on the page with the frame left out: axe can't
  inject its script into a frame with no permissions and waits on it until the journey times out.
