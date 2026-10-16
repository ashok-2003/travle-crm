# 0014: Notifications

Date: 2026-10-15 · Status: accepted · Implements spec section 9.4

## Decision

- **One service, `notify()`** (`@travel-crm/domain/notifications`), called by every module inside its own
  transaction. It writes one row per person to `notification`, which is the in-app bell, and publishes a
  `notification.created` event per row when email or push is asked for. The worker's `notifications.deliver`
  listener sends them.
- **The bell can't be turned off.** It is the record that something happened. Email and push can be, per kind of
  notification or for every kind (`*`), in `notification_preference`; a kind's own choice wins over `*`. The listener
  reads the choices at delivery time, so a change applies to notifications not yet sent.
- **Email comes from our domain** under the organization's name ("Sharma Travels via Travel Agency OS"), with
  Reply-To set to the organization's contact email (`organization.contact_email`, set at onboarding), and a
  `List-Unsubscribe` header pointing at the web app's notification settings. One SMTP adapter (nodemailer) serves
  Mailpit locally and Amazon SES in the cloud through SES's SMTP interface. The from address is the adapter's
  setting.
- **Web push uses VAPID.** web-push encrypts the payload (aes128gcm) and signs the request; the adapter sends it with
  `fetch`. A subscription the push service has forgotten (404 or 410) is deleted.
- **Delivery claims with a lease, and "sent" means sent.** Listeners run at least once, and two deliveries of one
  event can overlap. Each channel is claimed by an atomic update of `email_claimed_at` or `push_claimed_at` (only the
  run that finds it unsent and unclaimed, or claimed more than 5 minutes ago, wins) before anything is sent, and
  `emailed_at` / `pushed_at` are set only after a send worked. A failed send releases its claim and throws, so the job
  retries. A run that crashed after claiming loses nothing: its claim expires and a retry takes it over (the lease is
  above the longest bounded send and below the jobs' retry window). A run that lost the claim to a run still
  sending asks to be retried instead of assuming the send happened. The cost is that a crash between the send and
  recording it can still repeat one email or push, which is the at-least-once guarantee.
- **Email and push are independent**, and so is each browser: one failing doesn't stop the rest, and the push is done
  once one browser got it. A failure that can never succeed (a header that is refused, an oversized push, the mail
  server refusing this message with a 5xx `EENVELOPE`/`EMESSAGE`) is recorded in `email_failed_at` / `push_failed_at`,
  logged with ids and codes only, and not retried. A rejected login (EAUTH) is about our setup, not the message, so it
  retries. Each SMTP send has a 60 second overall deadline.
- **`notify()` is idempotent per source event.** A listener passes the event's id; `(organization, source event,
person)` is unique, so a repeat adds no second notification. Requests pass none, and nulls stay distinct.
- **Only active members are notified.** Delivery asks identity's `memberContacts`, which leaves out people who have
  left; staff without email get push and the bell, never an email to their placeholder address.
- **Links are paths inside the web app**, checked by the contract and the table (`notification_link_path`), so a
  notification can't send anyone to another site.
- **Notifications are append-only for the api and worker**, except seven columns: `read_at`, and for email and push
  each its claim, sent marker and failure (`email_claimed_at`, `emailed_at`, `email_failed_at`, `push_claimed_at`,
  `pushed_at`, `push_failed_at`).

## Context

- **Why the worker sends, not the request.** SMTP and push services are slow and fail; the request that caused the
  notification shouldn't wait for them or fail with them. The outbox makes the delivery happen exactly when the change
  commits.
- **Why an SMTP adapter for SES.** SES's SMTP interface needs no SDK and no AWS credentials in the code path, and the
  same adapter runs against Mailpit in tests and locally. An SES API adapter can replace it behind the same port if
  sending volume or bounce handling needs it.
- **Why `fetch` for push.** web-push's own sender only speaks HTTPS through Node's `https` module, which a test can't
  point at a plain local server. Encrypting with web-push and sending with `fetch` lets the tests decrypt the payload
  as a browser would.
- **DPDP.** Opt-outs cover email and push. A one-click unsubscribe (`List-Unsubscribe-Post`) needs a public endpoint,
  which comes with the settings screen (plan 5); until then the header points at the settings page.

## Consequences

- The routers for the bell, the settings and push subscriptions are `notifications.*` (ADR 0026); the settings page
  is `/account/notifications`, where every email's `List-Unsubscribe` points.
- Retention: notifications are kept; a purge, if needed, runs as the platform role.
- A removed member's push subscriptions are deleted by the `notifications.forget-push-subscriptions` listener of
  identity's `staff.removed`, so eventually rather than in the removal's transaction (identity can't call
  notifications, which depends on it). That is harmless: delivery already skips people who have left.
- WhatsApp templates (build step 2) become a third channel with the same opt-out rules.
