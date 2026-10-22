# Ayush's proposals (21 October 2026), not decisions

- **Status:** proposals written by Ayush on 2026-10-21. They are **not the owner's decisions** and bind nothing. The
  owner decides which of them to take, and each release that is taken still gets its own spec and plan before it is
  built (`docs/agent-playbook.md`). The owner's agreed rules (the Phase 1 scope, ADR 0028 and ADR 0029, `CLAUDE.md`,
  `DESIGN.md`) stand wherever this document differs from them.
- **Date:** 2026-10-21 (marked up 2026-10-22 after the owner's review)
- **Input:** the Phase 1 product scope (`2026-10-16-phase-1-product-scope.md`), ADR 0028 and 0029, `CLAUDE.md`,
  `DESIGN.md`.
- **Marks:** an item tagged **Contradicts an agreed rule** goes against a rule the owner has already agreed; it needs
  the owner's explicit decision (and a new ADR) before anything is built on it.
- **Since written:** the landing page (release A) and the public pricing page were taken out of the app, as the landing
  page is a separate site; automatic assignment (release C) is built but switched off until release 4
  (`features.automaticAssignment`).

## 1. Ayush's proposals (2026-10-21)

Each is written as a ruling (**Ruling: what, why, cost if wrong**, as the playbook asks), but is a proposal until the
owner agrees.

1. **WhatsApp through Meta's Cloud API directly**, with coexistence, so an agency keeps the WhatsApp Business app on its
   phone. Ruling: no BSP in between, no per-agency BSP fee; costs weeks of Meta verification (Tech Provider) up front.
2. **WhatsApp is off until the agency connects its own number**, in a few steps of Meta's Embedded Signup started from
   the product. Nothing WhatsApp (the inbox, campaigns, the AI's replies) shows as usable before that; their places say
   how to connect.
3. **The AI answers WhatsApp by itself (full autopilot), on by default** for every conversation once WhatsApp is
   connected, with a switch for the whole agency and one per conversation (per lead or number). Ruling: would replace ADR
   0029's "AI never sends to a customer" for WhatsApp (a new ADR 0032 records it with its guardrails); cost if wrong:
   an AI mistake reaches a customer, limited by the guardrails in section 6.
   **Contradicts an agreed rule:** ADR 0029 says AI never sends anything to a customer; it drafts and a person
   applies. Not accepted; ADR 0032 does not exist.
4. **The agency teaches the AI** in Settings: PDFs, documents and text (packages, itineraries, policies, FAQs, payment
   details), which the AI answers from and sends.
5. **An Integrations panel** of its own: WhatsApp, Meta (Facebook and Instagram lead ads), Google Sheets, IndiaMART, the
   website form, and the link for Zapier, Pabbly and Make, each with its state.
6. **A Developer panel:** API keys, outgoing webhooks for the agency's own systems, the events they can hear, every
   delivery's log, and the incoming lead link.
7. **A Campaigns panel** for WhatsApp marketing, usable only once WhatsApp is connected: text, image, video and
   documents sent in bulk to groups of numbers, groups made by hand or by rule (lead source, dates, stage, destination),
   scheduled or sent at once, made by hand or drafted by the AI. Ruling: reverses the Phase 1 scope's "campaigns to
   customer groups: ruled out"; marketing goes only to people with marketing consent and never to someone who opted out.
   **Contradicts an agreed rule:** the Phase 1 scope rules campaigns out. It also leans on the AI sending (item 3).
8. **A wallet of credits:** the agency pays money in and gets credits, spent on WhatsApp messages, campaign messages
   and the AI's work. Ruling: a closed wallet (credits buy only our own services; not refundable as cash, not
   transferable), so it needs no RBI prepaid-instrument licence; cost if wrong: legal advice before launch confirms it.
9. **Pricing on the landing page reads the console's plans live** (built in release A).
   **Withdrawn:** the owner removed the landing page and the public pricing page from the app (2026-10-22); the
   landing page is a separate site.
10. **Staff ratings** move from Phase 2 into this roadmap (release G).
11. **Stages stay one fixed set**; the pipeline is a view of them, not custom stages, so reports compare.

## 2. The releases, in order

**Contradicts an agreed rule:** this order is Ayush's. The owner's agreed release order (`docs/adr/`, the Phase 1
scope) puts the sources that need no approval first, Meta when it is approved, and AI last; it, not this table, stands.

| Release | What                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------- |
| A       | Done: the sign-in and console wake fix, the agency's logo, a foldable sidebar (the landing page: removed) |
| B       | The analytics dashboard at `/dashboard`, and an optional won value                                        |
| C       | Lead management: the pipeline board, bulk changes; automatic assignment and the Unassigned queue are off  |
| D       | Integrations and Developer panels; the website form, the incoming lead link, Meta lead ads, IndiaMART     |
| W       | The wallet and credits (before E, which spends them)                                                      |
| E       | WhatsApp: connect by Embedded Signup, the inbox, the media and knowledge library, message templates       |
| F       | The AI on WhatsApp (autopilot), the knowledge it is taught                                                |
| K       | Campaigns: groups, bulk sending, scheduling, the AI's drafts                                              |
| G       | Staff performance and ratings                                                                             |

Quotes, bookings, payments, suppliers, accounts and reports (Phase 1 steps 3-7) follow, as the scope says.

## 3. Release D: the Integrations and Developer panels

**Integrations** (`/integrations`, `settings:manage`): one card per source, each with its state (not connected,
connected, needs attention), leads in the last 7 days, the last error and the way to fix it.

- Google Sheets (built: moves here from Settings, Lead sources).
- WhatsApp (release E): Connect starts Meta's Embedded Signup.
- Meta lead ads: Facebook Login for Business picks the pages and forms; a `leadgen` webhook brings each lead at once and
  a check every 30 minutes catches what a lapsed token missed.
- IndiaMART: its CRM Listing API (the agency pastes its key), polled every 10 minutes for new enquiries.
- Website form: a snippet for the agency's site and a hosted form page, rate-limited, with spam traps.
- Zapier, Pabbly and Make: the incoming lead link from the Developer panel.

**Developer** (`/developer`, a new `developer:manage` permission, Owner and Admin):

- **API keys:** named, scoped (leads read, leads write), shown once, stored hashed, revocable, last use shown.
- **Incoming lead link:** a secret address per agency that takes a lead as JSON; its fields documented on the page.
- **Outgoing webhooks:** an address, the events it hears (`lead.created`, `lead.stage-changed`, `lead.reassigned`,
  later `message.received`, `booking.confirmed`), a signing secret (HMAC-SHA256 header), retries with backoff from the
  worker, and a log of every delivery (status, time, a retry button). Payloads carry ids and the record's public fields.
- **Event catalog:** each event's shape with an example, for the agency's developer.

Every source makes leads through one path: match the person (`matchPerson`), then `assignNewLead` (release C).

## 4. Release W: the wallet

- **Credits are the one currency** for usage. The console sets their price (paise per credit) and what each use costs
  (per WhatsApp message by Meta's category, per AI reply or task), as data, like plans.
- **Top-up:** the agency pays through Razorpay (an owner item: the account); a verified payment webhook adds credits.
  Every top-up issues a GST invoice for the money paid.
- **A ledger, never a balance alone:** every credit and debit is a row (top-up, message, campaign, AI, refund of a failed
  send, adjustment by the platform), and the balance is their sum, kept with a row lock so two sends can't overspend.
- **Spending:** a send or an AI task reserves its credits first and settles them after; a message Meta refuses gives
  them back. With too few credits, sends stop with a plain reason, and the AI hands chats to people instead of going
  quiet.
- **Low balance:** the Owner is told at a threshold they set, and may switch on automatic top-up later.
- Screens: the wallet (balance, top-up, ledger with filters, invoices) for roles with a new `wallet:manage`; the
  balance in the sidebar for them.

## 5. Release E: WhatsApp

- **Off until connected:** the agency connects from Integrations (Embedded Signup with coexistence). The token is stored
  encrypted (`INTEGRATION_SECRETS_KEY`); one number per agency on the plan's limit.
- **The inbox** (`/inbox`): conversations (mine, unassigned, AI-handled, needs a person, unread), the chat, and the
  lead beside it. Who sees a chat follows its lead's own/all scope. Text inside the 24-hour window, approved templates
  outside it, media from the library.
- **The library** (`/library`): itinerary PDFs, brochures, photos, videos, payment QR and bank details, and packages
  (name, destination, days, price from, inclusions, files), which staff and the AI send.
- Messages cost credits as the console prices them; replies inside a customer's 24-hour window cost Meta nothing.

## 6. Release F: the AI on WhatsApp

**Contradicts an agreed rule:** this release is the autopilot of item 3, against ADR 0029 (AI never sends to a
customer). Its other parts (the agency teaching the AI, drafts a person approves) fit the rule; sending by itself does
not.

- **On by default** for every conversation once WhatsApp is connected; the agency's switch and each conversation's
  switch turn it off. A person's reply in a chat pauses it there (30 minutes by default).
- **Taught by the agency** (Settings, AI): PDFs, documents and text are read into a knowledge base, searched for each
  reply, so it answers from the agency's own packages, prices and policies; the tone, languages (English, Hindi,
  Hinglish) and the most discount it may give are settings.
- **What it does**, each through code that checks it: reply, send a library item or package, fill in the lead with the
  words it came from, set a follow-up, quote a package's price computed by code, hand over.
- **Guardrails:** hands over on a complaint, a refund or payment dispute, a request for a person, or doubt; opt-outs
  respected; free text only inside the 24-hour window; a daily credit limit per agency; every message it sends marked
  "AI" and audited; models only after their test set passes (ADR 0029).

## 7. Release K: campaigns

**Contradicts an agreed rule:** the Phase 1 scope rules out campaigns to customer groups (item 7).

- Usable once WhatsApp is connected (the panel says how to connect until then).
- **Groups:** made by hand (pick leads or paste numbers, or upload a file) or by rule (source, date range, stage,
  destination, trip type, owner), counted before sending; only people with marketing consent, never anyone opted out.
- **The message:** an approved marketing template with its blanks filled, with an image, video or document header, from
  the library; the AI drafts a campaign's text and picks its group from a sentence ("Kashmir leads from last winter who
  didn't book").
- **Sending:** now or scheduled, throttled to Meta's tier and the agency's daily cap, its credits reserved first; a
  report of sent, delivered, read, replied, failed. Replies arrive in the inbox, where the AI answers them.
- Permissions: `campaigns:send`.

## 8. What the owner does (outside the code)

- Meta: business verification, Tech Provider registration, app review (WhatsApp messaging and management, lead ads,
  pages), with a screencast of each flow.
- Razorpay: the account, for wallet top-ups.
- OpenRouter with zero data retention, for the AI.
- An always-on api (Render Starter or a VM) before WhatsApp: webhooks and the AI can't wait for a sleeping server.
- Legal advice on the wallet's terms and on a privacy policy and terms (the drafts that were at `/privacy` and
  `/terms` went with the landing page).
- GitHub: write access to the repository for the branch `ayush`.
