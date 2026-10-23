# Release 4: automatic lead assignment

- **Status:** draft for the owner's answers in section 0.
- **Date:** 2026-10-23
- **Scope:** Phase 1, release 4: new leads that arrive by themselves (imports, Sheets, the website form, later Meta and
  WhatsApp) find their owner by the agency's rules; the Unassigned queue, the away switch, working hours, and the
  slow-reply alert. Leads added by hand keep whoever adds them (release 1, unchanged).
- **Input:** the owner's deep dive #11 (2026-10-16, "Lead assignment rules"), `CLAUDE.md`, the release 1 spec, the
  website form spec (`2026-10-22-website-form-design.md`, W7: the form already passes `assign` once the switch is on),
  and the audit of the first version (section 2). Contributor's first version: migration `20261027100000_lead_assignment`
  (applied on the pilot), switched off by `features.automaticAssignment = false`.
- **What is decided:** deep dive #11. This spec adds only what it left open. The deep dive's answers are not re-asked.

## 0. For the owner

Three questions the deep dive does not answer. Each changes what gets built. If you agree with all three, say "go".

1. **Does "away" skip people everywhere, or only in the turns?** The deep dive says turns skip anyone away. It does not
   say whether a returning customer's previous owner, or a rule's person, who is away still gets the lead.
   **Recommendation: skip away people at every step.** The lead falls to the next check and its timeline says why. A
   lead sitting with someone on a week's leave is the thing this feature exists to prevent.
2. **Working hours: one schedule for the agency, or one for each person?** **Recommendation: one for the agency** (days
   and opening and closing time, in its time zone; the default is Monday to Saturday, 10:00 to 19:00). Each person's
   own control is the away switch. Per-person hours triple the settings screen and the rules for "who is on now", and
   no agency has asked for them.
3. **Who is "the manager" the slow-reply alert goes to?** The first version tells only the first Owner, by push.
   **Recommendation: everyone whose role holds `leads:assign`** (the Owner always does), in the bell and by push, so
   the opt-outs and quiet hours apply. A sales manager who reassigns leads is the person who can act on it.

Everything else below follows the deep dive or is a build detail.

## 1. What this release does

An agency chooses how new leads find an owner. The default is unchanged: the agency Owner. The Owner can instead switch
on **Turns** (the sales pool in turn) or **Fewest open leads**, add **rules** (destination, trip type, source), set
**working hours** and a **reply time limit**. People in the pool mark themselves **away**. A lead nobody can take sits
in the **Unassigned** queue, which managers work. A new lead with no reply by the time limit alerts the managers. Nothing
is reassigned automatically; managers reassign by hand, and every change is logged.

## 2. Audit of the first version

"Keep" means the code is sound and is built on. Line numbers are in the worktree at b0e01e50.

