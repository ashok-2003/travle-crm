# Release 1: leads by hand

- **Status:** approved by the product owner in conversation, 2026-10-16 (content and screens); this document records it
- **Date:** 2026-10-16
- **Scope:** Phase 1, build step 2 (CRM + WhatsApp inbox), first release
- **Input:** the Phase 1 product scope (`2026-10-16-phase-1-product-scope.md`, sections 1-3), ADR 0028 (data rules),
  the Foundation spec. Where this document and the scope differ, this one is newer for release 1.

## 1. Why this release, and what comes after

Phase 1 ships as small releases, one at a time, so the pilot (Yatra Hikes) sees the product grow. Releases that wait on
nobody come first; Meta lead ads and WhatsApp come when Meta approves us; AI comes last. The order agreed with the
owner:

1. **Leads by hand** (this document).
2. Google Sheets both ways, plus bulk CSV/Excel upload.
3. The website form and the link for other tools (Zapier, Pabbly, Make).
4. Automatic assignment: turns, rules, away, working hours, the slow-reply alert, the managers' team view of Today.
5. Calling without AI (the Call panel, Send to my phone, QR), message templates, the morning push.

Then Meta lead ads and WhatsApp as Meta approves us, quotes, bookings and the rest, and AI at the end.

Release 1 is the base every later source lands in: a person, a lead, its stages, its owner, its follow-ups, and a Today
list. When it ships, an agency can stop keeping leads in a notebook or spreadsheet and work them here.

**Goals**

- Staff add a lead in seconds on a phone, and every detail of the trip has a place.
- One person per phone number: a repeat enquiry is spotted at once.
- Every lead has an owner, a stage and a next follow-up; Today shows each person what to do now.
- Salespeople see their own leads; managers and owners see everyone's.

**Non-goals (later releases)**

- Leads that arrive by themselves (sheets, import, forms, Meta, WhatsApp): releases 2-3 and the Meta releases.
- Automatic assignment, away, working hours, the slow-reply alert, the team view: release 4.
- The Call panel (Send to my phone, QR), templates, the morning push: release 5.
- Quotes, bookings, payments; marketing consent (first captured by the website form, release 3); AI of any kind.

**Anti-goals:** a cluttered Home; a list that slows down at 50,000 leads; a salesperson seeing another's leads; any
change without an audit entry.

## 2. Who uses it

- **Salesperson** (starter role Sales: `leads:view` own, `leads:create`, `leads:edit`): adds leads, works their own.
- **Manager** (Owner, Admin, or any role with `leads:view` all): sees every lead, filters by owner, reassigns.
- Operations and Accounts roles get no leads access by default (unchanged from the Foundation).

## 3. The screens

The approved layout is in the mockup beside this file (section 8); the final look follows `DESIGN.md`, the owner's UI rules in
`CLAUDE.md` and `docs/ui-build-loop.md`, built from the registry components and the shared pieces. Mobile first; every
screen has its loading, empty, error-with-retry and refusal states.

### 3.1 Navigation and Home

- Two new navigation items for anyone with `leads:view`, on the `crm` plan module: **Leads** and **Today**.
- **Home** keeps the owner's setup card and adds, for people with leads access, a short nudge: "8 things today · 2
  overdue", the three most important items (overdue first, then the new lead waiting longest, then the next due
  follow-up), and **Open Today**; plus **+ New lead**. Never a long list on Home.

### 3.2 The new-lead form

One form, quick to fill: only the name and one contact are required, the rest can wait.

- **The person:** name; at least one of phone, email or Instagram handle. Phone numbers default to India (+91) and are
  stored in E.164; Instagram handles are stored without the `@`, lower case.
