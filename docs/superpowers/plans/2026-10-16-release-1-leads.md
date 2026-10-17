# Release 1: Leads by Hand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> This plan runs in parallel: Track G (shared pieces) runs first, alone, on `leads/r1`. Then four tracks (C, S, L, W)
> run at the same time, each in its own git worktree, and Task I1 merges them.

**Goal:** Staff add leads by hand, see their own (managers everyone's), move them through fixed stages, keep follow-ups
and tasks, and work a Today list: the base every later lead source lands in.

**Architecture:**

- Four new domain modules on the Foundation (spec 6):
  - `catalog` (destinations) and `tasks` (follow-ups and tasks on any record) at L0;
  - `crm` (people, leads, the lead timeline, blocked contacts) at L1, which may call both;
  - `today`, a read-only module above them.
- **Organization tables (ADR 0028):**
  - every table has `organization_id`, row-level security, composite keys and RESTRICT;
  - partial indexes serve the hot sets, keyset paging every long list;
  - `pg_trgm` serves fuzzy search, and the budget is `BigInt` paise.
  - The three hottest queries are composable SQL (`sql` from `@travel-crm/db`), so the performance test runs EXPLAIN on
    the exact query the code runs.
- **Interfaces first:**
  - Track G writes every contract, the L0 modules, and every router with its real handler.
  - The crm and today functions those routers call get their final signatures and a "not built yet" body, so the
    screen tracks build against the real `AppRouter` while Tracks C and S fill the bodies.
- Pages carry `people: Record<userId, name>` for every user id they mention. Names come from identity's
  `memberContacts`, never the sign-in tables.

**Tech Stack:**

- The Foundation's stack, unchanged: Prisma 7.10.0 (`partialIndexes`), Postgres 18, tRPC 11.19, Next 16.4.1, shadcn
  4.21.4 (radix-nova), next-intl, Playwright.
- One new package, through the registry: `command` brings `cmdk` (ruling R45).

**Spec:**

- `docs/superpowers/specs/2026-10-16-release-1-leads-by-hand-design.md` is the authority.
- Its inputs:
  - `2026-10-16-phase-1-product-scope.md` section 3;
  - ADR 0028;
  - the Foundation spec, sections 4-9.
- The screen reference is `docs/superpowers/specs/2026-10-16-release-1-leads-screens.html`. Where it and the spec
  differ, the spec wins.

---

## Global Constraints

Every task's requirements include these.

- **Shell and Node.**
  - Start every shell command with `cd <folder> && source ~/.nvm/nvm.sh && nvm use >/dev/null &&`.
  - `<folder>` is `/Users/ak/personal/travel-crm-leads` for Track G and Task I1, and the track's worktree otherwise.
  - Never touch `/Users/ak/personal/travel-crm` or another track's worktree.
- **Stages:** one fixed set: New, Contacted, Quote sent, Booking requested, Won, Lost, Not a lead.
  - Stored as `new`, `contacted`, `quote_sent`, `booking_requested`, `won`, `lost`, `not_a_lead`.
  - Won, Lost and Not a lead are closed. The stage bar is New → Contacted → Quote sent → Booking requested → Won.
  - There are no lost reasons.
- **Fixed lists:**
  - Trip types: family, honeymoon, friends, solo, corporate, pilgrimage, trek.
  - Hotel category: 3★, 4★, 5★ or any.
  - Food: veg, Jain or non-veg.
  - Sources the form offers: phone call, walk-in, referral, Instagram, Facebook, website, other.
  - Budget basis: "per person" or "for everyone".
- **Contacts:**
  - Only the name and one contact are required; phone, email or Instagram handle all count.
  - Phones default to India (+91) and are stored in E.164 (`toE164`, `phoneNumber`).
  - Emails are stored in lower case; Instagram handles without the `@`, in lower case.
- **Money and time:**
  - The budget is `BigInt` paise in the database and the kernel's `Money` at the edge.
  - Travel dates are `date`; moments are `timestamptz`.
  - "Today", "due today" and "tomorrow 9:00" are in the agency's time zone (`organizationTimeZone`).
- **Snooze choices:** one hour, tomorrow morning at 9:00, or a chosen time.
- **Rules from the spec:**
  - **Every change** staff make is recorded with `recordAudit` in its transaction.
  - **Every change publishes** a domain event (ids only).
  - **The owner** is a member's user id.
  - **Follow-ups follow the lead's owner;** Lost and Not a lead cancel them, Won keeps them.
  - **A lead out of scope is "not found".**
- **Scale (ADR 0028):**
  - The test agency holds 50,000 leads, 100,000 tasks and 500 staff.
  - Never `OFFSET`; keyset paging on UUID v7 ids.
  - No materialized views.
- **Organization tables (CLAUDE.md, `packages/db/README.md`):**
  - `SELECT app_enable_org_rls('<table>')` and an isolation fixture for each table.
  - Keys and unique constraints include `organization_id`; keys are `onDelete: Restrict, onUpdate: Restrict`.
  - Soft-delete models are listed in `softDeleteModels`, with no DELETE grant.
  - Never `forOrg()` inside `forOrg()`; never `$queryRawUnsafe`.
- **Words the tests read** (CLAUDE.md):
  - Every `new DomainError(...)` reason needs its sentence in `errors.json`, written as a literal.
  - Every `recordAudit` action needs its sentence in `audit.json`, written as a literal or as a literal union type.
  - Every notification kind needs its entry in `kinds.ts` and its words in `notifications.json`.
  - Every screen word is a next-intl message.
- **The owner's UI rules 1-7** (CLAUDE.md), `DESIGN.md` and the shared pieces:
  - registry components only, no `border`, `ring`, `shadow` or `divide` class outside `components/ui`;
  - 44px targets, `DateField` for days, a dialog that sends holds while pending;
  - a displayed date reads "16 Oct", times "4:30 pm", money "₹12,50,000";
  - colour is meaning: red overdue, amber waiting, violet people and follow-ups, blue the only action colour.
- **Readable code:**
  - each source file opens with a one-line comment saying what it is for;
  - ~200 lines is a smell;
  - no `any`, no `!`, no abbreviations in public names;
  - inputs `z.strictObject`, outputs `z.object`.
- **Pinned versions:**
  - No new package but `cmdk` through `pnpm dlx shadcn@4.21.4 add command`.
  - If the CLI wants anything else, or a version pnpm's release age refuses, stop and report.
- **Commits:**
  - Conventional Commits, header at most 100 characters.
  - Stage files by name; never `git add -A`, `.` or `-a`; never `--no-verify`.
  - No `Co-Authored-By` trailer, no `.env`.
- **Docker:**
  - Must be running; the tests start their own containers.
  - Never `pnpm dev`, `pnpm services:up` or `docker compose` in a track's worktree. The owner's `travel-crm-*`
    containers hold the development ports.
  - Use `--concurrency=3` and run checks in the foreground, each call under 10 minutes.

## Review Focus

These five failure modes are the ones most likely to bite a person. Each is pinned by the test named.

1. **A salesperson reaches another salesperson's lead** through a filter, an id or a side door. Possible doors:
   - the list's `ownerUserId` or `view`;
   - an id in `get`, `timeline`, `addNote`, `moveStage`, `editTrip` or `addWork`;
   - a task's Done or Snooze;
   - the known-contact check.

   Expected: their own leads only, `NOT_FOUND` for the rest; the known contact shows only the destination and the
   owner's name. Pinned by:
   - C3: "shows a salesperson only their own leads, whatever view or owner they send";
   - C4: "answers NOT_FOUND for another salesperson's lead, from every procedure";
   - G3: "refuses a salesperson's Done or Snooze on another's task as NOT_FOUND";
   - C1: "names the owner and destination of a lead the salesperson can't see, never its id".

2. **The same new number saved twice at once.** Two staff take the same call. Expected: one person; the second save
   is asked about the open lead (`OPEN_LEAD_EXISTS`), never a 500. Pinned by C2: "makes one person when two saves of
   a new number race; the second is asked about the open lead".
3. **Days in the agency's zone, not the server's or the phone's.** At 00:05 IST, yesterday's undone follow-up is
   overdue. At 23:50 IST, one due at 00:10 is not "due today". "Tomorrow 9:00" is 09:00 IST, not UTC. Pinned by:
   - G2: `instantAt` tests;
   - G3: "snoozes to 09:00 tomorrow in the agency's zone, even at 23:30";
   - S1: "splits overdue and due today at the agency's midnight";
   - G5: "says today and tomorrow by the agency's clocks, whatever the device's zone".
4. **Phone numbers as people type them.** `98765 43210`, `098765-43210` and `+91 98765 43210` must find one
   person; search by any 4+ digits typed with spaces must work; a foreign number must keep its own country. Pinned by:
   - C1: "matches a phone however it is typed";
   - C3: "finds a lead by any four or more digits of the phone".
5. **Stale actions from a second tab or a slow phone.** Possible cases:
   - Done twice;
   - a snooze on a cancelled task;
   - a move to the stage the lead is already in;
   - a reassign to someone just removed.

   Expected: a sentence or a no-op, never a 500 and never a second audit entry. Pinned by:
   - G3: "answers TASK_CLOSED to a second Done";
   - C5: "changes nothing when the lead is already in that stage" and "refuses an owner who can't work leads";
   - G5: "a refused Done shows its sentence and keeps the task".

## Tracks, ownership and merge order

| Track               | Branch / worktree                                          | Tasks | Owns after Track G (only it edits)                                                                                                                                                                                                                                                                                                                                                                                                   | Needs                                                    |
| ------------------- | ---------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| **G Shared pieces** | `leads/r1`, `/Users/ak/personal/travel-crm-leads`          | G1-G5 | everything it writes, until G5's commit                                                                                                                                                                                                                                                                                                                                                                                              | the spec commit                                          |
| **C CRM**           | `leads/r1-crm`, `…/travel-crm-leads-crm`                   | C1-C6 | `packages/domain/src/crm/{people,known-contact,create-lead,lead-list,lead-list-query,lead-detail,timeline,lead-changes,lead-work,blocking}.ts`; `packages/api/src/routers/{leads,blocked-contacts}.ts`; `apps/api/test/leads-*.test.ts`; `packages/domain/test/crm/*.test.ts` (not `support/`); the new keys of `errors.json`, `audit.json`, `notifications.json`; `apps/web/src/notifications/preferences/kinds.ts`                 | G                                                        |
| **S System**        | `leads/r1-system`, `…/travel-crm-leads-system`             | S1-S5 | `packages/domain/src/today/**`; `crm/{work-queries,departing-member,customer-erasure,demo-leads,index}.ts`; `packages/api/src/routers/today.ts`; `apps/api/src/worker-jobs.ts`; `platform/{erasure,deletion-checks,exports,demo}.ts`; `contracts/src/platform/data-protection.ts`; `apps/web/src/console/data-protection/subject-export-view.tsx`; `console-platform.json`'s new keys; `packages/domain/test/{today,performance}/**` | G; C merged before S4                                    |
| **L Lead screens**  | `leads/r1-lead-screens`, `…/travel-crm-leads-lead-screens` | L1-L5 | `apps/web/src/leads/{list,form,lead}/**`; `apps/web/src/app/(app)/leads/**`; `leads.json`'s `list`, `form` and `lead` keys; `test/leads/**`; `test/e2e/leads-*.spec.ts`; `test/e2e/support/leads.ts`; `test/e2e/audit/06-leads.audit.ts`                                                                                                                                                                                             | G; C merged before L5                                    |
| **W Work screens**  | `leads/r1-work-screens`, `…/travel-crm-leads-work-screens` | W1-W5 | `apps/web/src/{today,crm-settings}/**`; `apps/web/src/app/(app)/{today,settings/destinations,settings/blocked-contacts}/**`; `apps/web/src/app/(app)/page.tsx`; `settings-sections.tsx`; `today.json`; `settings.json`'s new keys; `test/{today,crm-settings}/**`; `test/home.test.tsx`; `test/e2e/{today-follow-up,home-nudge,settings-destinations,settings-blocked-contacts}.spec.ts`; `test/e2e/audit/07-work.audit.ts`          | G; C and S merged before W5, L before W5's cross journey |
| **I Integration**   | `leads/r1`                                                 | I1    | the merges; `CLAUDE.md`, `packages/domain/README.md`, `docs/deploy-checklist.md`                                                                                                                                                                                                                                                                                                                                                     | all                                                      |

**Merge order into `leads/r1`:**

1. G (committed there directly).
2. C.
3. S and L, in the order they finish.
4. W.
5. I1's docs and gate.

S4, S5, L5 and W5 first merge `leads/r1` into their own branch (`git merge --no-edit leads/r1`). The table says what
each waits for.

**Why the tracks barely collide.**

- **Track G writes every shared file first:**
  - the schema;
  - the contracts;
  - every router and the crm/today signatures;
  - `crm/index.ts`, `today/index.ts` and `app-router.ts`;
  - the navigation, routes and message namespaces;
  - the shot list;
  - the test seeds in `packages/domain/test/crm/support/records.ts`.
- **Words:**
  - Only C adds refusal, audit and notification words after G.
  - L writes into `leads.json` (G leaves its `list`, `form` and `lead` keys as `{}`).
  - W writes `today.json` and its keys of `settings.json`.
- **A change another owner's file needs** goes under "Needs from others" in the track's report, never into the file.
  I1 applies it.

**Making a track's worktree** (once, before its first task; `<track>` is `crm`, `system`, `lead-screens` or
`work-screens`):

```bash
cd /Users/ak/personal/travel-crm-leads && git worktree add ../travel-crm-leads-<track> -b leads/r1-<track> leads/r1
cd /Users/ak/personal/travel-crm-leads-<track> && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate && pnpm --filter @travel-crm/brand build && pnpm --filter @travel-crm/web generate
```

