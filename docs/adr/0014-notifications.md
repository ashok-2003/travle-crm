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
- **Delivery claims before it sends.** Listeners run at least once, and two deliveries of one event can overlap. Each
  channel is claimed by an atomic update of `emailed_at` or `pushed_at` (only the delivery that finds it empty wins)
  before anything is sent. A failed send releases the claim and throws, so the job retries and sends only what is
  missing. A crash between the claim and the send loses that one email or push rather than repeating it: for a
  notification, a missed message is better than a duplicate, and the bell still has it.
- **Only active members are notified.** Delivery asks identity's `memberContacts`, which leaves out people who have
  left; staff without email get push and the bell, never an email to their placeholder address.
- **Links are paths inside the web app**, checked by the contract and the table (`notification_link_path`), so a
  notification can't send anyone to another site.
- **Notifications are append-only for the api and worker**, except `read_at`, `emailed_at` and `pushed_at`.

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

- The routers for the bell, the settings and push subscriptions come with their screens in plan 5.
- Retention: notifications are kept; a purge, if needed, runs as the platform role.
- WhatsApp templates (build step 2) become a third channel with the same opt-out rules.