- **The trip:**
  - **destination**, picked from the agency's own list; typing a new name adds it to the list;
  - **when**: exact dates (from, to), a month, or "flexible";
  - **travellers**: adults, and children with each child's age;
  - **budget**: an amount in rupees, marked "per person" or "for everyone";
  - **departure city** (text);
  - **trip type**: family, honeymoon, friends, solo, corporate, pilgrimage, trek (a fixed list, the same for every
    agency, so reports compare);
  - **hotel category**: 3★, 4★, 5★ or any;
  - **food**: veg, Jain or non-veg;
  - **room type** (text) and **notes** (the notes become the lead's first timeline note).
- **Where it came from:** the source (phone call, walk-in, referral, Instagram, Facebook, website, other) with an
  optional detail line, and the **owner**: the person adding it by default; people with `leads:assign` may pick anyone
  who can work leads.
- **A known contact.** When the phone (or, with no phone, the email or Instagram handle) matches an existing person, the
  form says so before saving:
  - with an **open lead** (any stage but Won, Lost, Not a lead): "Rahul Sharma already has an open lead (Kashmir, with
    Asha)". Choices: **Add to that lead** (the enquiry and its note go on that lead's timeline as a repeat enquiry,
    and its owner is notified) or **New trip enquiry** (a new lead for the same person). A salesperson who can't see
    that lead still gets both choices, and sees only its destination and owner's name;
  - with **no open lead**: the new lead is linked to the same person and marked **Returning customer**.
  - The person's stored name is kept; the form shows it. A contact the form brings that the person lacks (an email,
    a handle) is added to them; one that differs from a stored contact is not overwritten.

### 3.3 Leads (the list)

- Search by name (forgiving of typos: "Rahul Shrma" finds Rahul Sharma) or by any part of the phone number.
- Quick filters: **Mine · open** (the default), by stage, and Filters (owner, source, destination, trip type).
  Managers get a **Mine / Everyone** switch and an owner filter.
- Each row: the name (with a **↺ Returning** marker), the trip in one line (destination · month or dates · travellers),
  the stage as a badge with its word, and what's next: "12 min ago · no reply yet", "Follow-up overdue", "Follow up
  today 4:00 pm".
- Newest first, with **Show more** (cursor paging). On a computer it's the registry Table.

### 3.4 A lead