**A track's gate** is `pnpm check`'s parts, each in the foreground, with `T` the worktree:

```bash
cd $T && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run format:check && pnpm run scripts:test && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise
cd $T/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec playwright test --project=phone
cd $T/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec playwright test --project=desktop
```

**Gate rules:**

- Each task ends green on the parts it touches. The track's last task ends green on the whole gate.
- A timing test in a package the track doesn't touch (`relay.test.ts`, `counters.test.ts`) may need one rerun alone.
- To run one journey, use `./node_modules/.bin/playwright test test/e2e/<spec>` from `apps/web`.

**The visual audit loop** (L5 and W5, `docs/ui-build-loop.md` section 5):

1. Shoot the track's screens on both projects:
   `AUDIT_OUT=test-results/audit/round-1 pnpm exec playwright test --config playwright.audit.config.ts --project=phone test/e2e/audit/0N-*.audit.ts`,
   then the same with `--project=desktop`.
2. Open every PNG and judge it against `DESIGN.md` and the owner's seven rules. List findings as
   `# | must/should/could | shots | what's wrong | file | the fix`.
3. Fix every must and should in the track's own files. Shared-piece fixes go to "Needs from others".
4. Re-shoot into `round-2` and compare. Repeat until no must is left.
5. Keep the findings table in the track's report.

## Rulings ledger

Format: `Ruling: <what> — <why> — <cost if wrong>`. These are the planner's calls; tracks add their own to their
report.

**Data**

- R1. Ruling: partial-index predicates are written in the schema as `where: raw("…")` exactly as Postgres prints
  them (`pg_get_expr`), e.g.
  `((deleted_at IS NULL) AND (stage = ANY (ARRAY['new'::text, 'contacted'::text, 'quote_sent'::text, 'booking_requested'::text])))`
  — the drift check compares text; a probe on Postgres 18 showed `stage IN (…)` drifts and the printed form doesn't —
  cost if wrong: the db tests fail with a drift message until the predicate is copied from `pg_get_expr`.
- R2. Ruling: a destination's name is unique among live rows ignoring case, through a hand-written expression index
  `destination_name_live ON destination (organization_id, lower(name)) WHERE deleted_at IS NULL` — Prisma's drift
  check ignores expression indexes (probed), and a plain column can't ignore case — cost if wrong: a `name_key`
  column kept by the catalog module.
- R3. Ruling: email and Instagram handle are unique among live people, like the phone — spec 4 refuses a contact
  already on another person, and lookups expect one match — cost if wrong: a family sharing one email must be one
  person; lifting it needs ranking in the match.
- R4. Ruling: a person is matched by phone, then email, then handle; the first hit wins — spec 3.2's "with no phone"
  extended to "no phone match", since an unknown phone with a known email would otherwise break R3 — cost if wrong: a
  new number for a known email joins that person (the form shows their name before saving).
- R5. Ruling: search uses `pg_trgm` GIN indexes on `person.name` and on `person.phone_e164` itself.
  - Text with 4+ digits and no letters is a phone search (`phone_e164 LIKE '%digits%'`).
  - Anything else is a name search: `name ILIKE '%text%' OR text <% name` (word similarity, so "Shrma" finds
    "Sharma").
  - Results come newest first, like the list.

  Why: one ordering, keyset paging intact. Cost if wrong: no relevance ordering; a ranking pass later.

- R6. Ruling: `pg_trgm` and `btree_gist` are created by the leads_by_hand migration (`CREATE EXTENSION IF NOT EXISTS`)
  as `app_migrator` — ADR 0028 and the deploy checklist; both are trusted extensions, and `app_migrator` created them
  on Postgres 18 in the probe — cost if wrong: a hosted database that refuses trusted extensions needs a superuser step (I1 adds it to the
  deploy checklist).
- R7. Ruling: `lead_timeline_entry` is append-only for `app_runtime` (`REVOKE UPDATE, DELETE`) — it is an index of
  what happened; only the platform's erasure removes rows — cost if wrong: a grant migration when entries become
  editable.
- R8. Ruling: a repeat enquiry is its own row (`lead_enquiry`) with the same typed trip columns as `lead` — what the
  customer asked this time, kept as asked, no `jsonb` (ADR 0028) — cost if wrong: a wide table.
- R9. Ruling: tasks are never soft-deleted; they end as done or cancelled — nothing in release 1 deletes one — cost if
  wrong: none.
- R10. Ruling: the destination's `merged_into_id` is a composite, restricting self-key. G1 tests that a purge of an
  organization with merged destinations succeeds, since one `DELETE` removes both rows — the purge orders tables but
  not rows within one — cost if wrong: the purge fails for such an organization; a `SET NULL (merged_into_id)` key
  would fix it.
- R11. Ruling: `@travel-crm/db` exports `sql`, `joinSql`, `emptySql` and `type Sql` (Prisma's `sql`, `join`, `empty`;
  never `raw`). The list, search and Today queries are built as `Sql` and run with `$queryRaw` — the performance test
  must EXPLAIN exactly what the code runs — cost if wrong: three hand-reviewed SQL builders instead of Prisma calls.

**Modules and API**

- R12. Ruling: Track G writes the routers in full. The crm and today functions they call get their final signatures
  and the body `throw new Error("Not built yet: release 1 plan, Task <id>")`; C and S replace each body test first —
  the screen tracks need the real `AppRouter` types to run beside the backend — cost if wrong: a signature C or S must
  change is changed in their track, and the screens adapt at merge.
- R13. Ruling: pages and records name people by id, and the router adds `people: Record<userId, name>` from
  `identity.memberContacts` (`memberNames` in `packages/api`). An id missing from it is a former member — names never
  come from the sign-in tables, and the domain can't reach identity's client — cost if wrong: none.
- R14. Ruling: "people who can work leads" (`leadWorkers`) are active members whose role is Owner or grants
  `leads:view` (any scope). An owner or assignee outside them is refused as `NOT_A_LEAD_WORKER` — a lead owner must
  see the lead — cost if wrong: a role with `leads:edit` but no view can't own leads.
- R15. Ruling: "the agency's Owner" for a departing member's work is the earliest-joined active member on an Owner
  role (`firstOwner`) — spec 4; ADR 0005 keeps at least one Owner — cost if wrong: with several Owners the work lands
  on the senior one.
- R16. Ruling: existing organizations' Admin roles (`org-admin`) get `leads:assign` from a data migration. New
  organizations' Admin role gets it through `PermissionSet.everything()`; custom roles don't. Spec 6 gives Admin the
  permission; ADR 0005 says existing roles aren't changed automatically, so existing Admins could never reassign.
  Cost if wrong: an Owner who wanted their Admins without it removes it in Roles.
- R17. Ruling: blocked contacts (list, unblock, and Block this number) need `leads:assign`; destinations' rename and
  merge need `settings:manage`. Spec 3.6, 4 and 8 say `leads:assign` for blocking; section 6's "settings:manage"
  sentence loses two to one. Cost if wrong: a role with `settings:manage` alone can't unblock; one permission
  changes.
- R18. Ruling: the destination procedures that need `settings:manage` declare `.meta({ planModule: "crm" })` after
  `requires()`; `destinations.search` needs `leads:view` — spec 6: all of it is on the crm plan module, and `requires`
  would otherwise make them core — cost if wrong: none.
- R19. Ruling: `leads.knownContact` needs `leads:view` — both the new-lead form and the person editor ask it — cost if
  wrong: none.
- R20. Ruling: a follow-up or task on a lead needs `leads:edit`; a standalone task, Done and Snooze need `leads:view`;
  giving a task to someone else needs `leads:assign` — spec 6 ("tasks and Today need leads:view") and 4 — cost if
  wrong: one `requires` each.
- R21. Ruling: every task linked to a lead, follow-up or task, is assigned to the lead's owner and moves with it. A
  task's visibility is `scopeFilter(access, "leads:view", "assigneeUserId")` — spec 4 says this of follow-ups, and one
  rule for both keeps "tasks linked to a lead follow the lead" true — cost if wrong: a linked task for someone else
  needs its own scope rule.
- R22. Ruling: an action spanning two modules runs in one transaction. A module calls downwards: crm's
  `mergeDestinations` calls catalog. Where the action belongs to the lower module, the router calls both: Done
  calls `completeTask`, then crm's `recordLeadEvent` for a lead's task. Calls go only down the layers (spec 8), and
  the timeline must show "follow-up done" at once. Cost if wrong: two lines in one router.
- R23. Ruling: `createLead` takes the `Database`, not a transaction, and reruns once in a new transaction when a
  person's contact hits its unique index — Postgres aborts the transaction on the violation, and a racing save must
  end as a known contact — cost if wrong: two transactions in the race.
- R24. Ruling: "Add to that lead" sends `whenOpenLead: "add-to-it"`, never a lead id. The server finds the person's
  newest open lead itself. If it finds one and the input chose nothing, it answers `OPEN_LEAD_EXISTS` and the form
  asks. A salesperson who can't see the lead gets `leadId: null` back. This way no client names a lead it can't see,
  and a race shows the choice. Cost if wrong: none.
- R25. Ruling: times entered as a day and a time travel as `{ on: "yyyy-mm-dd", at: "HH:MM" }` in the agency's zone.
  The server turns them into instants with the kernel's `instantAt`.
  - A due time before now is refused (`DUE_IN_THE_PAST`).
  - "Tomorrow morning" is 09:00 tomorrow in the zone.

  Why: one time zone source, the server's. Cost if wrong: none.

- R26. Ruling: a missing record and one out of scope both answer `DomainError("NOT_FOUND", "NOT_FOUND", …)`, the
  reason `assertRecordInScope` uses — a different reason would tell a salesperson another's lead exists — cost if
  wrong: none.
- R27. Ruling: notifications are bell and push (`channels: ["push"]`), with English text written by the domain as
  share links do. The two kinds:
  - `lead.assigned`: "New lead assigned to you", body "<name> · <destination>";
  - `lead.repeat-enquiry`: "Repeat enquiry on your lead", body "<name> asked again".

  Both link `/leads/<id>`. The departing member's hand-over notifies nobody. Cost if wrong: a summary notification
  later.

- R28. Ruling: audit snapshots never hold note text, task titles or a blocked contact's value. A person's contacts
  appear only in `person.*` entries, which erasure redacts. Erasure must find every copy of a person's data. Cost if
  wrong: entries to redact by hand.

**Behaviour**

- R29. Ruling: Lost and Not a lead cancel every open task on the lead, not just follow-ups; reopening restores none —
  a task on a dead lead would sit in Today forever — cost if wrong: one filter on `kind`.
- R30. Ruling: `reopen_stage` keeps the last open stage. It is set whenever a lead leaves an open stage, so Won → Lost
  keeps it. Reopen returns there, or to New without one.
  - Won sits on the bar, so tapping any stage moves a Won lead freely.
  - Lost and Not a lead are reopened from the ⋯ menu.

  Why: spec 4 "returns the lead to the stage it had before" must never return to a closed stage. Cost if wrong: none.

- R31. Ruling: moving a lead to the stage it is in, and reopening an open lead, change nothing and record nothing — a
  second tab's stale tap — cost if wrong: none.
- R32. Ruling: a contact the form brings fills a gap on the matched person only when no other live person holds it;
  otherwise it is dropped silently. Editing a person refuses the same contact (`CONTACT_ON_ANOTHER_PERSON`); the
  editor first asks `knownContact` to name who holds it. Spec 4 says refused, "naming that person"; a refusal's
  sentence can't carry a name. Cost if wrong: none.
- R33. Ruling: Block this number blocks the phone, else the email, else the handle: one entry. A second block of a
  live-blocked value adds nothing. Unblock soft-deletes the entry, so blocking again works. `knownContact` reports
  `blocked` when any contact given is on the list, and saving still works (spec 4). Cost if wrong: none.
- R34. Ruling: a destination name that matches a merged destination resolves to the one it was merged into. A merge
  moves leads and repeat enquiries to the kept one. That is what `merged_into_id` is for; staff who type the old name
  land on the kept one. Cost if wrong: none.
- R35. Ruling: Today is the signed-in person's own items, whatever their scope (the team view is release 4).
  - Overdue: open tasks due before now.
  - Due today: from now to the agency's next midnight.
  - New leads: owner me, stage New, oldest first.
  - Each section pages 20 at a time.
  - Home's three items: the first overdue, the oldest new lead, the next due today.

  Cost if wrong: one query's filter.

- R36. Ruling: a new lead's timeline holds "created". With another owner it also holds "reassigned" (the mockup's
  "Assigned to Asha"), and with notes a "note". "Not a lead" hides the lead only from the default lists (stage
  "open"); there are no reports yet. Cost if wrong: none.
- R37. Ruling: the departing member's open leads move in batches of 200 per transaction until none are left, as the
  system (`systemActor`). Their tasks go with them, and their open standalone tasks after. A listener's transaction
  has 5 seconds, and each batch is idempotent. Cost if wrong: a member with thousands of leads takes a few runs.
- R38. Ruling: erasing a person does the following:
  - empties their name and contacts, sets `erased_at` and soft-deletes them;
  - soft-deletes their leads, whose trip facts stay for later reports;
  - deletes their leads' notes, repeat enquiries and those rows' timeline entries;
  - empties their leads' task titles;
  - deletes blocked-contact rows matching their former contacts;
  - forgets notifications linking to their leads;
  - redacts the `person` audit entries.

  Spec 7 plus R28. Cost if wrong: an erased person's leads would show "Erased" rows in counts.

