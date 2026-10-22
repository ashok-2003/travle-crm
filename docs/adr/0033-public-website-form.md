# 0033: The public website form

Date: 2026-10-22 · Status: accepted · Applies to the api, the web app and the crm and website-forms modules (spec
`docs/superpowers/specs/2026-10-22-website-form-design.md`)

## Decision

Every agency gets one enquiry form it shares by link (`/f/<key>`) and pastes into its website (`/embed/<key>`). A
visitor's answer becomes a lead through crm's one save path. The routes are plain Hono routes under `/api/public`, not
tRPC; the pages are client-rendered in the web app.

### The abuse model (spec 6)

The design assumes a bot finds the link within a day and that a person with a script can post any header they like.
Cheap checks come first: body size and shape, the key's shape, the rate limits, the form's open state, then the
honeypot, the fill time, the links rule and, when the server has keys, Turnstile (a `BotCheck` port, ADR 0008). The save
is last, in one transaction that re-checks the form is open (W23). What none of these stops: a human typing real
enquiries by hand. The limits there are three enquiries per person in 24 hours (W22) and the per-agency limit.

### The visitor's address, and its known gap (W32-W35)

The forms read the visitor's address by a configured number of hops from the right of `X-Forwarded-For`
(`PUBLIC_FORM_PROXY_HOPS`), because the pilot's proxies are not a fixed list. Sign-in keeps its strict reader. With
too few entries there is no address: the per-address limits are skipped (never one shared bucket) and the agency limit
drops to 20 an hour. **The known gap (W34):** anyone who finds the api's own address can skip the first proxy and send
a forged header, so the per-address limits are advisory for such a caller. What still holds: the agency limit, the
honeypot, the fill time, the links rule, Turnstile and W22. A signed header added by a Vercel function would close the
gap; it is the upgrade if abuse shows.

### The framing exception (W30, F4)

`/embed/*` may be framed by any https site; `/f/*` may not be framed at all. A static header cannot know each agency's
website, the embedded form shows no account data and moves no money, and the agency can switch embedding off. Next's
header rules cannot remove `X-Frame-Options`, so the catch-all rule leaves `/embed` out and `/embed/:path*` gets its own
header set with `frame-ancestors https:` and Turnstile's origins. Neither page registers the service worker, opens
IndexedDB or sets a cookie or `localStorage` key: the root layout renders `AppProviders`, which returns its children
bare under `/f/` and `/embed/` (F3).

### An unverified visitor changes nobody (W18)

Nobody has proved the phone or the email. The person is matched by phone alone; an existing person is never changed
(no missing contact is filled in, the name is not touched) and a differing or held email goes into the lead's note; a
new person gets the email only if no live person holds it. `saveEnquiry` learns `unverified: true` and takes the
kernel's `Actor`, so a `publicActor` (source `public`, no user) can call it (F5). Every non-refusal outcome answers the
same status and body (W20), so the form cannot be used to learn who is a customer.

### The consent ledger (spec 4.3, 7.3)

`person_consent` is an append-only ledger in crm: action `granted` or `withdrawn`, purpose `marketing`, the exact words
shown, their version, the source (`web_form` or `staff`) and the form. The latest row decides. An unticked box records
nothing and never withdraws. The whole feature sits behind `features.marketingConsent`, false until the legal read of
DPDP consent (owner, 2026-10-22). The audit never holds the wording.

### Data

`website_form` (one per organization, turned off by `enabled = false`, no soft delete) and `website_form_submission`
(an append-only ledger of outcomes: ids, outcome names and times, no name, phone, email, message, address or browser
string). The form's key is the organization id (22 characters, base64url) plus 16 random characters (F12). The
migration is additive and is applied by hand before the release (`docs/serverless.md`).

## Rulings

- **F3.** The root layout renders `AppProviders`, which skips the data providers and the service-worker registration
  for `isPublicFormPath(pathname)`. Cost if wrong: a cache or worker on the public page.
- **F4.** `/embed` has its own full header set minus `X-Frame-Options`, and the catch-all rule excludes it.