| Requirement | What exists | Gap or bug | Verdict |
| --- | --- | --- | --- |
| Order of checks (returning, rules, mode, owner) | `choose-owner.ts:34-47`, `save-enquiry.ts:111-123` | Order is right. Away is applied only in the pool (`choose-owner.ts:50-56`); a previous owner or a rule's person who is away still gets the lead (question 1). A returning customer with an open lead goes to that lead (release 1), never reaching here, which is right. | Keep, add the away check |
| Taking turns, race-free | `FOR UPDATE OF member` in a fixed order, `last_assigned_at` (`choose-owner.ts:50-58`) | Sound: no counter, no deadlock. `last_assigned_at` is written from `now` passed by the caller, so two workers with skewed clocks can disagree; ties break by order of `member.id` only by luck of the sort. A lead imported with a past `now` would write a past turn. | Keep, fix: write `clock_timestamp()` in SQL, tie-break on `id` |
| Fewest open leads | Subquery `count(*)` over open stages in the locked select (`choose-owner.ts:52-54`) | Correct stages; uses `lead_open_by_owner`. No test that two arrivals at once split fairly. | Keep, add the concurrency test |
| Nobody available: Unassigned | `choose-owner.ts:60` returns null; the list has an `unassigned` view (`lead-list.ts:56-81`, `lead-list-query.ts:56`) | Works. No notice when a lead lands unassigned, so a queue can fill unseen. The tab shows no count. | Keep, add a notice and a count |
| Owner mode falls back to the Owner | `choose-owner.ts:45` | Fine. | Keep |
| Rules by destination, trip type, source | `assignment_rule`, `choose-owner.ts:36-43` | Fine. A rule whose person left is passed over silently, and the screen does not mark it. | Keep, mark such rules |
| Rule save | `settings.ts:44-77` | Deletes and recreates every rule on each save, so rule ids change (harmless today, wrong for any later reference). The audit entry holds only counts (`settings.ts:71-76`), so who joined the pool or what a rule said is lost. `saveAssignment` is not a `freshProcedure` (`routers/assignment.ts:31`), which is acceptable: it moves leads, not money or roles. | Fix: audit holds mode, time limit, pool user ids and each rule's fields (ids only) |
| Away switch | `setAway`, `AwaySwitchCard` (1, 3 or 7 days) | Not audited. Not on any screen except the leads page card. A person who leaves the agency keeps a pool row (`departing-member.ts` ignores the pool), so the settings screen lists them. | Keep, add audit, remove the pool row on `staff.removed` |
| Working hours | None | Missing entirely. | Build |
| Slow-reply alert | `first-reply-alert.ts` | Tells only the first Owner (`:49`), push only, not the managers; ignores working hours (a lead at 02:00 alerts at 02:15); the default is off (`slowReplyMinutes` null) where the deep dive wants about 15 minutes;  The screen presents it only as part of assignment. "A reply" is `first_reply_at`, set when the stage leaves New (`lead-core.ts:49`) and nothing else. | Keep the job shape (ids only, keyed on the event); fix recipients, channels, working-hours clock, default |
| Manual reassignment, logged | `changeLeadOwner`, `lead.reassigned` audit (`lead-core.ts:95`), reassign dialogs (single and bulk), `leads:assign` | Sound. | Keep |
| Audit of the automatic choice | None | Why a lead went to someone (returning, rule, turns, fewest open, owner, none) is not recorded. | Build: in the lead's creation audit detail and its timeline |
| Permissions and plan module | `settings:manage`, `leads:view`, `leads:assign`; `orgProcedure.requires` | Correct; no new permission module. The `assignment` router answers `NOT_AVAILABLE_YET` by `requireSwitchedOn()` (`routers/assignment.ts:14`), and many call sites test the feature flag. | Keep; remove the flag at the end (section 14) |
| Events and notifications | `lead.slow-reply` kind exists in `kinds.ts:13` | New kind `lead.unassigned` needed in `kinds.ts` and `notifications.json`. | Build |
| Row-level security | `app_enable_org_rls` on all three tables, fixtures in `packages/db/test/org-table-fixtures/assignment.ts`, FKs restrict and include `organization_id` | Complete. | Keep |
| UI rules | `assignment-screen.tsx` (286 lines), `rule-row.tsx` (155), registry `Select`, no hand-drawn borders found | `assignment-screen.tsx` is past the 200-line smell and will grow with hours; check `useWriteAccess`, `DateField`, `ConfirmDialog` use when splitting. | Keep, split |
| Tests | Through other features only: `lead-add-row-assignment.test.ts`, `website-enquiry-assignment.test.ts`, `sheet-save.test.ts`, one flag test in `crm-procedures.test.ts:120` | None for `chooseOwner` itself, `saveAssignment`, `setAway`, the first-reply job, the screen, or a journey. | Build all (section 13) |

**Headline:** about four fifths is keepable. The decision core, the three tables, the migration, RLS, the contracts,
the router, the reassign dialogs and the Unassigned view stand. To fix: away everywhere, the clock for turns, the
audit detail, the alert's recipients and clock. To build: working hours, the Unassigned notice and count, the explanation
on the timeline, the tests, and removing the flag.

## 3. Screens

### 3.1 Settings > Lead assignment (`/settings/assignment`, `settings:manage`)

Three cards, top to bottom, using Card and Item/ItemGroup:

- **How new leads are given out:** `ChoiceField` with three options: "To the Owner" (default), "In turns", "To whoever has
  the fewest open leads". Each has an `InfoHint`. Below it, in turns and fewest-open only, the **pool** (a multi-pick of
  lead workers; each row shows the person's away state). With zero people in the pool, a warning says new leads will wait
  in Unassigned.