- The name, phone and email; **Call** (opens the phone's dialler; on a computer it shows the number with Copy) and
  **WhatsApp** (opens the chat with that number in WhatsApp) as the main buttons.
- A **stage bar**: New → Contacted → Quote sent → Booking requested → Won. Tapping a stage moves the lead there,
  forwards or back. The ⋯ menu holds **Lost**, **Not a lead**, **Block this number** and **Reassign**
  (`leads:assign`); the first three ask for confirmation.
- **Next follow-up**, with **+ Add follow-up** (a due date and time and a short line of what to do). A lead's
  follow-ups always belong to the lead's owner.
- **The person** (name, phone, email, Instagram handle) and **the trip** (the same fields as the form), each editable
  by anyone who can edit the lead; **owner** with Reassign; **source** and who added it.
- **Timeline**, newest first, with **Add a note**: notes, the lead's creation, stage changes, reassignments, follow-ups
  added and done, repeat enquiries, and edits to the trip.

### 3.5 Today

- The date and a count ("8 things · 2 overdue"), then three sections, each with its count:
  - **Overdue**: my follow-ups and tasks due before now;
  - **New leads waiting for a reply**: my leads still in New, oldest first;
  - **Due today**: my follow-ups and tasks due later today (the agency's time zone).
- Actions: **Call** and **WhatsApp** (as on the lead), **Done**, **Snooze** (one hour, tomorrow morning at 9:00, or a
  chosen time), and **Mark contacted** on a new lead. Unfinished items stay until done: yesterday's become overdue.
- **+ Add a task**: a task with a due time, linked to a lead or standing alone.
- A quiet line says later releases add quotes opened, payments due, departures and missing traveller details.

### 3.6 Settings

- **Destinations** (`settings:manage`): rename, and merge two into one (leads move to the kept one).
- **Blocked contacts** (`leads:assign`): the list, with Unblock.

## 4. How it behaves

- **Stages** are one fixed set for every agency: New, Contacted, Quote sent, Booking requested, Won, Lost, Not a lead.
  In release 1 staff move them by hand; later releases move them too (a sent quote sets Quote sent, Accept sets
  Booking requested). Won, Lost and Not a lead are closed; reopening one returns the lead to the stage it had before.
  There are no lost reasons.
- **First reply:** the first time a lead leaves New for any stage but Not a lead, the moment is kept as its first-reply
  time (for release 4's alerts and later reports).
- **Returning customer** means the person had an earlier lead with the agency when this one was created. It's a
  marker, not a stage.
- **Not a lead** hides the lead from the default lists and from reports. **Block this number** (`leads:assign`, since
  a mistaken block loses a customer's future leads) also marks it Not a lead and adds its phone (or email or handle)
  to the blocked contacts; the person's other open leads are untouched. In release 1 a blocked contact only warns in
  the form; from release 2 leads from blocked contacts that arrive by themselves are dropped.
- **Owner:** a lead created by hand belongs to whoever the form names (by default the person adding it). Leads that
  arrive by themselves (release 2 on) go to the agency's owner until release 4's rules exist.
- **Follow-ups follow the lead's owner.** Reassigning a lead moves its open follow-ups to the new owner. Marking a
  lead Lost or Not a lead closes its open follow-ups (they show as cancelled on the timeline); Won keeps them.
  Standalone tasks have an assignee: yourself, or anyone for people with `leads:assign`.
- **Editing a person:** a phone, email or handle already on another live person is refused, naming that person;
  merging two people is later work.
- **When someone leaves** (`staff.removed`), a listener moves their open leads, with those leads' follow-ups, and their
  open standalone tasks to the agency's Owner, recorded in the audit log as the system's change; managers reassign
  from there.
- **Notifications** through `notify()` (bell and push, opt-outs apply): "New lead assigned to you" when someone else
  makes you a lead's owner; "Repeat enquiry on your lead" when an enquiry is added to your open lead.
- **Audit:** every change staff make is recorded with `recordAudit` in its transaction: a lead or person created or
  edited, a stage change, a reassignment, a follow-up or task added, done or snoozed, a destination renamed or merged,
  a contact blocked or unblocked.
- **Events:** the changes publish domain events (`lead.created`, `lead.stage-changed`, `lead.reassigned`,
  `lead.repeat-enquiry`, …; ids only) so later releases' summary tables and listeners can follow them.
- **Who sees what:** the existing own/all scope on `leads:view` decides which leads a person sees; tasks linked to a
  lead follow the lead; a standalone task is its assignee's (and visible to managers). A lead out of scope is "not
  found" (`assertRecordInScope`).

## 5. Data (ADR 0028)

All tables are organization tables: `organization_id`, row-level security, keys and unique constraints including
`organization_id`, UUID v7 ids, `ON DELETE RESTRICT`, an isolation fixture each.

- **person**: name; `phone_e164` (unique among live rows); email (lower case); Instagram handle; soft delete. A CHECK
  requires at least one contact. Exact lookup by `(organization_id, phone_e164)`, and by email and handle; a trigram
  index on the name and the phone's digits for search.
- **lead**: the person; stage (CHECK) and the stage before (for reopening); stage changed at; first reply at;
  returning (boolean); the owner (a member's user id; nullable, for release 4's Unassigned queue); destination;
  travel: kind (dates, month, flexible, unknown), start and end `date`s, or the month as its first day; adults;
  children's ages (an integer array; the count is its length); budget in `BigInt` paise with its basis (per person,
  for everyone); departure city; trip type, hotel category and food (CHECK lists); room type; source (CHECK list,
  wide enough for later releases' sources) and source detail; created by; soft delete. Partial indexes for the hot
  sets: open leads by owner, leads in New by owner.
- **destination** (owned by a new `catalog` module, so quotes can use the same rows in step 3): name, unique among
  live rows case-insensitively; a trigram index; merged-into for merges; soft delete.
- **lead timeline**: one slim row per event (kind, time, actor, the record it points to); notes and repeat enquiries
  in their own typed tables. Keyset paging.
- **task**: kind (follow-up or task), title, due at (`timestamptz`), assignee, the record it's linked to (record type
  and id, optional), done at and by; snoozing moves the due time and keeps the first one. A partial index on open
  tasks by assignee and due time.
- **blocked contact**: the phone, email or handle, who blocked it and when.
- Extensions: `pg_trgm` (and `btree_gist`, which step 3 needs) are created by a migration and in
  `sql/bootstrap.sql` (ADR 0028).

## 6. Modules, permissions, plans

- New domain modules: **crm** (people, leads, the lead timeline, blocked contacts), **catalog** (destinations, for
  now), **tasks** (follow-ups and tasks on any record, like attachments), and **today**, a read-only module above them
  that composes their public queries (later releases add their own items to it). The layers follow the Foundation's
  module map: catalog and tasks at L0, crm at L1, today at the top beside reports.
- Permissions: the existing `leads:view` (own/all), `leads:create`, `leads:edit`, plus a new **`leads:assign`**
  (reassign, and pick another owner in the form), given to the Owner (automatically) and the Admin starter role. Tasks
  and Today need `leads:view`. Destinations are managed with `settings:manage`, blocked contacts with `leads:assign`. All of it is on
  the `crm` plan module.
- A procedure that lists the people who can own leads (names only), for the owner and assignee pickers, needs
  `leads:assign` or, for a salesperson, returns only themselves.
- Contracts in `@travel-crm/contracts/crm`, `.../catalog`, `.../tasks`, `.../today`; strict input schemas; output
  schemas; `Money` at the edge for the budget.

## 7. Everything else a release needs

- **Demo:** `resetDemoOrganization` adds sample people, leads in every stage (one returning, one blocked), notes,
  follow-ups (some overdue, some today) and tasks, owned by the demo's Owner and salesperson.
- **Erasure:** `person` joins `PERSONAL_RECORD_TYPES`; erasing a person removes or redacts their contact details,
  their leads' notes and repeat enquiries, and their tasks' titles (ADR 0023).
- **Words:** every screen word in next-intl messages; every new refusal in `errors.json`; every audit action in
  `audit.json`; the two notification kinds in `kinds.ts`.
- **Performance (ADR 0028):** a seeded large agency (50,000 leads, 100,000 tasks, 500 staff) in the performance tests'
  own database; the lead list, search and Today stay within time budgets and use their indexes (a test reads the query
  plans).
- **Journeys** on phone and desktop, with axe: add a lead; add a repeat enquiry to an open lead and as a new trip;
  move stages and reopen a lost lead; add a follow-up and finish it from Today; reassign; a salesperson sees only
  their own leads.
- **Visual audit** of every new screen (`docs/ui-build-loop.md`) until no "must" is left.

## 8. Calls the development lead made

The owner approved the content; these details were the lead's calls and are open to change:

- Name plus one contact required; phone, email or Instagram handle all count.
- Destinations as the agency's own list, added inline; renamed and merged in Settings.
- Trip types as a fixed list for every agency.
- Owner defaults to the person adding the lead; only `leads:assign` picks someone else.
- Stages move by hand, freely forwards and back; reopening restores the stage before.
- Returning customer = any earlier lead.
- Block this number: Not a lead plus a block list that only warns in release 1.
- Snooze choices: one hour, tomorrow 9:00, or a chosen time.
- Preferences (hotel, food, room) stay on the lead in release 1; Phase 2's repeat-customer features move them to the
  person.
- Marketing consent waits for release 3's form, its first source.
- Desktop Call shows the number with Copy; the full Call panel is release 5.
- A lead's follow-ups always belong to its owner and move with it; Lost and Not a lead cancel them.
- A departing member's open leads and tasks go to the agency's Owner.
- People are edited from the lead; a contact already on another person is refused (no merging in release 1). A
  repeat enquiry's new contact fills a gap on the person, never overwrites.
- Blocking and unblocking need `leads:assign`.

The screen mockup (`2026-10-16-release-1-leads-screens.html`, beside this file) shows the approved layout; where it
and this text differ, this text wins.
