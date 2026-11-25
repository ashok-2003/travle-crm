# Easy package editing: design

Date: 2026-11-24. Status: agreed with the owner in conversation; for planning.

## Why

Agencies change their trips often, and the changes arrive the way agencies talk: a forwarded WhatsApp message, a photo
of a rate card or a poster of dates, a new brochure PDF. In one week of real updates the asks were:

- special prices for a period ("Christmas rates 18 Dec to 1 Jan", "new prices from 18 Dec onwards"), often for many
  trips at once;
- extra departure dates ("daily departures 18 to 31 Dec", a poster of December dates per trip);
- rules for a period ("no single rooms", "no quad", "window seat ₹400", "no on-the-spot bookings");
- a new itinerary order and a new brochure;
- policies and details across trips (cancellation, refunds, children, pickup times, seats, holding a trip back).

Today the package page is one long form. Some parts save with "Save package", others save on their own, and prices
sit far from dates. Seasons may not overlap, so a special-price period means splitting the regular season by hand
(shorten it, add the period, add the rest back). Adding many dates is one at a time. A cancelled departure blocks its
day forever, because the package/day unique index (`departure_package_day`) counts cancelled rows and a cancelled
departure can't be reopened (`setDepartureStatus`). A brochure over 10 MB is refused. So agencies forward the update
to the Veeper team instead of doing it themselves.

**Goal:** an agency owner or staff member updates a trip themselves in a minute or two, and the WhatsApp AI sells the
new prices and dates at once.

