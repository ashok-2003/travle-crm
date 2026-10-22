# Website enquiry form: a hosted link and a snippet for the agency's own site

- **Status:** approved by the owner, 2026-10-22: section 0's eight, the mockup, the calls in section 17 and the
  three answers in section 0.1.
- **Date:** 2026-10-22
- **Scope:** Phase 1, release 3, first half: an enquiry form every agency can share by link and paste into its own
  website. Enquiries become leads through the one save path of release 1. The link other tools post to (Zapier, Pabbly,
  Make) moved to after the AI features and is not here.
- **Input:** the Phase 1 product scope (section 3.1), the release 1 spec (people, leads, matching, Returning,
  blocking), the bulk spec (`2026-10-19-bulk-in-and-out-design.md`, "B" for its rules: imports reuse `saveEnquiry`),
  the Sheets spec (`2026-10-19-sheets-sync-design.md`, "S"), ADR 0028 (data rules), `CLAUDE.md`, `DESIGN.md`. An
  earlier unreviewed attempt (commit 38d898f9, reverted) was read for ideas; section 17 lists what this spec does
  differently and why.
- **Mockup:** `2026-10-22-website-form-screens.html`, beside this file. Where it and this text differ, this text wins.

## 0. The owner's decisions

The owner approved these on 2026-10-22; the rest of the document follows them.

1. **Two ways in, one form**: a hosted link per agency (for an Instagram bio, a WhatsApp
   status, a QR) and a small snippet to paste into the agency's own website. Both show the same form from the same
   settings and feed the same lead path.
2. **A fixed set of fields**: name and phone always; email, destination, travel month,
   travellers, budget and a message can each be switched off, optional or required. No custom questions.
3. **One form per agency for now**.
4. **Spam protection**: a hidden trap field, a minimum fill time, limits per visitor
   address and per agency, and optional Cloudflare Turnstile (free) that the owner switches on later by setting two keys.
   It needs the api to know the real visitor address behind Render and Vercel, which section 6.2 settles with a
   configured number of proxy hops, for the forms only.
5. **An optional "Send me offers" tickbox**, unticked by default, kept per person with the
   words the person saw.
6. **The agency's look**: its logo, name and brand colour from its Business profile on the
   hosted form; a thank-you message the agency writes; an optional "go to my website" link afterwards.
7. **The same rules as every lead**: one person per phone, a repeat enquiry lands on the
   open lead, Returning, blocked contacts left out quietly (the visitor still sees "thank you"); source "Website form";
   the agency Owner owns the lead and gets the usual new-lead notice; the subscription's state and the plan's modules
   apply, so a lapsed agency's form says it is unavailable.
8. **English only**: the form's own words are English; what the agency writes (heading,
   thank-you) and what visitors type may be in any script.

### 0.1 The owner's three answers (2026-10-22)

1. **Any https website may embed the form** (W30, as written).
2. **"Send me offers" stays off until a legal review.** Build it (W25-W27, 3.9, 7.3), but behind
   `features.marketingConsent = false` in `packages/contracts/src/features/index.ts`, as `automaticAssignment` is:
   while it is false the form's page shows no consent switch, the form never shows the tickbox, and the api refuses
   `consent` in a submission's input. Tests turn it on with `vi.mock("@travel-crm/contracts/features", ...)`; journeys
   follow the constant. Turning it on is the owner's call once someone who knows India's data protection law has read
   the wording.
3. **The stronger address protection (a Vercel function that signs the visitor's address) waits** until real abuse
   shows (6.2, call 5 in section 17).

## 1. Why this feature

An agency's website, its Instagram bio and its WhatsApp status all say "send us an enquiry". Today the visitor is sent
to a phone number or a Google Form, and the enquiry reaches the CRM late or never. This feature gives each agency a form
that is the CRM's own: an answer is a lead in seconds, with an owner, a notice and the source "Website form", and the
person is matched against everyone the agency already knows.

**Goals**

- An Owner turns the form on, copies the link or the snippet and has a working, branded form in under five minutes.
- A visitor on a phone fills it in under a minute: two required fields, the rest optional by the agency's choice.
- **No duplicates and no leaks:** a visitor who is already a customer gets a repeat enquiry on their open lead, and
  sees exactly the same "thank you" as anyone else. The form never reveals who is in the CRM.
- **Spam stays out without losing real people:** every check that could wrongly stop a person tells them what to
  do; only the bot trap is silent.
- A lapsed or read-only agency's form says it is unavailable, never a thank-you for an enquiry nobody will see.

**Non-goals (later, or never)**

- Custom questions, several forms per agency, the form in Hindi or any other language (all later).
- The link other tools post to, the REST API, Meta lead ads, WhatsApp, package-page enquiries.
- Verifying the visitor's phone with a code. An unverified phone is trusted only as far as section 4.3 says (W18).
- Sending any marketing. The tickbox only records consent; nothing in Phase 1 sends offers.
- Showing the form's answers in a report (the lead's source already does that).

**Anti-goals:** a visitor altering an existing customer's record; a form that lets anyone create catalog destinations;
a stranger's site able to read or post through our form with cookies; one noisy visitor locking every agency out; a
thank-you for an enquiry that was never saved.

## 2. Who uses it

- **Setting up the form** (turn on and off, fields, look, thank-you, the link and snippet): whoever holds both
  `leads:create` and `settings:manage` (the Owner, and the Admin starter role). The form decides no owners, so the
  Sheets rule (`leads:assign`) is not needed; it speaks publicly in the agency's name, which is what
  `settings:manage` guards.
- **Visitors:** anyone with the link, signed in to nothing, on a phone or a computer.
- **The agency Owner** gets the new-lead notices like for any lead, and the flood notice (W40). Other staff see the leads
  with source "Website form" like any lead; they do not see the form's settings.
- **Platform staff** see nothing new but the form's count on an organization's page.

## 3. The screens

Built from the registry components and the shared pieces (`CLAUDE.md`), mobile first, each with loading, empty,
error-with-retry and refusal states. A change's button asks `useWriteAccess("change")`; **Turn off** and **Change the
link** ask `useWriteAccess("revoke")`, so they stay open while the agency is read-only (the form itself is already
closed to visitors then, W6). Words in `website-form.json`.

### 3.1 Lead sources gains a row