- **Rules:** the existing ordered list (up to 50), each "when [source] [destination] [trip type] then [person]", moved
  up and down. A rule whose person left or is not a lead worker shows a `StatusBadge` "Person left" and is passed over.
  Rules apply in every mode, including To the Owner.
- **Working hours and reply time:** days (Mon to Sun toggles), opening and closing time, and "Alert managers when a new
  lead has no reply in [15] minutes of working time" with an off choice. Both apply in every mode. The agency's time
  zone is shown beside the times and links to the Business profile.

One Save at the bottom (`useWriteAccess("change")`, `WriteHint`); the existing whole-document save stays.

### 3.2 The away switch

Kept as the card on the leads page, shown to anyone in the pool: Away for 1, 3 or 7 days, or Back. Add: the card also
appears at the top of Today for a pool member, and shows when they return. Times show in the agency's zone through
`formatDayTime`.

### 3.3 The Unassigned queue

The leads page tab "Unassigned" (already built, `leads-screen.tsx:135`) shows a count in the tab label, visible to
holders of `leads:assign` only (a salesperson scoped to their own never sees it, `lead-list.ts:77`). Each row has the
existing reassign action. The empty state says why it is empty in each mode.

### 3.4 The slow-reply alert

A notice, not a screen: "A new lead is waiting for a reply", "Rahul Sharma · 15 min", linking to the lead (bell and push).
Settings > Notifications lists it under the existing `lead.slow-reply` kind. The lead's page shows "Assigned to Priya
because: Kashmir rule" in its timeline (section 4.6).

## 4. Behaviour

### 4.1 When it runs

Only for leads that arrive by themselves: imports without an Owner column, Sheets rows naming no owner, the website
form, later Meta and WhatsApp. These call `saveEnquiry` with `assign: { workers }`, which calls `chooseOwner` inside the
same transaction as the lead (`save-enquiry.ts:111`). A repeat enquiry on an open lead is not a new lead and is never
reassigned (release 1).

### 4.2 The order of checks

`chooseOwner(tx, lead, context)` returns a user id or null, checking in this order and stopping at the first answer.
"Available" means a current lead worker, not away at `now`.

1. **A returning customer** with an earlier lead goes to the owner of their latest earlier lead, if available.
2. **Rules** in position order: the first rule whose set conditions all match the lead, and whose person is available.
   A rule whose person is unavailable is skipped, and the next rule is tried.
3. **The mode.** To the Owner: the first Owner (the fallback). In turns or Fewest open: the pool, below.
4. **Otherwise** (the pool has nobody available): `null`, the Unassigned queue.

In To the Owner mode the Owner gets the lead even if away; they are the owner of last resort, and the alert covers the
rest. (If question 1 is answered no, step 1 and 2 ignore away as the first version does.)

### 4.3 Taking turns, race-free

The pool rows are locked `FOR UPDATE` in `id` order in one select, which also counts each person's open leads (stages
New, Contacted, Quote sent, Booking requested; `lead_open_by_owner` serves the count). A second lead arriving at the same
moment waits on the lock, and Postgres re-reads the winner's updated row, so it sees the new turn. The chosen person's
`last_assigned_at` is written in the same transaction as the lead. The person whose last turn is oldest goes first, and
someone who never had a turn goes before anyone who did. Ties break on `member.id`. Fix to the first version: the write
uses `clock_timestamp()` in SQL, never the caller's `now`. No counter exists, so removing or adding a person needs no
repair. Fewest open: lowest count first, ties by the oldest turn.

### 4.4 Away

`away_until` in the future means skipped; null or past means in. Nothing runs when it ends: the check compares to `now`.
Away is not working hours: a person can be away for a week; hours say when the agency answers.

### 4.5 Working hours and the clock

Hours live in the organization's time zone (`organization.time_zone`), as days plus opening and closing minutes, one
schedule. **Assignment is not paused by hours**: a lead that arrives at 02:00 or on a Sunday goes to its owner at once, so
it is waiting in their bell in the morning. Only the **slow-reply clock** uses hours: it counts working minutes. A lead
created at 18:50 with a 15-minute limit alerts at 10:05 the next working day; one at 02:00 alerts at 10:15. A pure
function `addWorkingMinutes(start, minutes, hours, timeZone)` in the kernel computes the due instant, with tests for
a day that ends mid-wait, a weekend, and a daylight-saving-free zone (India has none, but the function is zone-correct).
With every day switched off, the clock counts wall minutes. The job is queued with `startAfter` at the due instant.

