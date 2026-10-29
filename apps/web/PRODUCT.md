# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Owners and sales staff of small Indian travel agencies, in equal measure on phones and desktops.

- **Sales staff** reply, call and quote all day, mostly on a phone and on the move. They need the next thing to do, one tap away.
- **Owners** check the team, money and reports, mostly on a desktop. They need counts and charts first, a person's detail second.
- Both work in English with Indian formats. Agencies range from a few staff to 500+.

## Product Purpose

Veeper AI is a subscription CRM and operations platform for Indian travel agencies. Each agency is an organization.
It covers leads, a WhatsApp inbox, quotes, bookings and payments, and AI sales help. Success is an agency that answers
every enquiry fast, loses no lead, and sees where its bookings and money come from.

## Positioning

Leads that arrive by themselves are the main selling point: the agency's Google Sheet, Meta lead ads, the website form
and WhatsApp land in one list within seconds, each with a source and an owner. It is built for how Indian agencies
work (WhatsApp, UPI, GST, lakh grouping), and AI only drafts language work: people decide, and nothing reaches a
customer without a person sending it.

## Operating Context

- Leads come from a Google Sheet (one way, into the product), CSV or Excel upload, a website form, Meta lead ads, WhatsApp, and quick add by hand, voice or pasted screenshot.
- Calling uses the staff member's own phone: a PC shows the number, "Send to my phone" and a QR code; no cloud telephony.
- The agency connects one WhatsApp number through Meta's coexistence and keeps the WhatsApp Business app on the phone. Free-form messages go only inside the 24-hour window.
- Staff start from Today's work list: overdue items, new leads with no reply, quotes opened, follow-ups, payments due.
- Stages are one fixed set: New, Contacted, Quote sent, Booking requested, Won, plus Lost and Not a lead.

## Capabilities and Constraints

- Phase 1 ships as small releases in this order: leads by hand, Sheets sync and bulk upload, website form, automatic assignment, calling and templates, Meta lead ads and WhatsApp, quotes and bookings, AI last.
- AI is used only where language is involved. Prices, tax, dates, counts, reminders and assignment are plain code.
- AI proposals show before, after and their source excerpt, and apply only on approval. AI-filled fields are tinted violet. AI providers keep no data.
- Money is integer paise, shown in lakh grouping. Times are stored in UTC and shown in the organization's zone.
- Marketing consent is recorded per person, with how it was given.
- Permissions are per module and action; the subscription's plan decides which modules an agency has.
- Plan prices stay out of the agency app. The platform pays for WhatsApp (MSG91 under one account), so agencies see message counts and their allowance, never rupees.

## Brand Commitments

- **Name:** Veeper AI, short form "Veeper". **Tagline:** "The AI sales platform for travel agencies."
- **Mark:** a V rising into an arrow, on deep green.
- **Personality:** trusted, quick, warm.
- **Colour roles** (owner's decision, 2026-10-28): keep the warm neutral background; a green sidebar; links and in-app buttons in blue; buttons that send something to a customer on WhatsApp in green.
- **Never like:**
  - a generic AI dashboard: rows of identical icon boxes, gradients, purple-blue SaaS;
  - old ERP or Tally screens: dense grey forms, tiny text;
  - flashy startup marketing inside the working app.

## Evidence on Hand

- Specs, plans and decisions: `docs/superpowers/specs/`, `docs/superpowers/plans/`, `docs/adr/`.
- The design rules: `DESIGN.md` at the repository root.
- A pilot agency uses the product. There are no published testimonials, case studies, customer counts or benchmarks; none may be invented.

## Product Principles

1. **The next action first.** Home is a short nudge of the few most important things, never a cluttered list.
2. **Quick on a phone.** Every sales task works one-handed, on a weak connection, without a desktop.
3. **People decide.** AI drafts and shows its source; a person approves and sends.
4. **Charts before people.** Owners see the team's totals first, then open one person's detail.
5. **Plain words.** Say what happened and what to do next, in an agency owner's language rather than a developer's.

## Accessibility & Inclusion

- 44px touch targets and WCAG AA contrast, as set out in `DESIGN.md`.
- Indian formats: lakh grouping (₹12,50,000.00), dates as "16 Oct" ("16 Oct 2027" in another year), dd/mm/yyyy only in date inputs.
- Every word on screen is a translatable message; English (India) is the first locale.