- R39. Ruling: the subject export of a `person` gains a `customer` part with:
  - their contacts;
  - each lead's stage, trip and source;
  - notes, enquiries and task titles.

  The console shows the contacts and counts, with a Copy-as-JSON button (`CopyButton`). The spec is silent; DPDP
  needs the export before the erasure, and the Foundation's export holds only audit entries and files. Cost if wrong:
  one console section to drop.

**Screens**

- R40. Ruling: a new lead is a page (`/leads/new`), not a dialog — a long form on a phone; the mockup shows no
  dialog — cost if wrong: moving the form into `ResponsiveDialog`.
- R41. Ruling: the list's filters live in the address (`?view=&stage=&owner=&source=&destination=&tripType=&q=`) —
  back from a lead keeps them — cost if wrong: none.
  - Amended by the final review (W1): the search (`q`) left the address, since a name or a phone in a URL reaches the
    access logs and the Referer. The tab keeps it (sessionStorage), so the way back still finds it.
- R42. Ruling: the quick filters are a registry `ToggleGroup` (single): Open, New, Contacted, Quote sent, Booking
  requested, each with its count, scrolling sideways on phones.
  - Won, Lost and Not a lead are under Filters' Stage.
  - Managers switch Mine/Everyone with registry `Tabs`.
  - A salesperson's first chip reads "Mine · open".

  The mockup's design calls plus spec 3.3. Cost if wrong: one component.

- R43. Ruling: a stage badge is grey (neutral) while open, green for Won and red for Lost (`StatusBadge`). The "what's
  next" line carries the colour:
  - red when overdue;
  - amber for a new lead still waiting;
  - violet (people) when due today;
  - grey for later or none ("No follow-up yet").

  The owner is a violet badge. Order of precedence: an overdue task, then waiting (New), then the next task. These
  are the mockup's design calls. Cost if wrong: one component.

- R44. Ruling: the desktop list is the registry `Table` from `md` (768px), with columns Name (and phone), Trip (and
  source), Stage, Next, Owner, Budget, Added. Below `md` it is an `ItemGroup` (DESIGN.md: tables become divided lists
  below 768px). Cost if wrong: one breakpoint.
- R45. Ruling: the destination picker and Today's lead picker are the registry combobox pattern: `Command` in a
  `Popover`, added with `pnpm dlx shadcn@4.21.4 add command`, which brings `cmdk`.
  - Owner's rule 1: never hand-write a primitive the registry has.
  - It is the one new dependency.

  Cost if wrong: a hand-built listbox, against rule 1.