### 4.6 The slow-reply alert and what counts as a reply

When the limit is set, `lead.created` schedules a check (ids only). At the due instant, if the lead is live, still
**New**, and `first_reply_at` is null, all managers (question 3) are notified with `sourceEventId` so a repeat adds nothing;
otherwise it ends silently. Each lead alerts at most once. Nothing is reassigned. **A reply** is the first time anyone
moves the lead out of New (`first_reply_at`, `lead-core.ts:49`) or logs a call or message on it; the second is added to
the same `first_reply_at` set (check that log-contact paths call it). A lead created already past its due time, as an
old imported lead, is ignored (kept from the first version). A reassigned lead keeps its clock.

### 4.7 Explaining the choice

`chooseOwner` returns `{ userId, reason }` where reason is `returning`, `rule` (with the rule's position), `turns`,
`fewest_open`, `owner` or `none`. It goes into the lead's creation audit detail (`assignedBy`) and shows on the timeline
as one line. Ids and a fixed word only; no personal data. A lead landing in Unassigned notifies managers with the new
kind `lead.unassigned` ("A new lead has no owner"), once per lead (`sourceEventId`).

### 4.8 Switching on and off

`features.automaticAssignment` is the release gate, not the agency's switch (the agency's switch is the mode). It is
removed in section 14 and the mode default `owner` keeps every existing agency exactly as now. Switching to Turns with an
empty pool is allowed, with the warning in 3.1.

## 5. Data and migrations

Reuse `assignment_settings`, `assignment_rule`, `assignment_pool_member` as applied. One new migration, additive only,
named for its day and sorting after the latest on main: on `assignment_settings`

- `workdays INTEGER NOT NULL DEFAULT 63` (bit 1 Monday to 64 Sunday), CHECK between 0 and 127;
- `day_opens_minute INTEGER NOT NULL DEFAULT 600`, `day_closes_minute INTEGER NOT NULL DEFAULT 1140`, CHECK each between
  0 and 1440 and opens before closes.

The same `slow_reply_minutes` column carries the limit (null is off). When the owner saves settings for the first time,
the screen proposes 15. No data change, no backfill, no new table, so no new fixture; the existing fixtures cover it. The
Prisma schema and `packages/db/README.md` need one line each. The lead table is unchanged. Mode, rules and pool stay as
they are.

## 6. Permissions and plan module

No new permission. `settings:manage` reads and saves the settings; `leads:view` for the away switch; `leads:assign`
reassigns and sees the Unassigned count and is the recipient set for the alerts. All procedures stay on `orgProcedure`;
their plan module is core (the settings module); the subscription's states decide as they do for any mutation. The
managers' list for notices comes from a new identity function `membersHolding(permission)` (names no sign-in table
outside identity; ids only).

## 7. Audit and notifications

- Audit `assignment.updated` (kept): before and after hold mode, limit, hours, pool ids, and rules (fields, ids only).
  Add `assignment.away-set` (who, until, back) so the entry sentence exists in `audit.json`. Reassignment is already
  `lead.reassigned`. The automatic choice is in the lead's creation entry (4.7).
- Notifications: `lead.slow-reply` (managers; bell and push) and `lead.unassigned` (managers; bell and push), each with
  its entry in `kinds.ts` and `notifications.json`. `lead.assigned` ("New lead assigned to you") is unchanged and goes
  to the chosen person.
- No new event type is needed: the checks hang off `lead.created`.

## 8. Erasure and the demo

- A member leaving (`staff.removed`): add a step to `departing-member.ts` that deletes their pool row, so the pool and
  the settings screen do not list them. Rules naming them stay and show "Person left"; a rule is only user ids, not
  personal data. Purging an organization already reads the catalog and removes all three tables.
- The demo (`resetDemoOrganization`): the sample agency gets mode Turns, a pool of its two salespeople, one rule
  (Kashmir to the senior), hours Mon to Sat, a 15-minute limit, and a few Unassigned leads, so the queue and the
  alert show on the demo.

## 9. Performance (ADR 0028)