**Who:** agency owners and staff who may edit packages (`quotes:edit`). A change goes live as soon as they apply it,
with no owner approval (the owner's decision). Every change is in the audit log under the person's name.

## What we're building, in two steps

1. **The new trip page with the price calendar** and the tools for the hard edits.
2. **The AI change assistant**: tell the AI what changed in this trip, review a table of the changes, apply or undo.

Step 1 comes first (my call). Step 2's Apply uses step 1's operations, so the AI and a person's hand edits behave
exactly the same.

## Non-goals and anti-goals

- **Non-goals:** the AI changing several trips in one run (the owner: one trip at a time, to keep the AI's job small
  and avoid mistakes landing on the wrong trip); an owner-approval workflow; the AI touching bookings, customers,
  payments or quotes; redesigning the Packages list page.
- **Anti-goals:** a change saved without a person's tap; a price or date in a proposed change that isn't in what they
  gave the AI, without a red warning; a change landing on a trip other than the one open.

## Step 1: the trip page

The owner chose a layout of one page with short summaries (option B in the mockups).

- **Header:** the trip's name and a status line: AI sells it, page live, from-price, next departure, number of dates ahead.
- **The AI box** sits under the header. Step 2 fills it.
- **Four sections**, each a short read-only summary with **Edit**, and a side index to jump between them. Editing a
  section opens its own form, and **Save** saves that section alone. The single "Save package" goes. Every field the
  page has today keeps a home:
  - **Prices & dates:** room types, seasons, departures, weekly days, months, seats per departure, advance, start city.
  - **Itinerary:** the days, the title on a quote, nights.
  - **Details & rules:** inclusions, exclusions, pickup points, notes, cancellation notes, what travellers fill in,
    whether prices include GST.
  - **Page & files:** address, summary, highlights, the price visitors see, publishing, photos, brochures, and the
    "AI can sell this package" switch with its prerequisites. Tiers live here too, or in Prices & dates if the builder
    finds that clearer.
- **The price calendar** (the owner wants it) is in Prices & dates. It's a month view where each departure shows its
  seats left and state (open, filling, full, closed, cancelled), coloured by the price period it falls in, with a legend
  of each period's room prices.
  - **Tap a day:** add a departure, cancel one, or reopen a cancelled one.
  - **Select a run of days:** "special prices for these dates" opens a dialog for the room prices. It can also run "from
    this date until changed".
  - **"Add dates":** every day in a range, chosen weekdays in a range, or single dates. Existing dates are skipped.
- **Special prices split the regular prices automatically.** Saving a special-price period shortens and re-adds the
  season(s) it overlaps, in one transaction, so the seasons still never overlap (the database's exclusion constraint
  stays). A room type the period doesn't sell (no single, no quad) is left without a price in that period.
- **Reopen a cancelled departure:** a domain change, so a cancelled departure can go back to open with its seats
  (its cancelled bookings stay cancelled). Adding a date that holds a cancelled departure offers "Reopen" instead.
- **Copy a rule to other trips:** in Details & rules, a notes line ("No single rooms from 18 Dec") can be copied to
  trips the person ticks. It shows a preview and has no AI.
- **Big brochures:** a PDF over 10 MB is made smaller automatically instead of refused.
- **Phones:** agencies work on phones, so this follows DESIGN.md (44px targets). The calendar needs a phone layout.

## Step 2: the AI change assistant (one trip per run)

- **What they give it:** pasted text, plus optional photos or a PDF, with the same file types and caps as reading a
  supplier's rate sheet. It understands Hinglish and messy forwards.
- **The flow:**
  1. "Show the changes".
  2. Questions, only where something is unclear ("Until when?", "Which Manali trip?"), answered by tapping a choice or
     typing.
  3. **The change table** (the owner's choice, option C): one row per change, with columns What / Now / New and a tick
     box. Problems are shown in red (a cancelled date to reopen, a number not found in the message). It also says what
     won't change.
  4. "Apply N changes".
  5. A done message with **Undo all** and **See what changed**.
- **Messages about many trips:** the agency pastes the whole message on each trip. The AI keeps only the lines about
  this trip and lists what it ignored ("lines about Spiti, Chitkul"). It must never take the 5N/6D prices for the 4N/5D trip.
- **Grounding:**
  - Every price and date in a proposed change must appear in what they gave. That means the text, or the text read
    from the photo or PDF. Anything that doesn't is flagged red and starts unticked.
  - Follow the package-draft approach (`packages/domain/src/ai/drafts/`): the model cites the lines that say each
    value, and code turns the cited lines into prices and dates.
- **Changes it can propose** are the ones from real updates:
  - special prices for a date range, or from a date until changed;
  - a regular price change;
  - room types not sold in a period;
  - adding, cancelling or reopening dates;
  - seats per departure;
  - notes and rule lines, pickup points and times, the advance;
  - inclusions, exclusions and policy text;
  - itinerary days (edit, reorder, replace);
  - replacing a brochure with an attached PDF;
  - stopping or starting the AI selling the trip.
- **Apply:**
  - All ticked rows go in one transaction, through step 1's operations, with one audit entry ("applied 17 AI changes")
    plus each operation's own.
  - **Undo all** reverses the applied changes. A departure that took a booking in the meantime is not removed, and the
    undo result says so.
- **AI:**
  - It runs on the existing AI port (`createAiModel`, Gemini on Vertex), with its prompt in Langfuse, traced like every
    other call, and each "Show the changes" uses one AI credit.
  - One structured-output call per run, like package drafts and rate sheets, not the LangGraph agent loop. One trip's
    data fits in the prompt, so it needs no tools (my call; the owner asked for LangGraph "if necessary").
  - Use the LangGraph tool-agent port only if the work turns out to need several steps.
- **If the AI is down or unsure:** it says so, and nothing changes.

## Constraints

- Every rule in CLAUDE.md applies: shadcn registry components only, DateField for dates, money in paise, permissions
  and the audit log, the request checks, every word in messages.
- No agency or person names in code, tests or docs (a public repo).
- Seasons never overlap and a package has one departure a day; both rules stay, and the operations keep them.

## Decided details

These came from a builder's read of this document. Each is marked as already true in the code, or as my call.

- **"From this date until changed"** stores an ordinary season. It runs from the chosen day to the end date of the
  season it splits, or one year on when there is none. No open-ended seasons and no schema change (my call).
- **A room type with no price in a period** is already valid. Season prices are nullable per room type, and a season
  needs only one price (`savePackageSeasonInput`). The quote refuses that room on those dates (`NO_PRICE`), the AI's
  trip text leaves it out, and the from-price ignores it. Nothing new is needed.
- **Existing quotes and bookings keep their prices.** New prices affect quotes and bookings made afterwards, as
  today. Cancelling a departure from the calendar uses the existing cancel flow, with its reason and its rules for
  bookings on it (my call: no new rules).
- **Undo all** is offered for the latest AI Apply on that trip, and only while nothing else on the trip has changed
  since. It is all or nothing. Otherwise it is replaced by "changed since: undo by hand". It stores the before-values
  of what it changed (my call).
- **Reopening a departure** keeps its seat count, which stays editable on the departure (my call).
- **Section saves** send only that section's fields, so two sections never overwrite each other. Two people saving
  the same section at once: the last save wins, as today (my call).
- **Plans:** step 1 gets a detailed plan of its own. Step 2 gets a separate plan that reuses step 1's operations (my call).
- **Who may use what:**
  - The AI box needs `quotes:edit` and the AI plan module.
  - Each "Show the changes" run uses one AI credit, given back if the AI didn't answer (as `releaseAiCall` does today).
  - A run abandoned after the table appears still counts.
  - "Copy a rule to other trips" needs `quotes:edit`, which covers every trip in the agency (my call).
- **Brochure shrinking** aims under the 10 MB limit, with images down to about 150 dpi at JPEG quality around 72.
  That kept a 12.9 MB, 17-page brochure readable at 5.4 MB. Where it runs (the browser, or the worker re-processing
  the stored file) is the builder's call.

## Left to the builder

Component structure and API shapes; the calendar's building blocks (the registry Calendar or a grid of registry
pieces) and its phone layout; how big brochures are made smaller (files go from the browser straight to storage, never
through the api); how Undo stores what it needs; the prompt's wording; where Tiers sit.

## Open for the owner

Who builds each step: the phase-1-features session (domain and AI) or the web-revamp session (which is redesigning
pages one by one), or one for each step.