The Sheets spec's page `/settings/lead-sources` lists the later sources: a second section, **Website form**, with one
`Item`: the form icon, "Enquiry form", "Open to anyone with the link" or "Off", and a `StatusBadge` (**On** green,
**Off** neutral, **Unavailable** amber when the agency's state or plan closes it). The item links to the form's page.

### 3.2 The form's page

`/settings/lead-sources/website-form`: `BackLink` to Lead sources, `PageHeader` "Website form" with the sentence "A
form you can share or put on your website. Every enquiry becomes a lead for {Owner's name}." Then, in this order:

1. **Status** (`Card`): a `Switch` "Take enquiries from the form" (on turns it on at once; off asks nothing). Under it
   one line in the state's words: "On. Anyone with the link can send an enquiry." / "Off. The link shows a short
   message." / "Closed. Your subscription is read-only, so the form isn't taking enquiries. They start again when you
   pay." (`Alert`, W6). Never shown to visitors.
2. **Share** (`Card`):
   - **Link:** a read-only `InputGroup` with the hosted address, `CopyButton`, **Open** (new tab), and **Change the
     link** (outline, `ConfirmDialog`: "Change the link? The old link and any form already on your website stop working
     at once. You will have to paste the new snippet.").
   - **On your website:** a `Switch` "Allow my website to show this form" (on by default) and **Copy the snippet**
     (opens 3.3).
   - A line under both: "Try it yourself: open the link, send an enquiry with your own number, then mark the lead Not
     a lead."
3. **Fields** (`ItemGroup`): **Name** and **Phone** ("Always asked"), then for each of **Email**, **Destination**,
   **Travel month**, **Travellers**, **Budget** and **Message** a `Select` of **Off**, **Optional**, **Required**. The
   last item is a `Switch` "Ask for permission to send offers" with the sentence visitors will see under it (W25).
   Only Name and Phone are ever needed.
4. **Words** (`Card`): **Heading** ("Plan your trip with Sharma Travels" if empty), **Introduction** (optional, 200
   characters), **Thank-you message** (a `Textarea`, 500 characters, default "Thank you! Sharma Travels will get in
   touch with you soon."), **Website link and button text** ("Back to our website", an https address; optional) and
   **Privacy policy link** (https; optional; shown under the button).
5. **Look** (`Details`): the logo, name and colour the form uses, read from the Business profile, with **Change in
   Business profile** (`TextLink`) and the line "Your colour is used for the Send button. Colours that are too light for
   white text fall back to our blue." With no logo the form shows the agency's name in text.
6. **Preview:** **Preview** (outline) opens the form as visitors see it with the unsaved settings (3.4).
7. **Last 30 days** (`Card`s, mono numbers): **Enquiries** (new leads and repeat enquiries), **New leads**, **Repeat
   enquiries**, **Stopped** (spam, blocked contacts and repeats beyond the limit, W22), each with an `InfoHint`. A line:
   "Stopped enquiries are never saved, so we can't show them."

**Save** (primary, sticky at the bottom on a phone) saves 3, 4 and the website switch; it is disabled with its hint
(`WriteHint`) while read-only, and when nothing changed. Leaving with unsaved changes asks once.

### 3.3 The snippet

`ResponsiveDialog` (a bottom sheet on a phone) "Put the form on your website", `Tabs`:

- **Script (recommended):** `<script src="https://app.example/embed.js" data-form="{key}" async></script>` in a code
  block with `CopyButton`, and "Paste it where the form should appear. It sizes itself to the form."
- **Iframe:** `<iframe src="https://app.example/embed/{key}" title="Enquiry form" width="100%" height="760"
  style="border:0" loading="lazy"></iframe>`, with "Use this if your website builder won't accept scripts. Give it
  enough height for the form."

A third line for both: "Works in Wix, WordPress, Squarespace, Webflow and plain HTML. Your visitors don't need an
account." (The script and the iframe show the same page: W31.) With **Allow my website to show this form** off, the
dialog says the snippet is off and offers the switch.

### 3.4 Preview

`ResponsiveDialog` titled "Preview", full screen on a phone, with a `ToggleGroup` **Phone · Computer** that sets the
frame's width (390 or 960). The form is the visitors' own component, in the same frame and colour, filled with sample
text, with **Send** disabled and the line "Preview. Nothing is sent." The destinations are the agency's own.

### 3.5 The hosted form

`/f/<key>`, no sign-in, no navigation. A centred column (max width 560) on the canvas on a phone; on a computer a card on
the surface tone. Top to bottom:

- The agency's logo (height 40) and name, or the name alone. The heading (`h1`, the Garamond page title) and the
  introduction.
- **Your name** and **Phone** (`PhoneField`, +91 first, other countries from the list); then, in this order and as the
  agency set them: **Email**; **Where would you like to go?** (a `Select` of the agency's destinations with **Somewhere
  else**, which opens a text field); **When?** (a `Select` of the next twelve months, **I'm flexible**, **Not sure
  yet**); **Travellers**: adults (a stepper, 2 by default) and children (a stepper, 0), and when children is above 0,
  a `Select` of ages for each; **Budget** (`MoneyField`, in rupees, and a `Select` **for everyone / per person**);
  **Anything else we should know?** (a `Textarea`, 1,000 characters, with a count).
- The **offers tickbox** when on: "Send me travel offers and updates from Sharma Travels." (`Checkbox`, unticked), W25.
- **Send enquiry** (primary pill, 44px, the agency's colour; full width on a phone). Under it, small: "Your details
  go to Sharma Travels, who will contact you about this enquiry." and the privacy link if the agency set one.
- The Turnstile widget above the button when the server has keys (W39).
- A hidden field, invisible to people and to screen readers (W36).

Errors sit under the field (the contract's sentences, `checked`); a refusal from the server shows in one `Alert` above
the button with the reason's sentence (W41). While sending, the button shows a spinner and "Sending…". After 15
seconds: "Still sending. Please keep this page open." (the pilot's api sleeps, W42).

### 3.6 After sending

The form is replaced in place (no navigation, so it works inside an iframe): a check icon, the agency's thank-you
message, and, when the agency set one, a **button** to its website (`target="_top"` in the embed, so the visitor leaves
the frame, not just the box). A second enquiry needs a reload. The same screen follows every outcome that is not a
refusal (W20).

### 3.7 The embedded form

`/embed/<key>`: the same component with no outer padding, a transparent background and no card, so it takes the look of
the page around it, within the agency's colour. It posts the form's height to its parent whenever it changes (W31). On
a phone it is full width; the thank-you replaces the form in the frame.

### 3.8 When the form can't be used

The page, in the same frame and with the agency's name and logo: **Off, closed by the subscription, plan without the
module, or the demo** all show one sentence, "This form isn't taking enquiries right now.", and the agency's website
button if set. It never says why (a visitor must not learn that an agency has not paid). A key that does not exist (or
the old one, after Change the link) shows "This form link doesn't work any more." with no name and no logo.

### 3.9 Consent on the person

On a lead, in the person's card (release 1 section 3.4): when the person has agreed to offers, a line "Agreed to offers
on 22 Oct, from the website form" (`Details`), and **Record that they stopped** (ghost; `leads:edit`; `ConfirmDialog`),
because a person may ask by WhatsApp. When they have not: nothing is shown. A person who withdrew shows "Asked to stop
offers on 3 Nov" and nothing else.

## 4. How it behaves

### 4.1 The form and its settings

- **W1. One form per agency, off until turned on.** The row is made by the first **Save** or **Turn on** (opening the
  page writes nothing; a page with no row shows the defaults). A unique key on the organization allows one form now.
- **W2. A fixed core.** Name and Phone are always asked and always required. Email, Destination, Travel month,
  Travellers, Budget and Message are each **off**, **optional** or **required**. Defaults: Email optional, Destination
  optional, Travel month optional, Travellers optional, Budget off, Message optional, offers tickbox off.
- **W3. The form's words are fixed.** Labels, hints and errors are ours and English (owner, item 8). The agency edits
  the heading, introduction, thank-you, website button text, and privacy link only; each is plain text, cut to its
  length, with no HTML (shown as text everywhere).
- **W4. The links.** The hosted address is `<APP_URL>/f/<key>` and the embedded one `<APP_URL>/embed/<key>`. The key is
  the organization's id (22 characters, in the clear, as a share link's token has) followed by 16 random characters
  from `A-Za-z0-9_-` (96 bits), 38 in all. The id lets the api open the right organization with `forOrg()` with no lookup
  across organizations. The random part is not a secret for authentication: the link is public by purpose, and it is
  stored plainly so the Owner can copy it again. It only stops guessing a form that was never shared, and lets the
  Owner replace it.
- **W5. Change the link** writes a new random part. The old key stops working at once (`FORM_NOT_FOUND`), for the
  hosted link and every pasted snippet. The audit entry holds no key.
- **W6. When the form is closed.** A visitor's page and submission both check, inside the organization, that: the form
  row exists and its random part matches; **Take enquiries** is on; the organization is not on the demo plan; the
  subscription's access is `full` (check 2 of ADR 0021 for a call that changes: read-only, suspended and cancelled all
  close the form); and the `crm` plan module is on the plan (check 3). Any failure but a wrong key answers
  `available: false` to a view, and `FORM_UNAVAILABLE` (403) to a submission, with the same sentence for all of them
  (3.8). A wrong key is 404 `FORM_NOT_FOUND`. The same function, `assertFormOpen`, serves both and the settings page
  (which names the reason to the Owner).
- **W7. Who gets the lead.** The agency Owner is identity's `firstOwner`, found afresh for each enquiry. If there is none
  (an organization with no active Owner), the form is closed (`FORM_NEEDS_OWNER`) and the settings page says so.
  Automatic assignment is switched off until release 4's rules are on; the enquiry passes `assign` like an import
  whose owner is only the fallback, so the agency's rules and mode apply the day they exist and change nothing now.
- **W8. The destinations offered** are the agency's live destinations: the 100 with the most leads, then by name. A
  visitor chooses one (sent as its id, checked inside the organization) or **Somewhere else** and types up to 80
  characters. **The form never creates a destination.** A typed name that equals a live destination ignoring case and
  surrounding spaces is that destination; any other becomes a line in the note (W12) and the lead has no destination.
- **W9. Travel month.** The twelve months from this month in the agency's time zone, stored as the trip's "month"; **I'm
  flexible** is "flexible"; empty or **Not sure yet** is "unknown" (the trip's `when`).
- **W10. Travellers.** Adults 1 to 20 (2 by default), children 0 to 10 with an age 0 to 17 for each (the lead stores
  ages, not a count). Asked together as one field.
- **W11. Budget.** Whole rupees, at least 1,000 and at most 1,00,00,000 (₹1 crore) for the public form, with the basis
  "for everyone" (default) or "per person"; stored in paise as `Money`.
- **W12. The note.** The lead's first note is the visitor's message, then one line for each of these that exist:
  "Destination asked for: Spiti Valley" (W8's typed name), "Email given: …" (when W18 keeps it off the person). Plain
  text, 4,000 characters at most. This is what the Owner reads first on the lead.
- **W13. Name and phone.** The name: 1 to 120 characters in any script, trimmed, no control characters, not a web
  address. The phone: the kernel's `phoneNumber` (stored E.164, +91 by default, other countries allowed). An email is the
  contract's email. A value that fails is an error under its field.

### 4.2 A submission becomes a lead

- **W14. Source.** `web_form` ("Website form"). The source detail is "Hosted link" or the embedding site's host
  ("sharmatravels.in"), whichever the page reports (cosmetic, taken from the page's `document.referrer`, checked as a
  host name, 80 characters; anything else is "Embedded").
- **W15. Stage and date.** A new lead is New, dated at the moment the api received it (UTC), so "waiting for a reply
  since" is true.
- **W16. The save.** One transaction in the organization's `forOrg`, by the agency Owner's access resolved afresh as the
  actor `public`: the blocked check (W19), then `saveEnquiry` with the import option
  `{ from: "import", stage: "new", notify: "each", assign }` and one new option **`unverified: true`** (W18). So: the
  person is found by phone; a person with an open lead gets the enquiry as a **repeat enquiry** on it (release 1,
  B15); a known person whose leads are all closed gets a new lead marked **Returning**; anyone else is a new person and
  a new lead. The notices are the usual ones (section 9).
- **W17. The save path is the only path.** The route calls crm's `receiveWebsiteEnquiry`, which calls `saveEnquiry`;
  no table is written around it. The form needs `saveEnquiry` to accept the system actor (`userId` null, the lead's
  `createdBy` null); the builder types that narrowly and adds nothing beyond it.
- **W18. An unverified visitor changes nobody.** Nobody has proved the phone or the email. So for the form:
  - the person is matched by **phone alone**, not by an email that another person holds;
  - for a person who already exists, **nothing on the person is changed**: no missing email or handle is added, the
    name is not touched; a differing email goes into the note (W12);
  - for a new person, the email is added only if no live person holds it, else it goes into the note.
  `unverified: true` makes `saveEnquiry` skip `fillMissingContacts` and pass the matching rule above. (Staff can add the
  email by hand from the note.)
- **W19. Blocked contacts** (release 1; B16): an enquiry whose phone or email is on the blocked list is not saved. The
  visitor sees the thank-you (W20); the ledger records `blocked` (W22). No notice, no lead.
- **W20. One answer for everything.** A new lead, a repeat enquiry, a blocked contact, a repeat beyond the limit
  (W22), a duplicate submission (W21) and a tripped honeypot (W36) all answer `201 { ok: true }` with the same body,
  after the same work as far as it can be the same. Nothing in the answer depends on what the CRM already holds, so the
  form can't be used to find out who is a customer.
- **W21. Sending twice is harmless.** The page makes a random `submissionId` (UUID) when it loads and sends it with
  every attempt. A second attempt with the same id (a double tap, or the retry after a sleeping server) finds its
  ledger row, answers as the first did and saves nothing. The row is made in the same transaction as the lead, so
  a crash between them is impossible.
- **W22. At most 3 enquiries per person in 24 hours.** A fourth enquiry for the same person (counted from the ledger's
  `person_id` and time) is not saved and shows the thank-you (`duplicate`). This stops a visitor, or a script that
  knows a phone, from filling a lead's timeline and its Owner's notices. It is the same for an exact repeat.
- **W23. Entitlements inside the transaction.** The open-form check of W6 runs in the same transaction as the save, so a
  subscription that ended a moment ago is honoured. A save that finds a unique violation (someone added the same phone
  meanwhile) runs the transaction once more, as B26 does.
- **W24. Nothing is hidden from the audit.** The lead and person are audited as by hand, with the actor
  `public` and the form as the detail (section 9).

### 4.3 Consent

- **W25. "Send me offers."** Behind `features.marketingConsent`, false until a legal review (0.1). Off by default (the agency switches it on, W2). When on, the form shows an unticked
  `Checkbox` with the words "Send me travel offers and updates from {agency name}." and, once ticked or not, nothing
  else changes. Ticking records consent in the person's ledger (7.3): the action "granted", the purpose "marketing",
  the **exact words shown**, the source `web_form`, the form's id and the time. An unticked box records nothing and
  never withdraws an earlier consent. The wording is one constant in the contracts with a version, and the ledger keeps
  the text itself, so a later edit of the sentence cannot rewrite what a person agreed to.
- **W26. Whose consent.** Consent is recorded for the person the enquiry landed on, on the phone the visitor gave.
  Because the phone is unverified (W18), the Owner treats the tick as a request, not proof, until the person replies.
  The person's card says "from the website form" so nobody mistakes it for something said on the phone.
- **W27. Withdrawing** is recorded by staff (3.9) as the ledger's "withdrawn"; the latest row decides. A new tick
  after a withdrawal grants again. Nothing in Phase 1 reads the ledger to send anything, so there is nothing to stop.

## 5. Where it runs, and what the browser may do

### 5.1 The routes

- **Pages (the web app):** `/f/[key]` (hosted) and `/embed/[key]` (embedded), and the static `/embed.js`. They are
  client-rendered: the shell holds no organization data, and the page asks the api for the form
  (`GET /api/public/website-forms/<key>`). This works through the api's cold start (W42) and keeps the service worker
  and the offline cache out of it: both prefixes join the service worker's exclusions and the sign-in guard's public
  list (the way `/p` does for the api). Best effort, a server-side `generateMetadata` asks for the agency's name with a 2
  second limit so a shared link previews as "Plan your trip with Sharma Travels"; if the api is asleep it previews
  generically. Both pages are `noindex`.
- **The api (public, no sign-in, plain Hono routes beside `/api/public/plans`):**
  - `GET /api/public/website-forms/:key` returns `{ available, form }`: the settings, the agency's name, the logo as
    a short-lived presigned link (1 hour), the colour pair, the offered destinations, and the `openedToken` (W37);
    `Cache-Control: no-store` (the state must be exact).
  - `POST /api/public/website-forms/:key/enquiries` takes the enquiry (section 7.4's contract).
  - `GET /api/public/client-address` shows a visitor their own counted address (W33), for setting the proxy hops.
  They are under `/api/*`, which both the Vercel rewrite and the Caddy file already send to the api, so no routing
  change is needed. The pages are in the web app, which the load balancer's default rule already sends everything
  else to (the deploy checklist's routing table gets the three paths, section 16).

### 5.2 Cross-site requests

- **W28. Same origin by design.** The hosted page and the iframe's page are both served from the app's origin, so their
  calls to the api are same-origin whoever embeds the frame. The api therefore sets **no CORS headers** on these routes
  (a script on another site can neither read the form nor post to it from a browser), and the POST requires what
  every other mutation does: an `Origin` that is the app's trusted origin and a JSON body (`requireTrustedJson`'s
  checks, reused, applied to this route). That stops a browser on another site from posting. It does not stop a
  script that forges `Origin`; that is abuse, and section 6 handles it.
- **W29. No cookies, no storage.** The form reads and sets no cookie and uses no `localStorage` (third-party frames
  often can't), so there is no session to forge and nothing for CSRF to ride on.

### 5.3 The content security policy and framing

The web app's headers (`security-headers.ts`) say `frame-ancestors 'none'` and `X-Frame-Options: DENY` for every page.
The form needs its own rules, added to `securityHeaderRules` after the catch-all (later rules win):

| Route          | `frame-ancestors`                          | `X-Frame-Options`        | Also allowed                                  |
| -------------- | ------------------------------------------ | ------------------------ | --------------------------------------------- |
| `/f/*`         | `'none'` (unchanged)                       | `DENY` (unchanged)       | Turnstile's three origins (below)             |
| `/embed/*`     | `https:` (any https site; `http:` is not)  | removed (it has no allow-from) | Turnstile's three origins; `Referrer-Policy: strict-origin` |
| `/embed.js`    | not a page                                 | n/a                      | `Cache-Control: public, max-age=3600`, CORS not needed (a script tag) |

- **W30. Why any https site may frame `/embed/*`.** The agency's website address is not known to the headers (a static
  rule can't read the database), and a per-agency list would need the api on every page view. The risk of a hostile
  site framing a form is a visitor tricked into sending an enquiry to a travel agency: no session, no data shown, no
  money. The agency can still switch embedding off (`allow_embed`, W6).
- **Turnstile's origins**, added to these two routes only and only in the page's CSP: `script-src` and `frame-src` and
  `connect-src https://challenges.cloudflare.com`. Nowhere else changes.
- `img-src` already allows the storage origin (the logo); `connect-src 'self'` covers the api calls.
- **W31. The snippet.** `embed.js` is a static file of under 2 KB with no dependencies. It finds its own `<script>` tag,
  reads `data-form`, validates it against the key's shape, inserts an `iframe` (`title="Enquiry form"`, `loading="lazy"`,
  width 100%, no border) pointing at `/embed/<key>` on the script's own origin, and listens for `message` events only
  from that origin and that frame, to set the iframe's height from `{ type: "travel-crm-form:height", height }`. It
  reads nothing from the page and sends nothing out. A test loads it in jsdom.

## 6. Abuse and spam

The earlier attempt had none of this. The design assumes a bot finds the link within a day, and a person with a script
can post with any header they like. What each layer does and does not stop is stated, so the Owner can judge.

### 6.1 Order of checks (cheap first)

1. Size and shape: the body is read to at most 16 KB, must be JSON, and must pass the contract (a strict object:
   an unknown key is a 400).
2. The key's shape (no database).
3. **Rate limits** (6.3). Every attempt counts, including the rejected ones below.
4. The form row and W6's availability (one indexed read).
5. **Honeypot** (W36), **fill time** (W37), **links** (W38).
6. **Turnstile**, when the server has keys (W39). A network call, made outside any transaction.
7. The save (4.2), in one transaction.

### 6.2 The visitor's address, behind Render and Vercel

The existing limiter reads the client address from a header only when the load balancer overwrites it with one address, or
from the right of a header when `AUTH_TRUSTED_PROXIES` lists the proxies' addresses (ADR 0006, `rate-limit.ts`). On the
serverless pilot neither works: Vercel's egress addresses are not a fixed list, and the api sees only Vercel's side. So
today every visitor shares one bucket (`docs/serverless.md`). The forms need better, without loosening sign-in.

- **W32. A configured number of hops, for the forms only.** A new setting `PUBLIC_FORM_PROXY_HOPS` (an integer 1 to 5,
  unset by default). Read the first header named in `AUTH_IP_ADDRESS_HEADERS` (`x-forwarded-for`), split on commas.
  With `k` entries and `N` hops the visitor is entry `k - N` counting from the left (the entries added by our own
  infrastructure are the last `N`), and it must be a valid IP; with fewer than `N + 1` entries, or an invalid one, the
  result is "no address". Whatever a visitor sent sits to the left of the entries our infrastructure adds, so it can
  never be the one read, as long as every proxy appends rather than replaces and the number of them is constant.
  IPv6 is counted as its /64, as today. Unset, the forms use the same address as sign-in does (so the Oracle pilot, whose
  Caddy replaces the header with one address, needs nothing).
- **Sign-in is untouched.** It keeps its strict rule (one shared bucket on the serverless pilot) because a spoofable
  address would let a script dodge a sign-in lock; here the cost of a wrong address is a spam limit that bites less.
- **W33. Measure it, don't guess.** I could not check Render's and Vercel's exact behaviour from here. `GET
  /api/public/client-address` returns `{ address, entries, hops }`: the address the api would count for the caller, how
  many entries the header holds, and the setting. The owner's steps (section 15) use it to pick the number, and a
  journey calls it with a forged header.
- **W34. The known gap.** Anyone who finds the api's own Render address can skip Vercel and send their own header; the hop
  rule then reads the forged value. Per-address limits become advisory for such a caller. What still holds against them:
  the per-agency limit, the honeypot, the fill time, the links rule, Turnstile, and W22. A signed header added by a
  Vercel function would close the gap; it is the upgrade if abuse ever shows (decision 6).
- **W35. No address at all** (the hops unset on Render/Vercel, or a header missing): the per-address limits are skipped,
  not shared (one shared bucket would let one bot lock every visitor of every agency out); the per-agency limit
  drops from 60 to 20 an hour; one line is logged once per process, and the settings page nudges the Owner to ask the
  platform to turn Turnstile on.

### 6.3 Limits

Counted with the existing Postgres limiter, one bucket per name and key, keyed hashes as ever. All numbers are
constants in one file (`packages/domain/src/website-forms/limits.ts`).

| Name                  | Key                  | Limit               | Why                                        |
| --------------------- | -------------------- | ------------------- | ------------------------------------------ |
| `form-view`           | address              | 60 per minute       | a page load makes one call                 |
| `form-submit-agency-visitor` | agency + address | 3 per 10 minutes | a family retries; a bot doesn't get more   |
| `form-submit-visitor` | address              | 10 per hour         | one address spraying every agency          |
| `form-submit-agency`  | agency (organization)| 60 per hour (20 with no address) | a flood can't fill an Owner's day |
| `client-address`      | address              | 20 per minute       | a diagnostic page                          |

A refusal is 429 with `Retry-After` and the sentence "Too many tries. Please wait a few minutes." A busy agency
legitimately peaking above 60 an hour is not expected (a viral reel is a few hundred a day); the constant is the
first thing to raise. Each agency has its own buckets, so one agency's flood is only its own.

### 6.4 The traps

- **W36. Honeypot.** The body has a field named `homepage`, rendered in the page as an ordinary text input kept off
  screen (not `display: none`, which some bots skip), `tabindex="-1"`, `autocomplete="off"`, inside an `aria-hidden`
  wrapper with no visible label, so no person sees or reaches it. If it holds anything, the submission is dropped
  (`spam`, honeypot) and the visitor sees the thank-you (W20): a bot is told nothing. The name is not one browsers
  autofill (`homepage`, not `website` or `nickname`); the Stopped count shows if it ever bites people.
- **W37. Minimum fill time.** `GET` hands out `openedToken`: the form's id and the moment, signed with an HMAC-SHA256
  under a key derived from `BETTER_AUTH_SECRET` with a fixed label (no new secret to set). A submission less than 2
  seconds after that moment is refused with `FORM_TOO_FAST` ("Please check your details and press Send again.") - a
  person who is faster than two seconds (autofill) simply presses Send again, and passes. A token older than 24 hours
  is `FORM_EXPIRED`: the page fetches a new one itself and sends again, unseen. A token for another form is refused.
- **W38. Links.** A message with more than two web addresses (`http://`, `https://`, `www.`) or an HTML tag is refused
  with `FORM_LINKS_NOT_ALLOWED` ("Please take the web links out of your message."). A person can fix it and send again.
  The name and the typed destination may hold no web address.
- **W39. Cloudflare Turnstile, optional and server-wide.** With `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` both
  set, `GET` includes the site key, the page shows the widget (managed mode: most people see nothing), and the submission
  carries its token. The api checks it with Cloudflare's `siteverify` through a `BotCheck` port (ADR 0008): a real
  adapter, and an in-memory one for tests. A "no" is `FORM_BOT_CHECK_FAILED` ("We couldn't tell you are a person. Please
  try again."; the widget resets). **If Cloudflare can't be reached or answers an error, the enquiry is accepted**
  (fail open: a lost enquiry costs an agency more than a spam lead), the rest of the layers still apply, and the lapse is
  logged. Without keys the widget isn't shown and nothing is checked. The visitor's address is sent to Cloudflare for
  the check (their widget already sees it); the form's privacy line does not mention it, and the owner's checklist
  notes it. Turnstile sits on the app's own origin, so one widget configuration covers every agency, embedded or not.
- **W40. A flood is told once.** When the per-agency limit refuses, the Owner gets one notice an hour ("Your website form
  is getting more enquiries than usual, so we have slowed it. Check the Stopped count."), kind `form.busy`, through
  `notify()` with a source event id that is the hour.

### 6.5 What the visitor sees

**W41.** Every refusal is a sentence under the form, keeps what they typed and the same `submissionId`: too fast, links, bot
check failed, too many tries, closed (3.8), and "Something went wrong on our side. Please try again in a minute."
for a 5xx, with an automatic single retry after the cold-start wait. Only the honeypot is silent.

## 7. Data

All three tables are organization tables (ADR 0028): `organization_id`, row-level security (`SELECT
app_enable_org_rls('<table>');` in the migration that creates each), keys and unique constraints including
`organization_id`, UUID v7 ids, `ON DELETE RESTRICT ON UPDATE RESTRICT`, an isolation fixture each in
`packages/db/test/org-table-fixtures/website-forms.ts` (the ledgers `appendOnly`). Money is `BigInt` paise.

### 7.1 `website_form`

One row per organization (a unique key on `organization_id` today; the later several-forms release replaces it).

- `id`; `key_secret` (16 characters, CHECK the shape); `enabled` (boolean, default false); `allow_embed` (boolean, default
  true); the six field modes as text columns CHECKed to `off | optional | required`: `email_mode`, `destination_mode`,
  `travel_month_mode`, `travellers_mode`, `budget_mode`, `message_mode`; `offers_tickbox` (boolean).
- `heading` (80), `introduction` (200), `thank_you_message` (500), `website_url` (https, 300, CHECK), `website_button_text`
  (40), `privacy_url` (https, 300, CHECK); all nullable text with length CHECKs.
- `key_changed_at`; created and updated (time and member). No soft delete: turning off is `enabled = false`.
- The brand colour, name and logo are **not copied**: they are read from the organization's profile and its newest ready
  `organization_logo` attachment when the form is shown, so they cannot drift.

### 7.2 `website_form_submission` (the ledger, append only)

One row per submission that got as far as the ledger (W21, W22): `form_id`, `submission_id` (the page's UUID; unique with
`organization_id`), `outcome` (CHECK: `new_lead`, `repeat_enquiry`, `blocked`, `duplicate`, `spam`), `reason` for spam
(`honeypot`; the checks that ask the visitor to retry never reach the ledger), `lead_id` and `person_id` (nullable,
composite keys with `organization_id`), `created_at`. **It holds no name, phone, email, message, address or browser
string.** Indexes: `(organization_id, form_id, created_at)` for the last-30-days counts and `(organization_id, person_id,
created_at)` for W22. The console's hourly sweep deletes rows older than 90 days (platform role; the runtime role has
no update or delete).

### 7.3 `person_consent` (the ledger, append only; owned by crm)

`person_id`, `purpose` (CHECK `marketing`), `action` (CHECK `granted | withdrawn`), `wording` (the exact sentence shown,
300), `wording_version` (integer), `source` (CHECK `web_form | staff`), `source_form_id` (nullable), `recorded_at`,
`recorded_by` (nullable member; null for the form). The latest row per person and purpose is the current state; an index
on `(organization_id, person_id, recorded_at desc)`.

### 7.4 Contracts (`@travel-crm/contracts/website-forms`)

Strict input schemas; outputs strip. `websiteFormSettings` (the 7.1 values, with the modes), `websiteFormPublic` (what
`GET` returns), `websiteEnquiry`: `submissionId`, `openedToken`, `via` (`hosted | embedded`), `embeddedOn` (host, optional),
`homepage` (string, may be empty), `turnstileToken` (optional), `answers` (`name`, `phone`, `email?`, `destination?`
(`{ kind: "existing", destinationId }` or `{ kind: "typed", text }`), `travelMonth?` (a month, `"flexible"` or null),
`adults?`, `childrenAges?`, `budget?` (`{ rupees, basis }`), `message?`, `offers?`). The server checks the answers
against the form's current modes (a required field missing is `VALIDATION`, an `off` field present is ignored). The
consent wording and its version are constants here. New actor source `public` and the audit CHECK that lists sources (the
builder finds it) gain it; the lead `source` list already has `web_form`.

## 8. Modules, permissions, api

- **`website-forms` (a new domain module, L0):** the settings, the key, `assertFormOpen`, the ledger and its counts, the
  limits. It imports no crm. **crm (L1)** gains `receiveWebsiteEnquiry` (W16-W24) and the consent ledger
  (`recordConsent`, `withdrawConsent`), so crm calls `website-forms` and never the reverse, as `sheets` and crm do.
- **Permissions:** the form's procedures are `orgProcedure.requires("leads:create", "settings:manage")` (the first names the
  plan module `crm`; both are checked). Record that a person stopped offers: `leads:edit`.
- **Procedures** (tRPC, `websiteForm.*`): `get` (view), `save` (change: fields, words, embed), `turnOn` (change),
  `turnOff` (revoke), `changeLink` (revoke), `preview` (view; the same payload visitors get, from the unsaved
  settings), `counts` (view). `people.consent` and `people.withdrawConsent` in crm's router.
- **The public routes** are not tRPC: `apps/api/src/website-form-routes.ts`, with the rate limits of 6.3, the trusted-origin
  check of W28 and the body limit, built with the same dependencies as the other public routes.
- **Reasons** (each with its visitor-readable sentence in `errors.json`): `FORM_NOT_FOUND`, `FORM_UNAVAILABLE`,
  `FORM_NEEDS_OWNER`, `FORM_TOO_FAST`, `FORM_EXPIRED`, `FORM_LINKS_NOT_ALLOWED`, `FORM_BOT_CHECK_FAILED`, `FORM_LINK_INVALID` (a
  website or privacy address that is not https).
- **Web:** `apps/web/src/website-form/` (the form, shared by the hosted page, the embed and the preview),
  `apps/web/src/lead-sources/website-form/` (settings), routes `/f/[key]`, `/embed/[key]`, `/settings/lead-sources/website-form`,
  and `public/embed.js`. The form is a client component built from `useCheckedForm`, `TextField`, `PhoneField`,
  `SelectField`, `MoneyField`, `FormField`, `Checkbox`, `Alert`; settings from `Card`, `Item`, `Switch`, `Select`,
  `Tabs`, `ConfirmDialog`, `ResponsiveDialog`, `CopyButton`, `PageHeader`, `StatusBadge`, `WriteHint`, `Details`.
- **The agency's colour** is applied by setting shadcn's own `--primary` (and `--primary-foreground`, `--ring`) on the form's
  wrapper from data, not by recolouring a component with a class, so the owner's rule 2 holds. The api returns the colour
  and an ink: white or near-black, whichever reaches 4.5:1 on it; if neither does, or the colour is missing, the
  product's blue (`null`). The no-colour-literals test is not hit: the value is data.
- **Words:** `website-form.json` (settings and visitor screens), `errors.json`, `audit.json`, `kinds.ts` (`form.busy`), `lead
  .source.web_form` already worded "Website form".

## 9. Audit and notifications

- **Audit** (`recordAudit`, record type `website_form`, each action with its sentence in `audit.json`): `website-form.turned-on`,
  `.turned-off`, `.fields-changed`, `.words-changed`, `.embed-changed`, `.link-changed`; and `person.consent-recorded` /
  `person.consent-withdrawn`. Snapshots hold the modes and flags, never the key and never the agency's text beyond its length.
- The leads the form makes are audited exactly as by hand (`person.added`, `lead.added`, `lead.repeat-enquiry`), with the actor
  source `public` ("the website form") and the form's id as the detail. Stopped enquiries are not audited; the ledger counts them.
- **Notifications** (`notify()`, bell, push and email, opt-outs apply): for a new lead, the existing **New lead assigned to
  you**; for a repeat enquiry, **Repeat enquiry on your lead**; both go to the Owner (or whoever the rules chose). New: **`form.busy`** to the
  agency Owner (W40). The words of the first must read sensibly with no assigning member; the builder checks them and adds a
  variant "from your website form" if they name someone.

## 10. Erasure and purge

- **What the form keeps.** The visitor's message and answers live only in the lead and the person (so they are erased with them,
  ADR 0023). The ledger keeps ids and an outcome, no personal data; the consent ledger is personal and is erased with its
  person. The rate-limit table holds keyed hashes of addresses (existing). Turnstile, if on, gives Cloudflare the visitor's address
  and token for the check. Nothing else is stored: no address, no browser string, no copy of the answers.
- **Erasing a customer** (`eraseCustomerParts`) gains a step: delete the person's `person_consent` rows and set `person_id` and
  `lead_id` to null on their `website_form_submission` rows (the platform role updates; the runtime role cannot). `erasure.ts` and
  its test gain a consent row and a ledger row for the person. Unlike the Sheets, the form has no external copy to outlive the
  erasure: a person who erases themselves and then enquires again is a new person, which is what they asked for.
- **Purge** takes the three tables with the rest (`deleteOrganizationRows` reads the catalog). Removing a member changes nothing here.

## 11. The demo

The demo organization has the form's page with a row created by `resetDemoOrganization`: off, the default fields, a sample
thank-you. Its **Take enquiries** switch is disabled with the hint "Not available in the demo", and its public pages answer
as 3.8 (W6 refuses the demo plan), so a public demo form can never fill the nightly-reset organization with strangers'
enquiries or be used to spam it. The **Preview** works. `resetDemoOrganization`'s sample leads gain two with the source Website
form (details "Hosted link" and "sharmatravels.in"), one with an offers consent, so the source and the consent line show.

## 12. Performance (ADR 0028)

- **The page's call:** `GET` is two indexed reads (the form by organization, the destinations top 100 by lead count with an index
  that has it) plus the entitlements the requests already use, within 60 ms of our own time; a test reads the plans as
  `app_runtime` inside `forOrg`.
- **A submission** is the release 1 save plus one ledger insert and, for the tick, one consent insert: within 250 ms in the
  large seeded agency (50,000 leads); the W22 count is one index range read.
- **Weight:** the form route's first-load JavaScript within 150 KB gzipped and `embed.js` within 2 KB (tests that read the build);
  the hosted page loads no web font beyond the app's own and no third-party script but Turnstile's when it is on.
- **The cold start** (the pilot's api sleeps and takes about a minute to wake): the shell appears at once with skeleton rows;
  after 6 seconds the page says "Getting the form ready. This can take a minute."; the submission has the 15 second note
  (3.5) and one automatic retry with the same `submissionId`. The owner's checklist (section 15) suggests extending the
  keep-awake ping, which today covers working hours only.
- **Rate-limit writes:** each public call is one Postgres upsert per applicable bucket (the Neon free tier is the limit):
  a submission makes four, a page view one.

## 13. Journeys and tests

**Journeys** on phone and desktop, with axe after each, against a real api, the in-memory Turnstile and the harness's
cold-start switch:

1. The Owner turns the form on, edits fields and words, saves, opens the hosted link in a second browser context with no
   sign-in, sends an enquiry; the lead shows with source "Website form", the Owner owns it and has the notice; Preview shows the
   same form with Send off.
2. Required and optional fields: switching Budget to Required and Email to Off changes the page; a missing required field and an
   invalid phone show their sentences under the field; **Somewhere else** with a new place creates no destination, and its text is in
   the note; a destination chosen from the list sets the lead's destination.
3. A visitor whose phone has an open lead gets a repeat enquiry on that lead and the same thank-you; the person's name and email
   are unchanged and the visitor's email is in the note; a person whose leads are all closed gets a Returning lead; a blocked phone
   gets the thank-you and no lead; a fourth enquiry in a day gets the thank-you and nothing is saved.
4. The thank-you looks the same in every case above (a test compares the responses' bodies and status).
5. Spam: a filled `homepage` field is dropped with the thank-you; a submission a second after load is told to try again and passes
   on the second try; a message with three links is refused with its sentence; with the in-memory Turnstile saying no, the sentence
   shows and the widget resets; with it unreachable, the enquiry is accepted.
6. Limits: the fourth submission from one address to one agency in ten minutes is 429; the same address can still use another
   agency; an unset hop setting skips the address limits and still stops the sixty-first enquiry of one agency in an hour (with the
   limit lowered for the test); the Owner has exactly one flood notice however many are refused.
7. The client address: `GET /api/public/client-address` with `PUBLIC_FORM_PROXY_HOPS=1` and a forged leftmost header returns the
   real address; with too few entries it returns none.
8. Availability: switching the form off, a read-only agency, a suspended agency, a plan without `crm`, the demo, and a changed link
   each show their page (3.8); the old link and its snippet show "doesn't work any more"; Turn off and Change the link work while
   read-only.
9. The embed: a test page on another origin loads `embed.js`; the iframe appears, sizes itself, posts an enquiry (the lead arrives)
   and shows the thank-you; with **Allow my website to show this form** off, the frame shows the message; `/f/` cannot be framed
   (the browser refuses) and `/embed/` can.
10. Consent: the tick records the exact words; no tick records nothing and never withdraws; staff record that the person stopped; a
    later tick grants again.
11. Two identical submissions with one `submissionId` (the retry after a sleep) make one lead. Erase a customer: their consent rows
    and ledger ids are gone and the lead and note with them.
12. A cold start: the api answers 60 seconds late; the page shows its waiting words, the enquiry arrives once.

**Tests the builders write first** (besides each rule's own): the key (the shape, one encoding, the organization read from it, a
changed link); the hop reader (every shape of header, IPv6, too few entries, invalid values, the strict sign-in reader unchanged);
the order of checks and that each rejected attempt is counted; the honeypot's wire shape; the opened token (signed, expired, other
form's); the link counter; the Turnstile port's two adapters; `saveEnquiry`'s `unverified` option (no contact added to an existing
person, email to the note, a held email left out of a new person); the ledger's unique `submission_id` under a race; W22's count;
the one-body test of W20; the CSP rules for `/f`, `/embed`, `/embed.js` (a test reads the header rules and the built page); the service
worker exclusions; the colour pair (ink choice, fallback); the organization fixtures and RLS; the query plans of section 12; the demo
refusals; the erasure step; and `embed.js` in jsdom (origin and frame checks, key validation).

**Visual audit** of every new screen (`docs/ui-build-loop.md`) on a phone and a computer until no "must" is left, the hosted form
with three sample colours (a dark, a light that falls back, and none).

## 14. Build order

One branch, `forms/website`, after Release 2's sheets and bulk pieces and release 4's assignment code, which are on `main`
(`saveEnquiry` already has `assign`). Inside it:

1. **ADR 0032 (public website form):** the abuse model, the hop rule, the framing exception, the unverified-contact rule, the consent
   ledger. Then the tables, the contracts, the `website-forms` module, the `public` actor source and the audit CHECK.
2. **crm's side:** `unverified` in `saveEnquiry`, `receiveWebsiteEnquiry`, the ledger, `person_consent`.
3. **The api:** the three public routes, the limits, the hop reader (`clientAddressFrom`'s new sibling), the `BotCheck` port with its
   adapters, `environment.ts` for the three new settings, `.env.example`.
4. **The web app:** the form component, `/f`, `/embed`, `embed.js`, the headers and the service worker exclusions, then settings, the
   snippet dialog, preview, the consent line, and the words.
5. **Demo, erasure, sweep, docs** (the deploy checklist's rows and `docs/serverless.md`'s new step), then the journeys.

## 15. What the owner has to do

Nothing is needed to ship the form: it works with no new setting and no keys. These make it safe and fast in the pilot:

1. **Choose the proxy hops** (needed on the Render and Vercel pilot; not on Oracle). After the deploy:
   1. From a phone on mobile data open `<Vercel address>/api/public/client-address`. It shows `address`, `entries` and `hops`. Compare
      `address` with what a "what is my IP" site shows.
   2. In a terminal run `curl -H 'X-Forwarded-For: 9.9.9.9, 8.8.8.8' <Vercel address>/api/public/client-address`. The `address` must still be
      yours, not 9.9.9.9 or 8.8.8.8.
   3. Set `PUBLIC_FORM_PROXY_HOPS` on `travel-crm-api` in Render to 1, redeploy, repeat both checks; if the address is Vercel's or a forged one,
      try 2. Keep the first value for which both checks pass. (If `entries` is 1 with `hops` unset, Vercel is replacing the header and
      Render is not adding to it; send me the output.)
2. **Optional: switch on Turnstile** (free). Sign in at dash.cloudflare.com, open Turnstile, **Add widget**; name it "travel-crm forms"; under
   hostnames add the Vercel address (for example `travel-crm.vercel.app`) and your own domain if you add one; mode **Managed**. Copy the **Site key**
   and the **Secret key**. In Render, on `travel-crm-api`, add `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (the secret as a secret), redeploy. Both
   or neither: one alone stops the api with a message naming the variable. Agencies' own websites need no entry: the widget runs inside our page.
   In development and tests, use Cloudflare's published always-passes test keys (`.env.example` carries them).
3. **Keep the api awake longer** if agencies get enquiries in the evening: the free Render service sleeps after 15 idle minutes, and a visitor
   whose enquiry wakes it waits up to a minute (the form says so and keeps the enquiry). The cron-job.org ping (`docs/serverless.md`) runs in
   working hours only; widen it in step with your agencies' ad hours, mindful of Neon's free compute hours.
4. **Have the wording read.** The "Send me offers" sentence and the privacy line under the button are my wording. India's Digital Personal Data
   Protection Act expects consent to be specific, clear and withdrawable; someone who knows it should read them before agencies switch the tickbox on.
5. **Tell agencies in the help text:** the form is theirs; anything a visitor types is personal data they now hold; the tickbox is a request, not proof;
   Stopped enquiries are not kept; changing the link breaks the old snippet.
6. **Before real agencies:** run the owner's checklist 1 again after any change of host (a new domain or a plan with a fixed address changes the hop count).

## 16. Deploy checklist rows

`docs/deploy-checklist.md`'s settings table gains (● needed, ○ optional):

| Variable                                                             | api | worker | console | migrate | Secret |
| -------------------------------------------------------------------- | --- | ------ | ------- | ------- | ------ |
| `PUBLIC_FORM_PROXY_HOPS`: 1 to 5; unset behind Caddy (Hosting)       | ○   |        |         |         |        |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`: both or neither        | ○   |        |         |         | yes    |

- **Notes:** `PUBLIC_FORM_PROXY_HOPS` is **needed on Render and Vercel** and read by the public forms only (sign-in keeps its own rule,
  so its `AUTH_*` settings are untouched); `apps/api/src/environment.ts` validates it (an integer 1 to 5) and `GET /api/public/client-address` is how
  the number is chosen. Turnstile's keys reach the api only (the worker and the console never verify a visitor), validated together at
  start-up; a bad value names the variable and never prints it.
- **Routing table:** `/f/*`, `/embed/*` and `/embed.js` go to the web app (the default rule; `docker/Caddyfile` needs no new line), and
  `/api/public/website-forms/*` and `/api/public/client-address` to the api under the existing `/api/*` rule. The web image's CSP gains the
  Turnstile origins on those two routes only.
- **Hosting:** on the Oracle pilot Caddy replaces `X-Forwarded-For` with one address, so the hop setting stays unset; on the serverless
  pilot set it as section 15. A host behind a load balancer that appends (Cloud Run, ECS) can use `AUTH_TRUSTED_PROXIES`, and
  the forms follow that when the hops are unset.
- `docs/serverless.md` gains a step after "Vercel: the web app": set the hops by the checks in section 15, and add the form's
  public paths to the ping list if wanted. The sweep note in the console's jobs lists the new 90-day ledger purge.

## 17. Decisions I made

The owner approved these with the rest on 2026-10-22:

1. **The page lives in the web app, rendered in the browser (5.1):** it must work through the api's sleep and keep the service worker out;
   the cost is a generic link preview when the api is asleep.
2. **The key names the organization, as a share link's token does (W4):** no table outside row-level security. The random part is
   stored plainly because the link is meant to be shown again, and it is public by purpose.
3. **Phone alone decides the person; the visitor changes nobody (W18):** an unverified email or name must not alter a real customer. The cost
   is that staff add a new email from the note by hand.
4. **The form shows the same thank-you for everything (W20):** so it cannot confirm who is a customer, who is blocked, or that a repeat was
   stopped. The honeypot is the only silent drop; every other check tells the person what to do.
5. **Hop counting for the forms only (6.2):** you asked for it. I kept sign-in strict, because a forged address there lets a script avoid a
   lock, and said what remains open: whoever finds Render's own address can forge the header. The stronger fix (a Vercel function
   that signs the address) is held back until abuse shows.
6. **No address means skipped address limits, not a shared bucket (6.2):** a shared bucket would let one bot shut every agency out.
7. **Any https site may frame `/embed/*` (W30):** a static header can't know each agency's site, the form shows no account data and
   moves no money, and the agency has an off switch.
8. **Same-origin by design, no CORS (W28):** the iframe is our page, so nothing from another site ever calls the api. This also means the
   later link other tools post to needs its own route and key, not this one.
9. **Turnstile is server-wide and fails open (W39):** one setting for every agency; a Cloudflare outage must not cost agencies enquiries.
10. **Destinations: the top 100, never created (W8):** a public form must not grow the catalog; typed places go in the note.
11. **Children's ages are asked (W10):** the lead stores ages, not a count. It is the longest part of the form; Travellers can be switched off.
12. **Fixed rates, one file (6.3):** 3 per ten minutes per agency and address, 10 an hour per address, 60 an hour per agency. A guess to
    tune with the first real traffic.
13. **A ledger with ids only, not a table of submissions (7.2):** the counts and W22 need it; keeping answers would duplicate the lead and
    widen erasure. A false positive is therefore not recoverable, which is why the soft checks ask the person to try again.
14. **Consent is a ledger of the exact words shown (7.3):** the unticked box, the stored sentence, the staff withdrawal. It records and sends
    nothing. The tick is a request, not proof, on an unverified phone.
15. **`settings:manage` with `leads:create` guards the form (2):** it speaks for the agency in public; it picks no owners.
16. **Turn off and Change the link are "revoke" calls (3.2):** a read-only agency can still close its public door.
17. **The agency's colour via shadcn's own variables, with a contrast fallback (8):** keeps rule 2 and keeps the Send button readable.
18. **The demo form is off and unavailable to the public (11):** a public form on a nightly-reset organization is a spam target.
19. **The Owner owns every form lead and passes `assign` (W7):** release 4's rules code is already on `main`; with the mode off it changes nothing.
20. **Compared with the reverted attempt:** this one checks the subscription and the plan (W6, W23); never creates a destination (W8); has
    the traps and the limits (6); keeps buckets per agency and address (6.3); needs no CORS and sets no `*` origin (W28); and its form
    cannot alter a customer (W18).