Assignment adds one settings read, one rules read (up to 50) and, in pool modes, one locked select over the pool (at
most 500 rows, usually under 20) with a count per member served by `lead_open_by_owner`. It runs once per new lead, inside
the lead's transaction, so a 5,000-row import adds the same per row. Measure this at the import's 1,000-row test and keep
the per-row time within the import's existing budget. The lock is held only for the lead's own transaction, so two
imports at once serialise per lead, not per file. The slow-reply check is one delayed job per new lead.

## 10. Journeys and tests

Tests first. Domain (real Postgres):

- `chooseOwner`: every step and their order; a rule skipped when its person is away; away at each step; Owner mode;
  empty pool returns null; fewest-open ties.
- Concurrency: 20 simultaneous arrivals over a pool of 4 split 5 each (turns) and balance the open counts (fewest-open).
- `saveAssignment`: rejects a non-lead-worker; audit detail; a stale pool row removed.
- `setAway` and the departing member's pool row.
- `addWorkingMinutes`: table of cases (inside hours, past close, weekend, empty week).
- The first-reply check: replied lead silent, still-New lead alerts every manager once, a repeat run adds nothing, a past
  imported lead is ignored.
- Existing `lead-add-row-assignment`, `website-enquiry-assignment` and `sheet-save` tests move off the flag mock.

API: every procedure's permission (`crm-procedures.test.ts`), including a role without `settings:manage`, and
`NOT_AVAILABLE_YET` removed. Web: the settings screen (mode, pool, rules, hours; `useWriteAccess` read-only), the away card,
the Unassigned count, the notification kind tests. Journeys (Playwright, real api and worker):

1. The Owner switches to Turns with two salespeople; three website enquiries go Priya, Ravi, Priya.
2. Priya goes away for 3 days; the next enquiry goes to Ravi; with Ravi away too it lands in Unassigned, managers get the
   notice, and a manager reassigns it from the queue.
3. A Kashmir rule sends a Kashmir enquiry to its person; a returning customer goes to their previous owner.
4. A lead with no reply past the limit, inside working hours, alerts the manager (a short limit and a fixed clock).

## 11. Build order

1. **Shared, one agent first:** the migration, Prisma and contracts for hours; the kernel's `addWorkingMinutes`;
   `chooseOwner`'s new return shape and away rule; `membersHolding` in identity; the i18n keys and the two notification
   kinds. Merge before the tracks start.
2. **Parallel tracks by file ownership:**
   - *Domain/worker:* `crm/assignment/**`, `first-reply-alert.ts`, `departing-member.ts`, the demo, `worker-jobs.ts`.
   - *API/contracts:* `routers/assignment.ts`, `contracts/crm/assignment.ts`, the audit sentences.
   - *Web:* `crm-settings/assignment/**` (split the screen), the away card, the Unassigned count, the timeline line.
3. **Gate and journeys,** then remove the flag (section 14).

## 12. What the owner must do

1. Answer section 0.
2. After merge and the deploy, apply the one new migration on the pilot (it is additive; the first
   `lead_assignment` migration is already applied there).
3. Open Settings > Lead assignment on the pilot agency, choose the mode, pick the pool, set the hours and the limit.
   The default stays "To the Owner", so nothing changes until this is done.
4. After the first day, look at the worker's failed jobs and the Unassigned count.

## 13. Decisions I made

- Assignment runs at arrival even outside hours; hours move only the alert (4.5).
- Rules apply in every mode, not only in the pool modes (3.1), as the deep dive's order puts rules before automatic.
- The alert is a setting of the agency, not of the mode, so it works for an agency that keeps the Owner default.
- One alert per lead, no escalation, no reassignment (the deep dive).

## 14. Removing the flag

Last step of the build, in its own commit: delete `features.automaticAssignment` and every test of it
(`first-reply-alert.ts`, `worker-jobs.ts:166`, `lead-list.ts`, `list-filters.ts`, `leads-screen.tsx`, `away-switch.tsx`,
`website-enquiry.ts`, `sheet-save.ts`, `lead-add-row.ts`, `routers/assignment.ts`), and the mocks in the tests; keep the
`features` type's other members. Ship it behind the owner's merge as any release: the default mode `owner` leaves every
agency unchanged.