- R46. Ruling: `TimeField` is the registry `Input` with `type="time"` (the registry's own date-and-time pattern), and
  `DueField` is `DateField` plus `TimeField`. Rule 5 bans only date inputs; there is no registry time picker. Cost if
  wrong: one shared component.
- R47. Ruling: a month is chosen from the next 18 months; each child's age is a select from 0 to 17; ranges read
  "14 – 20 Nov" as the mockup writes them — cost if wrong: none.
- R48. Ruling: Call and WhatsApp show only when the person has a phone.
  - WhatsApp opens `https://wa.me/<digits>`.
  - Call is `tel:` on a phone; on a wide screen it opens a `Popover` with the number and `CopyButton`.
  - Call is the primary button, WhatsApp outline (never green or violet).

  Spec 3.4 and the mockup. Cost if wrong: none.

- R49. Ruling: a per-person budget also shows "About ₹1,80,000 for everyone" when the travellers are known (adults
  plus children) — the mockup — cost if wrong: one line.
- R50. Ruling: Today's "Add a task" may link a lead, picked by searching `leads.list`.
  - Linked, it sends `leads.addWork` with kind `task`; standalone, it sends `tasks.add`.
  - The lead page's "Add follow-up" sends `leads.addWork` with kind `follow-up`.
  - The lead page's "Next follow-up" card lists every open task on the lead, earliest first, each with Done and
    Snooze.

  Spec 3.5's "linked to a lead or standing alone". Cost if wrong: none.

- R51. Ruling: the settings hub lists Destinations (`settings:manage`) and Blocked contacts (`leads:assign`) when
  `crm` is on the plan. The hub itself needs `settings:manage`, which every starter role with `leads:assign` holds.
  Cost if wrong: a custom role with `leads:assign` alone reaches Blocked contacts only by its address.
- R52. Ruling: the navigation is Home, Today, Leads, Staff, Roles, Settings, Audit log. The phone bar shows the first
  four and More; a salesperson's bar is Home, Today, Leads, More. These are the mockup's design calls. Cost if wrong:
  one array.
- R53. Ruling: after saving, the form opens the new lead. After adding to a lead the person can't see, it returns to
  Leads with a toast "Added to <owner>'s lead" — R24 — cost if wrong: none.
- R54. Ruling: journeys and the camera make their leads through the api as the signed-in person
  (`test/e2e/support/leads.ts`), never by writing rows — they go through every rule — cost if wrong: slower setup.

**Process**

- R55. Ruling: the live check in I1 runs `pnpm dev` in `/Users/ak/personal/travel-crm-leads` only when the owner's
  development containers and servers are stopped. Ports 55432, 59000, 51025, 3000-3002 are fixed and the owner's
  `travel-crm-*` containers hold them. When they run, I1 asks the controller for a window rather than stopping
  them. Cost if wrong: the live walk waits.

## File structure

```
packages/db/prisma/schema/{crm,catalog,tasks}.prisma          G1: person, lead, lead_timeline_entry, lead_note,
                                                               lead_enquiry, blocked_contact; destination; task
packages/db/prisma/migrations/20261017100000_leads_by_hand/    G1: tables, extensions, CHECKs, grants, RLS
packages/db/prisma/migrations/20261017110000_admins_assign_leads/  G3: leads:assign for existing Admin roles
packages/contracts/src/{crm,catalog,tasks,today}/              G2: every input, output and event payload
packages/domain/src/catalog/                                   G3: destinations
packages/domain/src/tasks/                                     G3: follow-ups and tasks on any record
packages/domain/src/crm/                                       G3/G4 frame; C: people, leads, timeline, blocking;
                                                               S: work queries, departing member, erasure, demo
packages/domain/src/today/                                     G4 frame; S: summary and sections
packages/api/src/routers/{destinations,tasks,leads,blocked-contacts,today}.ts   G4
apps/web/src/components/forms/{time-field,due-field}.tsx       G5
apps/web/src/leads/{stage-badge,next-step,owner-badge,contact-buttons,trip-line,use-lead-owners}.ts(x)  G5
apps/web/src/tasks/{task-actions,snooze-dialog}.tsx            G5
apps/web/src/leads/{list,form,lead}/, app/(app)/leads/         L
apps/web/src/{today,crm-settings}/, app/(app)/{today,settings/destinations,settings/blocked-contacts}/  W
```

---

## Track G: Shared pieces (on `leads/r1`, in order)

### Task G1: The tables, the extensions and their isolation

**Files:**

- Create:
  - `packages/db/prisma/schema/{crm,catalog,tasks}.prisma`;
  - `packages/db/prisma/migrations/20261017100000_leads_by_hand/migration.sql`;
  - `packages/db/test/org-table-fixtures/{crm,catalog,tasks}.ts`;
  - `packages/db/test/leads-tables.test.ts`.
- Modify:
  - `packages/db/prisma/schema/organization.prisma` (back-relations);
  - `packages/db/src/soft-delete.ts` (`Person`, `Lead`, `Destination`, `BlockedContact`);
  - `packages/db/src/index.ts` (the SQL helpers);
  - `packages/db/sql/bootstrap.sql` (both extensions);
  - `packages/db/test/testing.ts` (`analyzeTables`).

**Interfaces:**

- Produces the models below (Prisma names; columns snake_case through `@map`). Every model has:
  - `organizationId` (the README's exact line);
  - `id String @id @default(uuid(7)) @db.Uuid`;
  - `@@unique([organizationId, id])`;
  - a Restrict/Restrict relation to `Organization`.
  - **`Person`:**
    - `name`;
    - `phoneE164?`, `email?`, `instagramHandle?`;
    - `createdBy? @db.Uuid`, `createdAt`, `updatedAt`;
    - `erasedAt?`, `deletedAt?`, `deletedBy?`.
  - **`Lead`:**
    - `personId`;
    - `stage` (default `"new"`), `reopenStage?`, `stageChangedAt`, `firstReplyAt?`;
    - `returning Boolean`, `ownerUserId? @db.Uuid`;
    - `destinationId?`;
    - `travelKind` (default `"unknown"`), `travelStart? @db.Date`, `travelEnd? @db.Date`, `travelMonth? @db.Date`;
    - `adults? Int`, `childrenAges Int[] @default([])`;
    - `budgetPaise? BigInt`, `budgetBasis?`;
    - `departureCity?`, `tripType?`, `hotelCategory?`, `food?`, `roomType?`;
    - `source`, `sourceDetail?`;
    - `createdBy?`, `createdAt`, `updatedAt`, `deletedAt?`, `deletedBy?`.
  - **`LeadTimelineEntry`:**
    - `leadId`, `kind`, `occurredAt`, `actorUserId?`;
    - `recordType?`, `recordId?`;
    - `stage?`, `ownerUserId?`.
  - **`LeadNote`:** `leadId`, `body`, `createdBy?`, `createdAt`.
  - **`LeadEnquiry`:**
    - `leadId`;
    - the trip columns of `Lead`, from `destinationId` to `roomType`;
    - `source`, `sourceDetail?`, `note?`;
    - `createdBy?`, `createdAt`.
  - **`BlockedContact`:** `kind`, `value`, `blockedBy?`, `createdAt`, `deletedAt?`, `deletedBy?`.
  - **`Destination`:** `name`, `mergedIntoId?`, `createdBy?`, `createdAt`, `updatedAt`, `deletedAt?`, `deletedBy?`.
  - **`Task`:**
    - `kind`, `title`;
    - `dueAt`, `firstDueAt`;
    - `assigneeUserId?`;
    - `recordType?`, `recordId? @db.Uuid`;
    - `doneAt?`, `doneBy?`, `cancelledAt?`;
    - `createdBy?`, `createdAt`, `updatedAt`.
- Keys between organization tables are composite `(organization_id, x_id)` with Restrict/Restrict:
  - lead → person, lead → destination;
  - timeline, note and enquiry → lead;
  - enquiry → destination;
  - destination → destination (`mergedIntoId`).
- Indexes, by exact name. "open" is the four open stages, "live" is `deleted_at IS NULL`; predicates are per R1.
  - **`lead`:**
    - `lead_open_by_owner (organization_id, owner_user_id, id DESC)`, open and live;
    - `lead_open (organization_id, id DESC)`, open and live;
    - `lead_open_stage_counts (organization_id, stage, owner_user_id)`, open and live;
    - `lead_new_by_owner (organization_id, owner_user_id, id)`, `stage = 'new'` and live;
    - `lead_live (organization_id, id DESC)`, live;
    - `lead_live_by_owner (organization_id, owner_user_id, id DESC)`, live;
    - `lead_person (organization_id, person_id)`;
    - `lead_destination (organization_id, destination_id)`.
  - **`person`:**
    - `person_phone_live`, `person_email_live`, `person_instagram_live`: unique, `where: { deletedAt: null }`;
    - `person_name_trgm`, `person_phone_trgm`: GIN `gin_trgm_ops`.
  - **`destination`:**
    - `destination_name_trgm`: GIN;
    - `destination_name_live`: hand-written, R2.
  - **`task`:**
    - `task_open_by_assignee (organization_id, assignee_user_id, due_at, id)`, open meaning
      `((done_at IS NULL) AND (cancelled_at IS NULL))`;
    - `task_open_by_record (organization_id, record_type, record_id, due_at)`, open;
    - `task_by_record (organization_id, record_type, record_id)`.
  - **The rest:**
    - `lead_timeline_entry_by_lead (organization_id, lead_id, id DESC)`;
    - `lead_note_by_lead`, `lead_enquiry_by_lead`;
    - `blocked_contact_live`: unique `(organization_id, kind, value)`, live;
    - `blocked_contact_list (organization_id, id DESC)`, live.
- Produces from `@travel-crm/db`: `sql`, `joinSql`, `emptySql` and `type Sql` (R11).
- Produces from `@travel-crm/db/testing`: `analyzeTables(urls: DbUrls, tables: readonly string[]): Promise<void>`
  (runs `ANALYZE` as the migrator, the tables' owner).

- [ ] **Step 1: Write the failing tests** in `packages/db/test/leads-tables.test.ts` and the three fixture files.
  - Isolation fixtures for all eight tables; `lead_timeline_entry` is marked `appendOnly: true`.
  - The tests below insert as the runtime role in `forOrg`; a CHECK violation is matched by the constraint's name.

```ts
it("creates pg_trgm and btree_gist", …)                 // pg_extension holds both
it("refuses a person with no phone, email or handle", …) // rejects /person_has_contact/
it("keeps each phone, email and handle to one live person, and frees it when that person is deleted", …)
it("stores emails in lower case and handles without @, in lower case", …) // 'Rahul@X.in' and '@rahul' refused
it("holds stages, trip types, hotel categories, food, sources and budget bases to their lists", …)
it("fits a lead's travel to its kind: dates in order, a month as its first day, nothing when flexible", …)
it("holds children's ages between 0 and 17, at most twenty", …)
it("names a destination once among live ones, ignoring case", …) // 'Goa' then 'goa' rejects destination_name_live
it("purges an organization whose destinations were merged", …)  // deleteOrganizationRows resolves
```

- [ ] **Step 2: Run them to see them fail.**
  - Run `pnpm --filter @travel-crm/db test -- leads-tables isolation`.
  - Expected: FAIL; the tables don't exist.
- [ ] **Step 3: Write the schema and migration** by the README's recipe (`prisma migrate diff … --output`).
  - At the top of `migration.sql`: `CREATE EXTENSION IF NOT EXISTS pg_trgm;` and the same for `btree_gist`.
  - Append the CHECKs, named `<table>_<rule>`:
    - `person_has_contact`: `erased_at` set, or one contact;
    - `person_name_length`: 1-120, or `''` once erased;
    - `person_phone_format` (`^\+[1-9][0-9]{6,14}$`), `person_email_lower`, `person_instagram_format`
      (`^[a-z0-9._]{1,30}$`);
    - `lead_stage_value`, and `lead_reopen_stage_open`, which allows open stages only;
    - `lead_travel_kind_value` (`dates`, `month`, `flexible`, `unknown`);
    - `lead_travel_fits_kind`;
    - `lead_adults_range` (1-99);
    - `lead_children_ages`: `cardinality <= 20 AND 0 <= ALL(…) AND 17 >= ALL(…)`;
    - `lead_budget_pair` and `lead_budget_positive`;
    - one value check each for basis, trip type, hotel category (`3_star`, `4_star`, `5_star`, `any`), food (`veg`,
      `jain`, `non_veg`) and source (the fourteen in G2);
    - text lengths of at most 120;
    - the same trip checks on `lead_enquiry`;
    - `lead_timeline_entry_kind_value`;
    - `lead_note_body_length` (1-4000);
    - `blocked_contact_kind_value`;
    - `destination_name_length` (1-80, trimmed);
    - `task_kind_value` (`follow-up`, `task`);
    - `task_title_length` (at most 200; empty only from erasure);
    - `task_record_pair`, `task_follow_up_has_record`, `task_done_or_cancelled`.
  - Append the grants, the hand-written index and RLS:
    - `CREATE UNIQUE INDEX destination_name_live …`;
    - `REVOKE DELETE ON TABLE person, lead, destination, blocked_contact FROM app_runtime;`;
    - `REVOKE UPDATE, DELETE ON TABLE lead_timeline_entry FROM app_runtime;`;
    - `SELECT app_enable_org_rls('<table>');` for each of the eight tables.
  - Add both extensions to `bootstrap.sql`.
  - Run `pnpm --filter @travel-crm/db generate`.
- [ ] **Step 4: Run the db tests.**
  - Run `pnpm --filter @travel-crm/db test`.
  - Expected: PASS, including the isolation, organization-keys, schema, soft-delete and drift checks.
- [ ] **Step 5: Commit.** Stage the files above by name.
  - Message: `feat(db): people, leads, destinations and tasks tables, with trigram search`.

### Task G2: Every contract, and the kernel's wall-clock time

**Files:**

- Modify:
  - `packages/contracts/src/kernel/time.ts`;
  - `packages/domain/src/kernel/{time,index}.ts`;
  - `packages/domain/test/kernel/time.test.ts`.
- Create:
  - `packages/contracts/src/crm/{index,fields,trip,leads,lead-page,timeline,blocked-contacts,events}.ts`;
  - `packages/contracts/src/catalog/{index,destinations}.ts`;
  - `packages/contracts/src/tasks/{index,tasks}.ts`;
  - `packages/contracts/src/today/{index,today}.ts`;
  - `packages/contracts/test/{crm/fields,crm/leads,tasks/tasks}.test.ts`.

**Interfaces** (outputs `z.object`, inputs `z.strictObject`; `datetime` means `z.iso.datetime()`):

- Kernel:
  - in contracts: `timeOfDay` (`/^([01]\d|2[0-3]):[0-5]\d$/`), `wallClockTime = { on: calendarDate, at: timeOfDay }`
    and `WallClockTime`;
  - in the domain: `type TimeOfDay`, `parseTimeOfDay(text): TimeOfDay`,
    `instantAt(day: CalendarDate, time: TimeOfDay, timeZone: string): Date`,
    `timeOfDayIn(instant: Date, timeZone: string): TimeOfDay`.
- `crm/fields.ts`, the lists:
  - `leadStages`, `openLeadStages`, `closedLeadStages`, `stageBarStages`, `leadStage`, `isOpenStage(stage)`;
  - `tripTypes`, `hotelCategories`, `foodPreferences`, `budgetBases`, `contactKinds` (`phone`, `email`, `instagram`);
  - `leadSources`: `phone_call`, `walk_in`, `referral`, `instagram`, `facebook`, `website`, `other`, `google_sheet`,
    `bulk_upload`, `web_form`, `integration`, `meta_lead_ad`, `whatsapp`, `package_page`;
  - `handLeadSources`, the first seven.
- `crm/fields.ts`, the fields:
  - `personName` (trim, 1-120);
  - `emailAddress` (trim, lower case, email, ≤254);
  - `instagramHandle` (trim, strip one leading `@`, lower case, `^[a-z0-9._]{1,30}$`);
  - `personContacts = { phone?: phoneNumber, email?, instagramHandle? }`, with "at least one", the issue on `phone`;
  - `shortText` (trim, 1-120);
  - `peopleNames = z.record(recordId, z.string())`.
- `crm/trip.ts`:
  - `calendarMonth` (`YYYY-MM`);
  - `travelWhen`, a union on `kind`: `{dates, from, to}` (to ≥ from), `{month, month}`, `{flexible}`, `{unknown}`;
  - `destinationChoice`, a union: `{kind:"existing", destinationId}` or `{kind:"new", name: destinationName}`;
  - `budgetInput = { amount: moneyField, basis }` (paise 1 to 10¹¹), and its output twin `budget`;
  - `tripInput`: every key present, each nullable but `when` and `childrenAges`. The keys: `destination`, `when`,
    `adults` (1-99), `childrenAges` (≤20 of 0-17), `budget`, `departureCity`, `tripType`, `hotelCategory`, `food`,
    `roomType`;
  - `tripSummary = { destinationName|null, when, adults|null, childrenCount }`;
  - `tripDetail`: `tripInput`'s outputs, with `destination: {id, name}|null`.
- `crm/leads.ts`:
  - `createLeadInput`:
    - `person: { name, ...personContacts }`, `trip`, `note|null` (1-4000);
    - `source: handLeadSource`, `sourceDetail|null`;
    - `ownerUserId: recordId|null` (null: me);
    - `whenOpenLead: "add-to-it"|"new-lead"|null`.
  - `createdLead = { outcome: "created"|"added-to-open-lead", leadId|null, returning }`.
  - `knownContactInput = personContacts`.
  - `knownContactResult`:
    - `match: { personName, matchedBy: contactKind, openLead: { leadId|null, destinationName|null, ownerUserId|null }|null }|null`;
    - `blocked`, `people`.
  - `listLeadsInput`:
    - `view: "mine"|"everyone"` (default `mine`), `stage: "open"|leadStage` (default `open`);
    - `ownerUserId?`, `source?`, `destinationId?`, `tripType?`;
    - `search?` (trim, 2-80);
    - `before?`, `limit` (1-50, default 25).
  - `leadListItem`:
    - `id`, `person: { name, phone|null }`, `returning`, `stage`;
    - `trip: tripSummary`, `source`, `ownerUserId|null`, `budget|null`, `createdAt`;
    - `next: { awaitingReplySince: datetime|null, task: { id, kind, title, dueAt }|null }`.
  - `leadListPage = { items, nextCursor|null, people }`.
  - `leadCountsInput`: `listLeadsInput` without `stage`, `before` and `limit`.
  - `leadCounts = { open, new, contacted, quote_sent, booking_requested }`.
  - `leadWorker = { userId, name }`.
- `crm/lead-page.ts`:
  - `leadIdInput`;
  - `leadDetail`:
    - `id`, `stage`, `reopenStage|null`, `stageChangedAt`, `firstReplyAt|null`, `returning`;
    - `person: { id, name, phone|null, email|null, instagramHandle|null }`, `trip: tripDetail`;
    - `source`, `sourceDetail|null`, `ownerUserId|null`, `createdBy|null`, `createdAt`;
    - `work: { id, kind, title, dueAt, assigneeUserId|null }[]` (the same task shape `TaskActions` takes);
    - `people`.
  - `moveStageInput = { leadId, stage }`, `reassignLeadInput = { leadId, ownerUserId }`.
  - `editTripInput = { leadId, trip }`, `editPersonInput = { leadId, person: { name, ...personContacts } }`.
  - `addNoteInput = { leadId, body }`, `addLeadWorkInput = { leadId, kind: taskKind, title: taskTitle, due: wallClockTime }`.
- `crm/timeline.ts`:
  - `leadEventKinds`: `created`, `note`, `stage-changed`, `reassigned`, `follow-up-added`, `follow-up-done`,
    `follow-up-cancelled`, `repeat-enquiry`, `trip-edited`;
  - `timelineInput = { leadId, before?, limit (1-50, default 20) }`;
  - `timelineEntry`, a union on `kind`, each with `id`, `occurredAt`, `actorUserId|null`:
    - `created { source }`;
    - `note { body }`;
    - `stage-changed { stage }`;
    - `reassigned { ownerUserId|null }`;
    - the three `follow-up-*`, with `{ task: { kind, title, dueAt } }`;
    - `repeat-enquiry { enquiry: { source, sourceDetail|null, note|null, trip: tripDetail } }`;
    - `trip-edited`.
  - `timelinePage = { entries, nextCursor|null, people }`.
- `crm/blocked-contacts.ts`:
  - `blockedContactsInput = { before?, limit default 25 }`;
  - `blockedContact = { id, kind, value, blockedBy|null, blockedAt }`;
  - `blockedContactsPage = { items, nextCursor, people }`;
  - `unblockContactInput = { blockedContactId }`.
- `crm/events.ts`, the payload schemas:
  - `leadCreatedEvent { leadId, personId }`;
  - `leadStageChangedEvent { leadId, from, to }`;
  - `leadReassignedEvent { leadId, fromUserId|null, toUserId|null }`;
  - `leadRepeatEnquiryEvent { leadId, enquiryId }`;
  - `leadEvent { leadId }`, `personEvent { personId }`, `blockedContactEvent { blockedContactId }`.
- `catalog`:
  - `destinationName` (trim, inner spaces collapsed, 1-80), `destination = { id, name }`;
  - `searchDestinationsInput = { query? (≤80), limit (1-100, default 20) }`;
  - `renameDestinationInput = { destinationId, name }`;
  - `mergeDestinationsInput = { destinationId, intoDestinationId }` (the two differ), `mergedDestinations = { leadsMoved }`;
  - events `destinationEvent { destinationId }`, `destinationMergedEvent { destinationId, intoDestinationId }`.
- `tasks`:
  - `taskKinds` (`follow-up`, `task`), `taskTitle` (trim, 1-200);
  - `task = { id, kind, title, dueAt, firstDueAt, assigneeUserId|null, record: { recordType, recordId }|null, doneAt|null, cancelledAt|null }`;
  - `addTaskInput = { title, due: wallClockTime, assigneeUserId|null }`, `taskIdInput = { taskId }`;
  - `snoozeTaskInput = { taskId, until }`, `until` a union on `choice`: `one-hour`, `tomorrow-morning`, or
    `at { due: wallClockTime }`;
  - event `taskEvent { taskId }`.
- `today`:
  - `todaySectionName` (`overdue`, `new-leads`, `due-today`);
  - `leadBrief = { id, personName, phone|null, trip: tripSummary, source }`;
  - `todayItem`, a union on `kind`: `task { task, lead: leadBrief|null }` or `new-lead { lead, waitingSince }`;
  - `todaySummary = { day: calendarDate, counts: { overdue, newLeads, dueToday }, top: todayItem[] (≤3) }`;
  - `todaySectionInput = { section, after?, limit (1-50, default 20) }`, `todaySectionPage = { items, nextCursor }`.

- [ ] **Step 1: Write the failing tests:**

```ts
// packages/domain/test/kernel/time.test.ts
it("puts 09:00 on 17 Oct 2026 in Asia/Kolkata at 03:30 UTC", …)  // instantAt("2026-10-17","09:00","Asia/Kolkata")
it("moves a time that a spring-forward skips to the first instant after it", …) // 2026-03-08 02:30 New York → 07:00Z
it("takes the first of a time that happens twice", …)            // 2026-11-01 01:30 New York → 05:30Z
it("reads the wall clock back", …)                               // timeOfDayIn(…) === "09:00"
// packages/contracts/test/crm/fields.test.ts
it("needs a name and at least one contact", …)
it("reads 098765-43210 and +91 98765 43210 as +919876543210", …)
it("lower-cases email and strips one @ from a handle", …)        // "@Rahul.S" → "rahul.s"
it("refuses a trip whose dates end before they start, and a month not YYYY-MM", …)
it("refuses unknown keys in every input", …)                     // createLeadInput with { extra: 1 } fails
// packages/contracts/test/tasks/tasks.test.ts
it("accepts the three snooze choices and refuses a time not HH:MM", …)
```

- [ ] **Step 2: Run them to see them fail.** Run `pnpm --filter @travel-crm/contracts test` and
      `pnpm --filter @travel-crm/domain test -- kernel/time`. Expected: FAIL; nothing is exported yet.
- [ ] **Step 3: Write the contracts and the kernel functions.**
  - `instantAt` uses the same offset correction as `startOfDayIn`: guess with the offset at the wall clock read as
    UTC, then correct once.
  - A skipped wall-clock time takes the later candidate.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(contracts): release 1's crm, catalog, tasks and today contracts`.

### Task G3: `leads:assign`, and the destinations and tasks modules

**Files:**

- Create:
  - `packages/domain/src/catalog/{index,destinations,README.md}`;
  - `packages/domain/src/tasks/{index,task-record,task-changes,task-queries,erasure,README.md}`;
  - `packages/domain/src/crm/{index,lead-events,destination-merges}.ts`;
  - `packages/db/prisma/migrations/20261017110000_admins_assign_leads/migration.sql`;
  - `packages/domain/test/crm/support/records.ts`;
  - `packages/domain/test/catalog/destinations.test.ts`;
  - `packages/domain/test/tasks/{task-changes,task-queries}.test.ts`;
  - `packages/db/test/admins-assign-leads.test.ts`.
- Modify:
  - `packages/domain/src/identity/permissions.ts` (`"leads:assign"`, after `"leads:edit"`);
  - `packages/domain/test/identity/starter-roles.test.ts`;
  - `apps/web/src/i18n/messages/en-IN/roles.json` (`leads:assign`: "Reassign leads and choose their owner");
  - `apps/web/src/i18n/messages/en-IN/{errors,audit}.json`;
  - `.dependency-cruiser.cjs` (`business-modules-call-down`).

**Interfaces:**

- Consumes G1's models, G2's contracts, `recordAudit`, `publishEvent`, `scopeFilter` and `organizationTimeZone`.
- Produces the permission `leads:assign` (R16): the Owner holds it at run time, a new organization's Admin role
  through `PermissionSet.everything()`, and existing Admin roles through the migration:
  `INSERT INTO role_permission (organization_id, role_id, permission, scope) SELECT organization_id, id, 'leads:assign', NULL FROM role WHERE key = 'org-admin' AND deleted_at IS NULL ON CONFLICT DO NOTHING;`
- Produces from catalog:
  - `findOrAddDestination(tx, actor, name): Promise<Destination>`: a case-insensitive live match, or a merged name's
    target, or a new row; the insert uses `ON CONFLICT DO NOTHING` against `destination_name_live`, then reads.
  - `destinationById(tx, id)`;
  - `searchDestinations(tx, input)`, which returns live destinations, alphabetical, by `ILIKE` or `<%`;
  - `renameDestination(tx, actor, input)`;
  - `mergeDestination(tx, actor, input)`;
  - `destinationNames(tx, ids): Promise<Map<string, string>>` (deleted ones included).
- Produces from tasks, with `TaskRecordLink = { recordType: string; recordId: string }`:
  - `createTask(tx, actor, { kind, title, dueAt: Date, assigneeUserId: string|null, record: TaskRecordLink|null }): Promise<Task>`;
  - `addStandaloneTask(tx, access, input: AddTaskInput, context: { owners: ReadonlySet<string>; now: Date }): Promise<Task>`;
  - `completeTask(tx, access, taskId, now): Promise<Task>`;
  - `snoozeTask(tx, access, input: SnoozeTaskInput, now): Promise<Task>`;
  - `cancelOpenTasks(tx, actor, record, now): Promise<Task[]>`;
  - `reassignOpenTasks(tx, actor, record, assigneeUserId: string|null): Promise<Task[]>`;
  - `reassignOpenStandaloneTasks(tx, actor, { fromUserId, toUserId }): Promise<number>`;
  - `openTasksOf(tx, record): Promise<Task[]>`, by due time;
  - `nextOpenTasks(tx, recordType, recordIds): Promise<Map<string, Task>>`;
  - `openTasksQuery(filter: OpenTasksFilter): Sql`, `listOpenTasks(tx, filter)`, `countOpenTasks(tx, filter)`, with
    `OpenTasksFilter = { assigneeUserId: string; dueFrom?: Date; dueBefore?: Date; after?: string; limit: number }`;
  - `redactTaskTitles(tx, { organizationId, recordType, recordIds }): Promise<number>`.
- Produces from crm (owned by G, used by C and S):
  - `recordLeadEvent(tx, actor, entry: { leadId; kind: LeadEventKind; record?: { recordType: "lead_note"|"lead_enquiry"|"task"; recordId }; stage?: LeadStage; ownerUserId?: string|null; occurredAt?: Date }): Promise<void>`;
  - `mergeDestinations(tx, actor, input): Promise<{ leadsMoved: number }>`.
- Produces the test seeds (`test/crm/support/records.ts`): `aPerson(tx, overrides?)`, `aLead(tx, overrides)` and
  `aTask(tx, overrides)`, each a direct insert for other tests' setup.
- Produces the refusals: `NOT_A_LEAD_WORKER`, `DUE_IN_THE_PAST`, `TASK_CLOSED`, `DESTINATION_NAME_TAKEN`,
  `MERGE_INTO_ITSELF`.
- Produces the audit actions: `task.added`, `task.done`, `task.snoozed`, `task.cancelled`, `task.reassigned`,
  `destination.added`, `destination.renamed`, `destination.merged`. The events take the same names.
- `business-modules-call-down` fails a call from catalog or tasks to crm or today, and from crm to today.

- [ ] **Step 1: Write the failing tests:**

```ts
it("gives the Owner and the Admin starter role leads:assign, and Sales none", …)    // starter-roles.test.ts
it("gives an organization's Admin role leads:assign once, and no other role", …)   // runs the migration's SQL twice
// packages/domain/test/catalog/destinations.test.ts
it("finds 'goa' as Goa, and adds Kashmir once when two saves race", …)
it("resolves a merged destination's name to the one it was merged into", …)
it("refuses a rename to a live name in any case: DESTINATION_NAME_TAKEN", …)
it("merges: leads and repeat enquiries move, the old one is gone from search", …) // via crm's mergeDestinations
// packages/domain/test/tasks/task-changes.test.ts
it("snoozes to 09:00 tomorrow in the agency's zone, even at 23:30", …) // 23:30 IST 16 Oct → 2026-10-17T03:30Z
it("keeps the first due time when snoozed", …)
it("answers TASK_CLOSED to a second Done, and records one task.done", …)
it("refuses a salesperson's Done or Snooze on another's task as NOT_FOUND", …)
it("refuses a time before now: DUE_IN_THE_PAST", …)
it("gives a standalone task to someone else only with leads:assign, and only to a lead worker", …)
it("cancels and reassigns a record's open tasks, leaving done ones", …)
// packages/domain/test/tasks/task-queries.test.ts
it("lists open tasks by due time, a page after a cursor", …)
it("gives each record its earliest open task", …)
```

- [ ] **Step 2: Run them to see them fail.** Run `pnpm --filter @travel-crm/domain test -- catalog tasks`. Expected:
      FAIL; the modules don't exist.
- [ ] **Step 3: Write the modules and the words.**
  - Add each reason's sentence to `errors.json` and each action's to `audit.json`, under `actions.task.*` and
    `actions.destination.*`, with `recordTypes.task` and `recordTypes.destination`.
  - Audit snapshots hold `kind`, `dueAt`, `assigneeUserId` and `recordType`, never the title (R28).
  - Each module's README says what it owns and its public functions.
- [ ] **Step 4: Run the gate's first line.** Expected: PASS, including the reasons and actions tests.
- [ ] **Step 5: Commit.** Message: `feat(domain): leads:assign, and the destinations and tasks modules`.

### Task G4: The people who work leads, and every new procedure

**Files:**

- Modify:
  - `packages/domain/src/identity/{identity,index}.ts`;
  - `packages/domain/src/identity/README.md`;
  - `packages/api/src/routers/app-router.ts`.
- Create:
  - `packages/domain/src/identity/lead-workers.ts`;
  - the stubs `packages/domain/src/crm/{known-contact,create-lead,lead-list,lead-list-query,lead-detail,timeline,lead-changes,lead-work,blocking}.ts`
    and `packages/domain/src/today/{index,today}.ts`;
  - `packages/api/src/member-names.ts`;
  - `packages/api/src/routers/{destinations,tasks,leads,blocked-contacts,today}.ts`, registered in `app-router.ts`.
- Test: create `packages/domain/test/identity/lead-workers.test.ts`, `packages/api/test/crm-procedures.test.ts`,
  `apps/api/test/leads-owners.test.ts` and `apps/api/test/tasks-and-destinations.test.ts`.

**Interfaces:**

- Produces from identity:
  - `leadWorkers(database, organizationId): Promise<LeadWorker[]>`, sorted by name (R14);
  - `firstOwner(database, organizationId): Promise<string | null>` (R15);
  - on `Identity`: `leadWorkers(organizationId)` and `firstOwner(organizationId)`.
- Produces from the api: `memberNames(identity, organizationId, userIds): Promise<Record<string, string>>`.
- **The stubs, owned by Track C after this commit** (`MemberAccess` as `access`; mutations return `void` unless
  named):

```ts
findKnownContact(tx: OrgTx, access, contacts: PersonContacts): Promise<Omit<KnownContactResult, "people">>
createLead(database: Database, access, input: CreateLeadInput, context: { owners: ReadonlySet<string>; now: Date }): Promise<CreatedLead>
listLeads(tx, access, input: ListLeadsInput, now: Date): Promise<Omit<LeadListPage, "people">>
countLeads(tx, access, input: LeadCountsInput): Promise<LeadCounts>
leadListQuery(filter: LeadListFilter): Sql            // lead-list-query.ts, with LeadListFilter as C3 gives it
getLead(tx, access, leadId: string): Promise<Omit<LeadDetail, "people">>
listLeadTimeline(tx, access, input: TimelineInput): Promise<Omit<TimelinePage, "people">>
addLeadNote(tx, access, input: AddNoteInput)
moveLeadStage(tx, access, input: MoveStageInput, now: Date)
reopenLead(tx, access, input: LeadIdInput, now: Date)
reassignLead(tx, access, input: ReassignLeadInput, context: { owners: ReadonlySet<string>; now: Date })
editLeadTrip(tx, access, input: EditTripInput)
editLeadPerson(tx, access, input: EditPersonInput)
addLeadWork(tx, access, input: AddLeadWorkInput, now: Date): Promise<Task>
blockLeadContact(tx, access, input: LeadIdInput, now: Date)
listBlockedContacts(tx, input: BlockedContactsInput): Promise<Omit<BlockedContactsPage, "people">>
unblockContact(tx, access, input: UnblockContactInput)
```

- **The stubs, owned by Track S after this commit:**
  - `todaySummary(tx, access, now): Promise<TodaySummary>`;
  - `todaySection(tx, access, input: TodaySectionInput, now): Promise<TodaySectionPage>`.
- The routers, with every handler written in full:
  - `destinations.search`: `leads:view`;
  - `destinations.rename` and `destinations.merge`: `settings:manage`, plan module crm (R18);
  - `tasks.add`, `tasks.complete` and `tasks.snooze`: `leads:view`; `complete` also writes `follow-up-done` through
    `recordLeadEvent` when the task's record is a lead (R22);
  - `leads`:
    - `list`, `counts`, `owners`, `knownContact`, `get`, `timeline`: `leads:view`;
    - `create`: `leads:create`;
    - `addNote`, `moveStage`, `reopen`, `editTrip`, `editPerson`, `addWork`: `leads:edit`;
    - `reassign`, `block`: `leads:assign`.
  - `blockedContacts.list` and `blockedContacts.unblock`: `leads:assign`.
  - `today.summary` and `today.section`: `leads:view`.
  - `owners` is written in full here: every lead worker for a holder of `leads:assign`, otherwise only themselves.
  - `create`, `reassign` and `tasks.add` pass `owners` from `identity.leadWorkers`.

- [ ] **Step 1: Write the failing tests:**

```ts
it("lists active members whose role sees leads, by name, without removed or banned ones", …)
it("names the earliest-joined active Owner", …)
it("puts every leads, blockedContacts, today, tasks and destinations procedure on the crm plan module", …)
it("lists every lead worker for an Owner, and only themselves for a salesperson", …) // leads.owners over HTTP
it("refuses leads.reassign to a salesperson: MISSING_PERMISSION", …)
it("writes 'follow-up done' on the lead's timeline when a lead's task is done", …) // tasks-and-destinations.test.ts
it("lets only settings:manage rename and merge, on the crm plan module", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Each stub's body is `throw new Error("Not built yet: release 1 plan, Task <C1…C6 | S1>")`.
  - `crm/index.ts` exports every stub.
  - `lead-list-query.ts` holds `LeadListFilter` as C3 gives it.
- [ ] **Step 4: Run the gate's first line.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(api): lead workers, and every release 1 procedure`.

### Task G5: The web's shared pieces

**Files:**

- Create:
  - `apps/web/src/components/forms/{time-field,due-field}.tsx`;
  - `apps/web/src/lib/{relative-time,use-now}.ts`;
  - `apps/web/src/leads/{stage-badge,next-step,owner-badge,contact-buttons}.tsx` and
    `apps/web/src/leads/{trip-line,use-lead-owners}.ts`;
  - `apps/web/src/tasks/{task-actions,snooze-dialog}.tsx`;
  - `apps/web/src/i18n/messages/en-IN/{leads,tasks,today}.json`;
  - the registry's `toggle-group.tsx` and `command.tsx`, by the CLI.
- Modify:
  - `src/lib/routes.ts` (`leads`, `newLead`, `today`, `destinations`, `blockedContacts`, `leadRoute(leadId)`);
  - `src/shell/{navigation,prefetch}.ts`;
  - `shell.json`;
  - `src/i18n/messages.ts`;
  - `src/session/me-context.tsx` (`viewScope`);
  - `src/app/(app)/page.tsx` (its set-up list leaves out `today` and `leads`);
  - `src/components/ui/README.md`;
  - `test/e2e/audit/shot-list.ts`;
  - `test/shell/navigation.test.ts`;
  - `test/e2e/shell.spec.ts` (the bars).
- Test:
  - `test/components/{time-field,due-field}.test.tsx`;
  - `test/lib/relative-time.test.ts`;
  - `test/leads/{trip-line,next-step,stage-badge,contact-buttons}.test.tsx`;
  - `test/tasks/{task-actions,snooze-dialog}.test.tsx`;
  - `test/session/view-scope.test.ts`.

**Interfaces** (paths under `apps/web/src`):

- `TimeField<Values>({ control, name, label, hint? })`: the value is `"HH:MM"`, and `""` while empty.
- `DueField<Values>({ control, dayName, timeName, label })`.
- `elapsed(since, now): { unit: "minute"|"hour"|"day"; count }`.
- `dayRelation(instant, { timeZone, now }): "earlier"|"yesterday"|"today"|"tomorrow"|"later"`.
- `useNow(everyMs = 60_000): Date`.
- `StageBadge({ stage })` (R43).
- `NextStep({ next, timeZone })` (R43).
- `OwnerBadge({ name: string | null })`; null reads "A former member".
- `CallButton({ phone, name, variant })`, `WhatsAppButton({ phone, variant })`, `whatsAppLink(e164)` (R48).
- `useTripLine(): (trip: TripSummary) => string`.
- `useLeadOwners()`, the query `leads.owners`.
- `TaskActions({ task }: { task: { id: string; title: string } })`: ghost Done and ghost Snooze. It invalidates
  `today.*`, `leads.get`, `leads.list` and `leads.timeline`.
- `SnoozeDialog({ taskId, open, onOpenChange })`: a `RadioGroup` of the three choices, with `DueField` for "Choose a
  time", in `ResponsiveDialog` with `busy`.
- `viewScope(me, "leads:view"): "own"|"all"|null`.
- The navigation items `today` and `leads`: `requires: "leads:view"`, `module: "crm"`, in R52's order.
- The words:
  - `leads.json`: `stages`, `sources`, `tripTypes`, `hotelCategories`, `food`, `budgetBasis`, `trip`, `next`,
    `contact`, `returning`, `formerMember`, and `list`, `form`, `lead` left `{}`;
  - `tasks.json`;
  - `today.json`: `{}`.
- The shot names: `leads`, `leads-everyone`, `leads-sales`, `leads-filters`, `leads-empty`, `lead-new`,
  `lead-new-known-contact`, `lead`, `lead-menu`, `lead-lost`, `lead-follow-up`, `lead-edit-trip`, `today`,
  `today-empty`, `today-snooze`, `today-add-task`, `home-today`, `settings-destinations`, `settings-blocked-contacts`.

- [ ] **Step 1: Write the failing tests:**

```tsx
it("writes Kashmir · Dec · 2 adults, 1 child; Goa · Jan 2027 · 6 adults; Kedarnath · 14 – 20 Nov · 4 adults; Manali · dates open · 2 adults", …)
it("says today and tomorrow by the agency's clocks, whatever the device's zone", …) // TZ=America/New_York in the test
it("reads 'Follow-up overdue · yesterday, 5:00 pm' in the bad ink, '12 min ago · no reply yet' in the attention ink, 'Follow up today, 4:00 pm' in the people ink", …)
it("shows Lost red, Won green and open stages grey, each with its word", …)
it("links WhatsApp to https://wa.me/919876543210, dials tel:+919876543210 on a phone, and shows the number with Copy on a computer", …)
it("keeps a time as HH:MM and names a missing one", …)
it("sends one-hour, tomorrow-morning and { choice: 'at', due: { on, at } }, and holds while pending", …)
it("a refused Done shows its sentence and keeps the task", …)
it("orders an Owner's items Home, Today, Leads, Staff, Roles, Settings, Audit log, and a salesperson's Home, Today, Leads", …)
```

- [ ] **Step 2: Run them to see them fail.** Run `pnpm --filter @travel-crm/web test`. Expected: FAIL.
- [ ] **Step 3: Add the registry parts and build the pieces.**
  - Run `pnpm dlx shadcn@4.21.4 add toggle-group command` from `apps/web`.
  - Apply `components/ui/README.md`'s checks to both: 44px items, no `ring`, the words as messages.
  - Record the changes in that README.
  - Build the pieces as thin compositions of the registry parts.
- [ ] **Step 4: Run the whole gate.** It includes the journeys: the bars changed. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(web): the shared pieces for leads, tasks and Today`.

---

## Track C: CRM (worktree `travel-crm-leads-crm`)

Each task replaces Track G's stubs, test first. Tests use `aPerson`, `aLead` and `aTask` for setup, and
`memberWithStarterRole("sales"|"org-admin", { organizationId, userId })` (`packages/domain/test/identity/rule-helpers.ts`)
for actors. HTTP tests go in `apps/api/test/leads-*.test.ts` with `createTestServer`, `signedInOwner` and `addStaff`.

### Task C1: Matching a person, and the known contact

**Files:**

- Create `packages/domain/src/crm/people.ts`.
- Modify `crm/known-contact.ts`.
- Test `packages/domain/test/crm/known-contact.test.ts` and `apps/api/test/leads-known-contact.test.ts`.

**Interfaces** (internal to crm):

- `matchPerson(tx, contacts): Promise<{ person: PersonRow; matchedBy: ContactKind } | null>` (R4);
- `fillMissingContacts(tx, actor, person, contacts): Promise<ContactKind[]>` (R32);
- `newestOpenLead(tx, personId)`;
- `isBlocked(tx, contacts): Promise<boolean>`.

- [ ] **Step 1: Write the failing tests:**

```ts
it("matches a phone however it is typed", …) // "98765 43210", "098765-43210", "+91 98765 43210" → one person
it("keeps a foreign number's own country", …) // "+1 415 555 2671" stays +14155552671 and matches only itself
it("matches by email, then handle, when no phone matches", …)
it("tells of the newest open lead with its destination and owner", …)
it("names the owner and destination of a lead the salesperson can't see, never its id", …) // leadId null
it("says blocked when any contact given is blocked", …)
it("answers null for nobody known", …)
```

- [ ] **Step 2: Run them to see them fail.** Run `pnpm --filter @travel-crm/domain test -- crm/known-contact`.
      Expected: FAIL with "Not built yet".
- [ ] **Step 3: Implement** `findKnownContact` and the helpers. Matching is exact, through the live unique indexes.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(crm): match people by phone, email or handle, and tell of known contacts`.

### Task C2: Adding a lead, and a repeat enquiry

**Files:**

- Modify `crm/create-lead.ts`.
- Modify `apps/web/src/i18n/messages/en-IN/{errors,audit,notifications}.json` and
  `apps/web/src/notifications/preferences/kinds.ts`.
- Test `packages/domain/test/crm/create-lead.test.ts` and `apps/api/test/leads-create.test.ts`.

**Interfaces:**

- Produces `createLead`.
- Produces `addLeadInTransaction(tx, actor, record: NewLeadRecord, now): Promise<{ leadId: string; personId: string }>`,
  internal and used by S4. `NewLeadRecord` is:
  - `{ personId: string; trip: TripRecord; stage?: LeadStage; returning: boolean; ownerUserId: string; source; sourceDetail: string|null; note: string|null; createdBy: string|null; createdAt?: Date }`;
  - with `TripRecord` = the trip with `destinationId` resolved.
- Produces the refusal `OPEN_LEAD_EXISTS`.
- Produces the actions `person.added`, `lead.added`, `lead.repeat-enquiry`, `lead.note-added`.
- Produces the events `person.added`, `lead.created`, `lead.repeat-enquiry`.
- Produces the notification kinds `lead.assigned`, `lead.repeat-enquiry` (R27).

`createLead`'s order, which the tests pin:

1. The owner is the input's, or the actor. Another person needs `leads:assign` (`MISSING_PERMISSION`), and the owner
   must be in `owners` (`NOT_A_LEAD_WORKER`).
2. In one `forOrg`, the lookup:
   1. `matchPerson`;
   2. if matched, `fillMissingContacts`, then `newestOpenLead`.
   3. With an open lead and no choice: `OPEN_LEAD_EXISTS`.
3. With `add-to-it`:
   1. a `lead_enquiry` row and a `repeat-enquiry` timeline entry;
   2. the audit entry and the event;
   3. notify the lead's owner;
   4. answer `added-to-open-lead`, with `leadId` null when out of scope.
4. Otherwise:
   1. add the person when none matched;
   2. resolve the destination (`destinationById` or `findOrAddDestination`);
   3. `returning` is true when the person has any earlier live lead;
   4. `addLeadInTransaction` writes the lead, then "created", the note and "reassigned" when the owner isn't the
      actor (R36);
   5. notify a new owner who isn't the actor (`lead.assigned`).
5. A unique violation on a person's contact reruns everything once in a new transaction (R23).

- [ ] **Step 1: Write the failing tests:**

```ts
it("adds a lead with only a name and a phone, owned by whoever adds it, in stage New", …)
it("refuses another owner without leads:assign, and one who can't work leads", …)
it("asks with OPEN_LEAD_EXISTS when the person has an open lead and no choice was made", …)
it("adds a repeat enquiry to the open lead, tells its owner, and fills a missing email, never overwriting", …)
it("makes a new trip enquiry for the same person, marked returning", …)
it("marks a lead returning when the person had only a closed lead", …)
it("makes one person when two saves of a new number race; the second is asked about the open lead", …)
it("writes created, note and reassigned on the timeline, one lead.added audit entry and lead.created", …)
it("adds a new destination by name, and uses Goa for 'goa'", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Add the sentences, the actions under `actions.person.*` and `actions.lead.*`, and `recordTypes.person` and
    `recordTypes.lead`.
  - Add both kinds to `kinds.ts`, each with its label and hint in `notifications.json`.
- [ ] **Step 4: Run the gate's first line.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(crm): add leads by hand, with repeat enquiries and returning customers`.

### Task C3: The list, search and counts

**Files:**

- Modify `crm/{lead-list,lead-list-query}.ts`.
- Test `packages/domain/test/crm/lead-list.test.ts` and `apps/api/test/leads-list.test.ts`.

**Interfaces:**

- Produces `LeadListFilter`:
  - `{ ownerUserId: string|null; stages: readonly LeadStage[]; source?; destinationId?; tripType?; search?: { kind: "name"; text } | { kind: "digits"; digits }; before?: string; limit: number }`;
  - `ownerUserId: null` means everyone.
- Produces `leadListQuery(filter): Sql`, `leadCountsQuery(filter): Sql`, `listLeads` and `countLeads`.
- How `listLeads` builds the filter:
  - the scope comes from `access.permissions.scopeOf("leads:view")`;
  - own scope always means owner = me;
  - all scope means `mine` → me, and `everyone` → `ownerUserId` or no filter;
  - stage `"open"` means the four open stages;
  - the search kind follows R5;
  - `next` is `awaitingReplySince` (stage New) plus `nextOpenTasks`.

- [ ] **Step 1: Write the failing tests:**

```ts
it("lists Mine · open newest first, 25 a page, with a cursor", …)
it("shows a salesperson only their own leads, whatever view or owner they send", …)
it("lists everyone's for a manager, filtered by owner, source, destination, trip type or a closed stage", …)
it("leaves Not a lead out of the default list", …)
it("finds Rahul Sharma by 'Rahul Shrma' and by 'shrma'", …)
it("finds a lead by any four or more digits of the phone", …) // "98765", "43 210"
it("finds राहुल शर्मा by राहुल", …)
it("treats % and _ in a search as letters", …)
it("gives each row its next step: waiting since it came, or its earliest open task", …)
it("counts open leads by stage for the same view and filters", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Join `person` on `(organization_id, id)`; both are live.
  - Order by `lead.id DESC` with `id < :before`.
  - Escape `%`, `_` and `\` before `ILIKE`.
  - The router names the owners.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(crm): the lead list, typo-tolerant search and stage counts`.

### Task C4: A lead, its timeline and its notes

**Files:**

- Modify `crm/{lead-detail,timeline}.ts`.
- Test `packages/domain/test/crm/lead-detail.test.ts` and `apps/api/test/leads-lead.test.ts`.

**Interfaces:**

- Produces `getLead`, `listLeadTimeline` and `addLeadNote`.
- Produces the internal `findLeadInScope(tx, access, leadId): Promise<LeadRow>` (R26), which every later crm change
  uses.
- The timeline reads the entries newest first, joining notes, enquiries and tasks by `record_id`, plus
  `destinationNames`.

- [ ] **Step 1: Write the failing tests:**

```ts
it("reads a lead with its person, trip, budget as Money, owner, source and open work earliest first", …)
it("answers NOT_FOUND for another salesperson's lead, from every procedure", …) // get, timeline, addNote; C5 and C6 add theirs
it("pages the timeline newest first, each kind with what it points to", …)
it("adds a note to the timeline, and records lead.note-added without its text", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(crm): a lead's page, its timeline and notes`.

### Task C5: Stages, reopening, reassigning, and editing the trip and the person

**Files:**

- Modify `crm/lead-changes.ts` and the words.
- Test `packages/domain/test/crm/lead-changes.test.ts` and `apps/api/test/leads-changes.test.ts`.

**Interfaces:**

- Produces `moveLeadStage`, `reopenLead`, `reassignLead`, `editLeadTrip` and `editLeadPerson`.
- Produces the refusal `CONTACT_ON_ANOTHER_PERSON`.
- Produces the actions `lead.stage-changed`, `lead.reopened`, `lead.reassigned`, `lead.trip-edited`, `person.edited`.
- Produces the events `lead.stage-changed` (also for a reopen), `lead.reassigned`, `lead.trip-edited`,
  `person.edited`.

- [ ] **Step 1: Write the failing tests:**

```ts
it("moves a lead to any stage, forwards or back, and writes stage-changed", …)
it("keeps the first reply when a lead first leaves New, except for Not a lead", …)
it("changes nothing when the lead is already in that stage", …)
it("cancels every open task on Lost and Not a lead, and keeps them on Won", …) // timeline shows follow-up-cancelled
it("reopens a Lost lead to the open stage it had before, or New", …)          // Won → Lost → reopen: the stage before Won
it("reassigns a lead with its open tasks, tells the new owner, and refuses an owner who can't work leads", …)
it("replaces the trip, writes trip-edited and keeps the audit's before and after", …)
it("refuses a contact already on another live person: CONTACT_ON_ANOTHER_PERSON", …)
// and C4's NOT_FOUND test gains moveStage, reopen, editTrip and editPerson
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement** by R29 to R32.
- [ ] **Step 4: Run the gate's first line.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(crm): move, reopen and reassign leads, and edit their trip and person`.

### Task C6: Work on a lead, and blocking a number

**Files:**

- Modify `crm/{lead-work,blocking}.ts` and the words.
- Test `packages/domain/test/crm/{lead-work,blocking}.test.ts` and `apps/api/test/leads-blocking.test.ts`.

**Interfaces:**

- Produces `addLeadWork`, `blockLeadContact`, `listBlockedContacts` and `unblockContact`.
- Produces the actions `blocked-contact.added` and `blocked-contact.removed` (entity `blocked_contact`), and the
  events of the same names.

- [ ] **Step 1: Write the failing tests:**

```ts
it("adds a follow-up or a task to a lead, given to its owner, and writes follow-up-added", …)
it("refuses work due before now", …)
it("blocks the phone (else the email, else the handle), marks the lead Not a lead and leaves the person's other leads", …)
it("adds nothing when the value is already blocked", …)
it("lists blocked contacts newest first and unblocks one, which can be blocked again", …)
it("lets only leads:assign block, list and unblock", …) // HTTP
// and C4's NOT_FOUND test gains addWork and block
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the track's whole gate.** Expected: PASS. No stub of C's is left:
      `grep -rn "Not built yet" packages/domain/src/crm` lists only S's.
- [ ] **Step 5: Commit.** Message: `feat(crm): follow-ups on a lead, and blocking numbers`. Track C is ready to merge.

---

## Track S: System (worktree `travel-crm-leads-system`)

### Task S1: Today

**Files:**

- Create `packages/domain/src/crm/work-queries.ts`.
- Modify `packages/domain/src/today/{index,today}.ts`, `crm/index.ts` (the new exports) and
  `packages/api/src/routers/today.ts` (only if a signature moved).
- Test `packages/domain/test/today/today.test.ts` and `apps/api/test/today.test.ts`.

**Interfaces:**

- Produces from crm:
  - `newLeadsWaitingQuery({ ownerUserId, after?, limit }): Sql`, over `lead_new_by_owner`, oldest first;
  - `newLeadsWaiting(tx, …)`;
  - `countNewLeadsWaiting(tx, ownerUserId)`;
  - `leadBriefs(tx, leadIds): Promise<Map<string, LeadBrief>>`.
- Produces from today: `todaySummary` and `todaySection` (R35). The zone comes from `organizationTimeZone`; the day
  ends at `startOfDayIn(addDays(day, 1), zone)`.

- [ ] **Step 1: Write the failing tests:**

```ts
it("counts and lists my overdue tasks, new leads and today's tasks, and nobody else's", …)
it("splits overdue and due today at the agency's midnight", …) // at 00:05 IST yesterday's undone follow-up is overdue; at 23:50 one due 00:10 tomorrow isn't today
it("puts the first overdue, the oldest new lead and the next due today in the top three", …)
it("lists new leads oldest first, 20 a page", …)
it("brings each lead's name, phone and trip line with its task", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL with "Not built yet".
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(today): the day's overdue, new leads and due work, in the agency's zone`.

### Task S2: When someone leaves

**Files:**

- Create `packages/domain/src/crm/departing-member.ts`.
- Modify `crm/index.ts` and `apps/api/src/worker-jobs.ts` (the listener; `identity` gains `"firstOwner"`).
- Test `packages/domain/test/crm/departing-member.test.ts`.

**Interfaces:**

- Produces `handOverDepartingMemberListener(dependencies: { firstOwner(organizationId: string): Promise<string | null> }): EventListener`.
- The listener is named `crm.hand-over-departing-member`, on `staff.removed` (R15, R37).

- [ ] **Step 1: Write the failing tests:**

```ts
it("moves the member's open leads and their tasks, and their open standalone tasks, to the Owner", …)
it("leaves their closed leads and done tasks as they were", …)
it("records each move as the system's, in the audit log and on the timeline", …)
it("does nothing more when the event comes again", …)
it("moves 450 leads in batches of 200", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(crm): a departing member's leads and tasks go to the Owner`.

### Task S3: Erasing and exporting a customer

**Files:**

- Create `packages/domain/src/crm/customer-erasure.ts`.
- Modify:
  - `crm/index.ts`;
  - `packages/domain/src/platform/{erasure,deletion-checks,exports}.ts`;
  - `packages/contracts/src/platform/data-protection.ts` (`customerExport`, `subjectExport.customer`);
  - `apps/web/src/console/data-protection/subject-export-view.tsx` and `console-platform.json`.
- Test `packages/domain/test/crm/customer-erasure.test.ts`, extend `packages/domain/test/platform/erasure.test.ts`,
  and `apps/web/test/console/data-protection/subject-export-view.test.tsx`.

**Interfaces:**

- Produces `eraseCustomer(tx: OrgTx, subject: { organizationId; personId }): Promise<{ leadIds: string[]; notes: number; enquiries: number; timelineEntries: number; blockedContacts: number }>`.
- Produces `exportCustomer(tx, subject): Promise<CustomerExport>`.
- `PERSONAL_RECORD_TYPES` becomes `["traveller", "person"]`.

- [ ] **Step 1: Write the failing tests:**

```ts
it("empties the person's name and contacts and soft-deletes them and their leads", …)
it("deletes their leads' notes and repeat enquiries with those timeline entries, and empties their task titles", …)
it("removes blocked contacts that held their phone, email or handle", …)
it("forgets notifications linking to their leads, and redacts their person audit entries", …)
it("leaves another person's leads, notes and tasks untouched", …)
it("exports the person's contacts, leads, notes, enquiries and task titles", …)
it("shows the customer's contacts and counts, and copies the export as JSON", …) // console view
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement** (R38, R39). Platform erasure calls `eraseCustomer`, `redactTaskTitles` and
      `forgetRecordNotifications` per lead, and puts the counts in its `subject.erased` entry.
- [ ] **Step 4: Run the gate's first line.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(platform): erase and export a customer and their leads`.

### Task S4: The demo agency's leads (after C merges)

Start with `git merge --no-edit leads/r1` once Track C is merged.

**Files:**

- Create `packages/domain/src/crm/demo-leads.ts`.
- Modify `crm/index.ts` and `packages/domain/src/platform/demo.ts`, inside the `asOrganization` block, keeping the
  staff's user ids.
- Test: extend `packages/domain/test/platform/demo.test.ts`.

**Interfaces:**

- Produces `addDemoLeads(tx: OrgTx, actor: Actor, staff: { ownerUserId: string; salesUserId: string }, now: Date): Promise<void>`.
- It builds, through `addLeadInTransaction`, `createTask` and `recordLeadEvent`:
  - 6 destinations;
  - 11 people;
  - 13 leads for Asha and Ravi:
    - every stage;
    - one returning (an earlier Won lead);
    - one blocked (Not a lead, its phone on the list);
  - notes on 4 leads;
  - follow-ups: 2 overdue, 3 due today, 2 later;
  - 2 standalone tasks.
- All times are relative to `now` in Asia/Kolkata. The set must fit the 20 s transaction.

- [ ] **Step 1: Write the failing tests:**

```ts
it("gives the demo leads in every stage, one returning, one blocked, with notes, for Asha and Ravi", …)
it("gives Ravi's Today an overdue follow-up, a new lead and one due today", …)
it("builds again the next night without a clash", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(platform): the demo agency's sample leads, follow-ups and tasks`.

### Task S5: A large agency stays fast (after C merges)

**Files:**

- Create `packages/domain/test/performance/{large-agency,query-plans,leads-at-scale.test}.ts`.

**Interfaces:**

- Produces `seedLargeAgency(platform: PlatformClient, organizationId, { leads: 50_000, tasks: 100_000, staff: 500, destinations: 300 }): Promise<{ ownerUserIds: string[] }>`.
  - It runs set-based `INSERT … SELECT generate_series` through `$executeRaw`.
  - Stages: 10% New, 40% the other open stages, 50% closed.
  - Tasks: 60% done, 5% cancelled, 35% open, due from 30 days ago to 30 days ahead.
  - Then `analyzeTables`.
- Produces `planOf(tx, query: Sql): Promise<{ indexes: string[]; seqScans: string[] }>`, from
  `EXPLAIN (FORMAT JSON)`.
- Each query runs through `db.forOrg` as `app_runtime` on `createIsolatedDatabase`. Its time is the fastest of 7 runs
  after one warm-up (a busy machine only adds time).

- [ ] **Step 1: Write the tests:**

```ts
it("lists Mine · open within 150 ms, on lead_open_by_owner", …)
it("lists Everyone · open within 150 ms, on lead_open", …)
it("counts open leads by stage within 150 ms, on lead_open_stage_counts", …)
it("finds 'Rahul Shrma' within 250 ms, on person_name_trgm", …)
it("finds a lead by five digits within 250 ms, on person_phone_trgm", …)
it("builds Today within 150 ms, on task_open_by_assignee and lead_new_by_owner", …)
it("never scans lead, person or task from start to end", …) // seqScans excludes all three, for every query above
```

- [ ] **Step 2: Run them.** Run `pnpm --filter @travel-crm/domain test -- performance`.
  - A miss is a real finding: fix the query, or the index in a new migration, never the budget.
  - Report every budget a fix needed.
- [ ] **Step 3: Run the track's whole gate.** Expected: PASS.
- [ ] **Step 4: Commit.** Message: `test(crm): 50,000 leads stay fast: time budgets and query plans`. Track S is
      ready to merge.

---

## Track L: Lead screens (worktree `travel-crm-leads-lead-screens`)

Unit tests stub the api (`stubApi`, `renderWithApi`, `member()`). Every screen has its loading (`LoadingRows`),
empty, error (`ErrorState` with Try again) and refusal (`RefusalAlert`) states. Every change button asks
`useWriteAccess("change")` with `WriteHint`.

### Task L1: Leads, the list

**Files:**

- Create:
  - `apps/web/src/app/(app)/leads/page.tsx` (`RequirePermission` `leads:view`);
  - `apps/web/src/leads/list/{leads-screen,stage-chips,filters-dialog,lead-rows,leads-table}.tsx`;
  - `apps/web/src/leads/list/{list-filters,use-leads}.ts`;
  - `leads.json`'s `list` keys.
- Test `apps/web/test/leads/{list-filters.test.ts,leads-screen.test.tsx}`.

**Interfaces:**

- Produces `listFiltersOf(search: Pick<URLSearchParams, "get">, scope: "own"|"all"): ListLeadsInput` and
  `listFiltersHref(input): string` (R41).

- [ ] **Step 1: Write the failing tests:**

```tsx
it("reads ?view=everyone&stage=new&q=rahul, and drops view and owner for a salesperson", …)
it("opens on Mine · open, newest first, with Show more", …)
it("gives managers Mine/Everyone tabs and an owner filter, and a salesperson the 'Mine · open' chip", …)
it("shows each open stage's count on its chip", …)
it("searches by name or phone after a pause; the field has a label for screen readers", …)
it("says 'No results for these filters' with Clear filters", …)
it("reads a row: name, ↺ Returning, trip line, stage badge and next step; on a computer the Table's seven columns", …)
it("shows the skeleton, the error with Try again, and a refusal's sentence", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Build it.** Use `PageHeader` with "New lead" as its action, `Tabs`, `ToggleGroup`, `useCursorPages`
      with `ShowMoreButton`, `Table` from `md` (R44), and `ItemGroup` below it.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(web): the Leads list, with search, stage chips and filters`.

### Task L2: The new-lead form

**Files:**

- Create:
  - `apps/web/src/app/(app)/leads/new/page.tsx` (`leads:create`);
  - `apps/web/src/leads/form/{new-lead-screen,person-fields,trip-fields,destination-field,when-field,travellers-field,budget-field,source-fields,owner-field,known-contact-alert}.tsx`;
  - `apps/web/src/leads/form/{lead-form-values,use-known-contact}.ts`;
  - `leads.json`'s `form` keys.
- Test `apps/web/test/leads/{lead-form-values.test.ts,new-lead-screen.test.tsx}`.

**Interfaces:**

- Produces `TripFields({ form })` and `PersonFields({ form })`, which L4's editors reuse.
- Produces `toCreateLeadInput(values): Checked<…>`.
- `useKnownContact(contacts)` asks `leads.knownContact` when a valid contact is typed (debounced 400 ms).

- [ ] **Step 1: Write the failing tests:**

```tsx
it("needs a name and one contact, and saves with only those, opening the new lead", …)
it("sends the month as YYYY-MM, the budget in paise with its basis, and each child's age", …)
it("warns of a known contact with an open lead and sends the choice as whenOpenLead", …)
it("shows only the destination and owner of a lead the salesperson can't see, then returns to Leads with a toast", …)
it("asks again when the save answers OPEN_LEAD_EXISTS", …)
it("shows the person's stored name and says the lead will be marked returning", …)
it("warns that a number is blocked and still saves", …)
it("offers the owner picker only with leads:assign, defaulting to me", …)
it("adds a new destination by typing its name in the combobox", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Build it.**
  - Fields come from `components/forms`; the phone through `PhoneField`, the budget through `MoneyField`, dates
    through `DateField`.
  - Hotel and food are `RadioGroup`s; the others are `SelectField`s.
  - The form holds while saving.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(web): the new-lead form, with known contacts and destinations`.

### Task L3: A lead: its header, the stage bar and the ⋯ menu

**Files:**

- Create:
  - `apps/web/src/app/(app)/leads/[leadId]/page.tsx`;
  - `apps/web/src/leads/lead/{lead-screen,lead-header,stage-bar,lead-menu,reassign-dialog}.tsx`;
  - `apps/web/src/leads/lead/use-lead.ts`;
  - `leads.json`'s `lead` keys.
- Test `apps/web/test/leads/{stage-bar,lead-menu,lead-header}.test.tsx`.

- [ ] **Step 1: Write the failing tests:**

```tsx
it("shows five 44px steps over the Progress; the current is aria-current='step'; tapping Quote sent moves the lead", …)
it("shows a Lost or Not a lead lead's badge and Reopen in place of the bar", …)
it("asks before Lost, Not a lead and Block this number; Block and Reassign need leads:assign", …)
it("reassigns to a lead worker from the owner list", …)
it("shows Call and WhatsApp only with a phone, and the email and handle under the name", …)
it("says 'not found' for a lead out of reach", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Build it.** Use `DropdownMenu`, `ConfirmDialog`, `FormDialog` and `BackLink` to Leads with the list's
      filters kept.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(web): a lead's header, stage bar and menu`.

### Task L4: A lead: follow-ups, person, trip, owner and timeline

**Files:**

- Create `apps/web/src/leads/lead/{work-card,add-follow-up-dialog,person-card,edit-person-dialog,trip-card,edit-trip-dialog,owner-card,timeline,timeline-entry,note-composer}.tsx`.
- Test `apps/web/test/leads/{work-card,person-card,trip-card,timeline}.test.tsx`.

- [ ] **Step 1: Write the failing tests:**

```tsx
it("lists open work earliest first with Done and Snooze, and 'None set.' with Add follow-up", …)
it("sends addWork with { leadId, kind: 'follow-up', title, due: { on, at } }", …)
it("names who holds a contact before saving a person, and shows CONTACT_ON_ANOTHER_PERSON's sentence", …)
it("shows '₹60,000 per person' and 'About ₹1,80,000 for everyone' for three travellers", …)
it("edits the trip with the form's own trip fields", …)
it("shows the owner as a violet badge, with Reassign for leads:assign, and the source with who added it", …)
it("pages the timeline newest first; Add note adds one at the top; each kind reads as its sentence", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Build it.**
  - Use `Card` and `Details`.
  - `TaskActions` from G5.
  - The timeline is an `ItemGroup` with `ShowMoreButton`.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(web): a lead's follow-ups, person, trip, owner and timeline`.

### Task L5: Journeys and the visual audit (after C merges)

Start with `git merge --no-edit leads/r1`.

**Files:**

- Create `apps/web/test/e2e/support/leads.ts`:
  - `addLeadThroughApi(page, input: CreateLeadInput): Promise<string>` (R54);
  - `leadWorkerAgency`.
- Create the journeys `apps/web/test/e2e/leads-{add,repeat-enquiry,stages,reassign,scope}.spec.ts`.
- Create the camera file `apps/web/test/e2e/audit/06-leads.audit.ts`.

- [ ] **Step 1: Write the journeys** (each runs on phone and desktop, with axe after each):

```ts
test("an Owner adds a lead with a name and a phone, and finds it in Leads", …)
test("a repeat enquiry goes on the open lead's timeline, or makes a new trip enquiry marked returning", …)
test("a lead moves forward and back, is marked Lost after asking, and reopens to its stage", …)
test("an Owner reassigns a lead; Ravi finds it in his Leads", …)
test("a salesperson sees only their own leads, and another's lead is not found", …)
```

- [ ] **Step 2: Run them until they pass.** Run `./node_modules/.bin/playwright test test/e2e/leads-*.spec.ts`
      (both projects).
- [ ] **Step 3: Write the camera file.** It shoots `leads`, `leads-everyone`, `leads-sales`, `leads-filters`,
      `leads-empty`, `lead-new`, `lead-new-known-contact`, `lead`, `lead-menu`, `lead-lost`, `lead-follow-up` and
      `lead-edit-trip`. Then run the visual audit loop until no must is left.
- [ ] **Step 4: Run the track's whole gate.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `test(web): the lead journeys and the leads screens' audit shots`. Track L is ready
      to merge.

---

## Track W: Work screens (worktree `travel-crm-leads-work-screens`)

### Task W1: Today

**Files:**

- Create:
  - `apps/web/src/app/(app)/today/page.tsx` (`leads:view`);
  - `apps/web/src/today/{today-screen,today-section,today-item}.tsx`;
  - `apps/web/src/today/use-today.ts`;
  - `today.json`.
- Test `apps/web/test/today/{today-screen,today-item}.test.tsx`.

- [ ] **Step 1: Write the failing tests:**

```tsx
it("heads the screen 'Fri 16 Oct · 8 things · 2 overdue', with Add a task as its action", …)
it("shows Overdue, New leads waiting for a reply and Due today, each with its count and Show more", …)
it("puts Call and WhatsApp (outline) on one row and Done and Snooze (ghost) on the next, all 44px", …)
it("marks a new lead contacted, and it leaves the section", …)
it("says 'Nothing for today' when all three are empty, and keeps the quiet line about later releases", …)
it("shows the skeleton, the error with Try again, and a refusal's sentence", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Build it.**
  - Read `today.summary` for the header and counts, and `today.section` through `useCursorPages`, per section.
  - Items use G5's `TaskActions`, `CallButton`, `WhatsAppButton` and `NextStep` colours.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(web): Today: overdue, new leads and due today`.

### Task W2: Adding a task

**Files:**

- Create `apps/web/src/today/{add-task-dialog,lead-picker}.tsx`.
- Test `apps/web/test/today/add-task-dialog.test.tsx`.

- [ ] **Step 1: Write the failing tests:**

```tsx
it("adds a standalone task for me with tasks.add { title, due, assigneeUserId: null }", …)
it("offers an assignee only with leads:assign", …)
it("links a lead found by search and sends leads.addWork with kind 'task'", …)
it("holds while saving, and shows DUE_IN_THE_PAST's sentence on the time", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Build it** with `FormDialog`, `DueField` and `useLeadOwners`; the lead picker is `Command` in a
      `Popover` over `leads.list` with `search`.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(web): add a task from Today, standalone or on a lead`.

### Task W3: Home's nudge

**Files:**

- Create `apps/web/src/today/today-nudge.tsx`.
- Modify `apps/web/src/app/(app)/page.tsx`.
- Test `apps/web/test/today/today-nudge.test.tsx` and `apps/web/test/home.test.tsx`.

- [ ] **Step 1: Write the failing tests:**

```tsx
it("keeps the setup card first, then '8 things today · 2 overdue', three items and Open Today", …)
it("never shows more than three items", …)
it("gives New lead as the header's outline action to leads:create", …)
it("shows no nudge without leads:view, and no list on Home", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Build it** from `today.summary`'s `top`.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(web): Home's Today nudge and New lead`.

### Task W4: Destinations and blocked contacts in Settings

**Files:**

- Create:
  - `apps/web/src/app/(app)/settings/{destinations,blocked-contacts}/page.tsx`;
  - `apps/web/src/crm-settings/{destinations-screen,rename-destination-dialog,merge-destinations-dialog,blocked-contacts-screen}.tsx`.
- Modify `apps/web/src/organization/settings/settings-sections.tsx` (two sections, R51) and `settings.json`.
- Test `apps/web/test/crm-settings/{destinations-screen,blocked-contacts-screen}.test.tsx`.

- [ ] **Step 1: Write the failing tests:**

```tsx
it("lists destinations alphabetically with search, renames one, and shows DESTINATION_NAME_TAKEN's sentence", …)
it("merges one into another after asking, and says how many leads moved", …)
it("lists blocked contacts newest first, formatted, with who blocked them and when, and unblocks after asking", …)
it("shows the two sections only to their permissions and on the crm plan", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Build them.**
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(web): destinations and blocked contacts in Settings`.

### Task W5: Journeys and the visual audit (after C, S and L merge)

Start with `git merge --no-edit leads/r1`.

**Files:**

- Create `apps/web/test/e2e/{today-follow-up,home-nudge,settings-destinations,settings-blocked-contacts}.spec.ts`.
- Create `apps/web/test/e2e/audit/07-work.audit.ts`.

- [ ] **Step 1: Write the journeys:**

```ts
test("a follow-up added on a lead shows in Today and, done there, on the lead's timeline", …)
test("a follow-up snoozed to tomorrow 9:00 leaves Today", …)
test("Home shows the count and three things, and Open Today opens Today", …)
test("merging two destinations moves the lead", …)
test("a number blocked from a lead is unblocked in Settings", …)
```

- [ ] **Step 2: Run them until they pass**, on both projects.
- [ ] **Step 3: Write the camera file.** It shoots `today`, `today-empty`, `today-snooze`, `today-add-task`,
      `home-today`, `settings-destinations` and `settings-blocked-contacts`. Then run the visual audit loop until no must
      is left.
- [ ] **Step 4: Run the track's whole gate.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `test(web): the work journeys and the Today and Settings audit shots`. Track W is
      ready to merge.

---

## Task I1: Integration (on `leads/r1`, as tracks finish)

**Files:**

- Modify:
  - `CLAUDE.md` (repo map: the modules `crm`, `catalog`, `tasks`, `today`);
  - `packages/domain/README.md` (module list and layers);
  - `docs/deploy-checklist.md` (the hosted database must allow the trusted extensions `pg_trgm` and `btree_gist`,
    R6);
  - whatever "Needs from others" lists.

- [ ] **Step 1: Merge in order.**
  - Run `git merge --no-ff leads/r1-<track> -m "chore: merge leads/r1-<track> (<scope>)"`: C, then S and L as they
    finish, then W.
  - `pnpm-lock.yaml` conflicts take either side, then `pnpm install`.
  - After each merge, run the gate's first line before the next.
- [ ] **Step 2: Apply the tracks' "Needs from others"** and the docs above. Commit with
      `docs: release 1 in the repo map, the module list and the deploy checklist`.
- [ ] **Step 3: Run the full gate in the foreground.** All of these must pass:
  - the track gate's three commands (`pnpm check`'s parts);
  - `pnpm migrations:check`;
  - `pnpm audit --audit-level=high` (cmdk is new);
  - `pnpm images:smoke`;
  - `pnpm lighthouse`.
- [ ] **Step 4: Walk the release live** (R55).
  - In `/Users/ak/personal/travel-crm-leads`, make a `.env` from `.env.example` (never the owner's) with
    `DEMO_ORGANIZATION_CODE=DEMO` and `DEMO_PASSWORD=demo-only-password`.
  - Check `scripts/dev/compose.sh --print-name` isn't `travel-crm`.
  - Run `pnpm dev`, then `pnpm demo`.
  - At http://localhost:3000, on 390×844 and 1440×900, sign in with DEMO as asha:
    1. Home's nudge;
    2. Today: Done, Snooze, Mark contacted;
    3. Leads: search "Rahul Shrma", the chips, Everyone;
    4. a lead: move a stage, add a follow-up, a note, Reassign to Ravi;
    5. a new lead with a known phone;
    6. Settings: Destinations and Blocked contacts.
  - Then sign in as ravi and see only his leads.
  - Stop everything after.
- [ ] **Step 5: Report** the gate's results and anything carried, with its reason.

---

## Spec coverage (self-review)

| Spec                                                                                                                               | Where                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1 goals and anti-goals (cluttered Home, 50,000 leads, scope, audit)                                                                | W3; S5; C3/C4 and Review Focus 1; every change task's audit tests |
| 2 who uses it (Sales own, managers all, Operations/Accounts none)                                                                  | G4; C3; L1; W3                                                    |
| 3.1 navigation and Home                                                                                                            | G5 (navigation items), W3                                         |
| 3.2 the new-lead form, known contact, contacts kept                                                                                | G2; C1, C2; L2                                                    |
| 3.3 the list: search, chips, filters, rows, Show more, Table                                                                       | C3; L1                                                            |
| 3.4 a lead: Call/WhatsApp, stage bar, ⋯ menu, follow-ups, person, trip, owner, timeline                                            | C4-C6; L3, L4                                                     |
| 3.5 Today: sections, actions, snooze, roll-over, Add a task, the later line                                                        | S1; G3; G5; W1, W2                                                |
| 3.6 Settings: destinations, blocked contacts                                                                                       | G3; C6; W4                                                        |
| 4 stages, first reply, returning, Not a lead, block, owner, follow-ups, person edits, leaving, notifications, audit, events, scope | C2-C6; S2; G3                                                     |
| 5 data (8 tables, indexes, trigram, extensions, keyset)                                                                            | G1; G2; S5                                                        |
| 6 modules, permissions, plan module, the lead-owner list, contracts                                                                | G2-G4                                                             |
| 7 demo, erasure, words, performance, journeys, visual audit                                                                        | S4; S3; G3, C2, C5, C6; S5; L5, W5                                |
| 8 the lead's calls                                                                                                                 | R3-R5, R17, R21, R24, R29-R34, R48, R50                           |
