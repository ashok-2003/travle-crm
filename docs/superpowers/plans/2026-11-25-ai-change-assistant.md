# The AI change assistant: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** on any trip's page, the agency pastes what changed (text, up to four photos or one PDF), sees a table of the
exact changes with What / Now / New and ticks, applies them in one go, and can Undo all.

**Architecture:** one structured-output model call per "Show the changes" (like package drafts and the rate reader,
no agent loop), grounded by cited lines that code checks. The proposal is stored server-side in a new table
`package_change_run`; Apply takes the run id and the ticked change ids, re-checks everything, and runs the trip's
existing operations in one transaction, keeping the before-values for Undo all.

**Tech stack:** as the simple trip page plan; the `AiModel` port (`@travel-crm/integrations/ai`), `AiPrompts`
(Langfuse) with a built-in fallback, the AI credit ledger (`reserveAiCall` / `releaseAiCall` / `recordTokens`).

**Spec:** `docs/superpowers/specs/2026-11-25-simple-trip-page-design.md` ("The AI change assistant") and step 2 of
`docs/superpowers/specs/2026-11-24-easy-package-editing-design.md`.

**Depends on:** tasks 1-3 of `2026-11-25-simple-trip-page.md` (open seasons, `savePriceTable`, `setDepartureSeats`,
`setDeparturePrices`, `seasonColumns`). Task 5 here also needs that plan's task 4 (the page's AI slot).

## Global constraints

Everything in the simple trip page plan's Global constraints, plus:
- The model never writes: it proposes; code builds every value it applies from the cited lines.
- Every price and date in a change must appear in what the agency gave (its text, or the text the model read from a
  photo or the PDF's lines). One that doesn't is flagged `not_in_message` and starts unticked.
- Job data, logs and audit payloads hold ids and counts, never the pasted text. The run row may keep the proposal (it
  is the agency's own data, under row-level security).
- The new table's migration is `packages/db/prisma/migrations/20261225100000_package_change_run/`, with
  `SELECT app_enable_org_rls('package_change_run');`, a fixture in `packages/db/test/org-table-fixtures/quotes.ts`,
  keys that include `organization_id`, and `ON DELETE RESTRICT ON UPDATE RESTRICT`.
- The Langfuse prompt is `package-changes/system`, label `production`; the code fallback is used when Langfuse is off,
  slow or has no such prompt (`langfusePromptAt`).
- AI feature name: `change_package` (added to `aiFeatures`).

## Review focus

1. A message about several trips ("Manali 4N/5D ... Manali 5N/6D ... Spiti ..."): only this trip's lines become
   changes; a cited line naming another trip's nights (`\d+N\s*/?\s*\d+D` not equal to this trip's) is flagged.
2. "From 18 Dec new rates" with no end: a season added "until changed", ending where the domain rule says.
3. A trip edited by someone between Show the changes and Apply: Apply refuses (`TRIP_CHANGED_SINCE`), nothing changes.
4. Undo all after one of the added departures took a booking: that departure stays, the rest is undone, and the
   result says which stayed.
5. The AI down, the month's credits used, or an answer that isn't valid JSON: a clear refusal, the credit given back
   when the model didn't answer, and nothing changes.

---

### Task 1: contracts, the run table and the feature name

**Files:**
- Create: `packages/contracts/src/ai/package-changes.ts` (exported from the ai contracts index),
  `packages/db/prisma/schema/package-change-runs.prisma`, the migration above
- Modify: `packages/integrations/src/ai/ai-model.ts` (`aiFeatures` gains `change_package`, and wherever features map
  to models or settings), `packages/db/test/org-table-fixtures/quotes.ts`
- Test: `packages/contracts/test/ai/package-changes.test.ts`; the db suite's org-table checks

**Interfaces (contracts):**
- `proposePackageChangesInput = z.strictObject({ packageId, text: text(8000), attachmentIds:
  z.array(recordId).max(4), answers: z.array(z.strictObject({ questionId: z.string().max(40), answer: text(200)
  })).max(5).default([]) })` (attachments are uploaded through the existing AI input upload, as the rate reader's).
- `packageChange`: a discriminated union on `kind`, each with `id: string`, `evidence: { ref: string; text: string }[]`
  and `flags: ("not_in_message" | "other_trip" | "cancelled_date" | "has_bookings" | "not_allowed" | "past_date")[]`:
  - `season_add` `{ label, startsOn, endsOn: calendarDate.nullable(), prices }` (null = until changed)
  - `season_change` `{ seasonIds, label, before: { label, prices }, prices }` (a column, `seasonColumns`'s ids; covers
    the regular price and rooms not sold)
  - `departures_add` `{ dates: calendarDate[] }` (code expands any weekly rule the model gives into dates, ≤ 62 days)
  - `departure_cancel` `{ departureId, startDate, reason }`, `departure_reopen` `{ departureId, startDate }`
  - `departure_prices` `{ departureId, startDate, before, prices }`, `departure_seats` `{ departureId, startDate,
    before, seatsTotal }`
  - `trip_field` `{ field: "seatsPerDeparture" | "advancePerPersonPaise" | "weeklyDays" | "departureMonths" |
    "pickupPoints" | "startCity" | "inclusions" | "exclusions" | "cancellationNotes", before, value }` (values typed
    per field by a refined union)
  - `note_add` `{ line }`, `note_remove` `{ line }` (an existing line, exactly)
  - `itinerary` `{ before: quoteDay[], days: quoteDay[] }` (change, reorder, add or remove days)
  - `ai_selling` `{ on: boolean }`
- `packageChangeProposal = z.object({ runId, changes: z.array(packageChange), questions: z.array({ id, text,
  choices: string[] }), ignored: z.array(z.string()), notChanged: z.array(z.string()), brochureLeftOut: z.boolean() })`
- `applyPackageChangesInput = z.strictObject({ runId, changeIds: z.array(z.string()).min(1).max(60) })`, output
  `{ applied: number }`; `undoPackageChangesInput = z.strictObject({ runId })`, output `{ undone: number; kept:
  { departureId, startDate, reason: "has_bookings" | "has_holds" }[] }`; `latestPackageChangeRunInput =
  z.strictObject({ packageId })`, output `{ runId, appliedAt, applied, undoable: boolean } | null`.
- Table `package_change_run`: `organization_id`, `id` (uuid 7), `template_id`, `requested_by`, `status`
  (`proposed` | `applied` | `undone`), `proposal` jsonb, `trip_stamp` text (the trip's state hash when proposed),
  `applied_change_ids` text[], `before` jsonb, `stamp_after` text, `applied_at`, `undone_at`, `created_at`,
  `updated_at`; index `(organization_id, template_id, created_at desc)`.

- [ ] Tests: the union parses each kind and refuses an unknown kind; `applyPackageChangesInput` refuses an empty list;
  the fixture creates a row (the db suite fails without it).
- [ ] Commit `feat(db): the package change run table and the ai change contracts`.

### Task 2: Show the changes (domain)

**Files:**
- Create: `packages/domain/src/ai/package-changes/` — `trip-snapshot.ts` (the trip as numbered text and as data, and
  `tripStamp`), `prompt.ts` (built-in prompt + Langfuse lookup), `ground.ts` (cited lines → values, flags),
  `propose.ts` (`proposePackageChanges`), `index.ts`
- Test: `packages/domain/test/ai/package-changes/ground.test.ts`, `propose.test.ts` (with the in-memory `AiModel`
  answering canned JSON), `trip-snapshot.test.ts`

**Interfaces:**
- Consumes: `seasonsOf`, `seasonColumns`, `packageCalendar` (departures ahead, 26 weeks), `getPackage`, the rate
  reader's attachment loading (`files.systemFile`, `pdfParts`) and its photo cap, `amountInLine` and
  `parsePrintedPrice` (`ai/rates/price.ts`), `resolveTokens`-style citing (`ai/drafts/sources.ts`), `reserveAiCall` /
  `releaseAiCall` / `recordTokens`, `aiEnabled`, `langfusePromptAt`, `refuse` / `modelRefusal`.
- Produces: `proposePackageChanges({ db, model, files, prompts }, access, input, now): Promise<PackageChangeProposal>`;
  `tripStamp(snapshot): string` (sha-256 of the snapshot's data, stable key order).

- [ ] **Step 1: failing tests**
  - grounding: a season price 7,999 cited from a line that prints "7999" passes; cited from a line without it →
    `not_in_message`; a date "18 Dec" in the cited line passes, "18/12" passes, missing → `not_in_message`; a line
    naming "5N/6D" on a 4N/5D trip → `other_trip`; reopening or cancelling a past date → `past_date`; cancelling a
    departure with bookings → `has_bookings` (still allowed, unticked); a change the member lacks permission for
    (departures without `departures:create`/`departures:edit`, AI selling without `settings:manage`) →
    `not_allowed`.
  - propose: a canned answer with a season, two new departures and a note line yields those three kinds with code-built
    values (the model's own figures ignored where the line disagrees), stores a `proposed` run with the trip stamp,
    records tokens; the model failing releases the credit and refuses (`AI_UNAVAILABLE` or the existing code);
    invalid JSON releases the credit and refuses; AI off → `AI_OFF` without reserving; month limit → `AI_MONTH_LIMIT`;
    questions from the model come back with no changes stored as applied.
  - snapshot: lists season columns with ids and dates ("all other days" for the open one), departures ahead with ids,
    status, seats and own prices, the repeats, seats for new departures, the advance, numbered note lines, pickup
    points, inclusions, exclusions, cancellation notes and itinerary days; the stamp changes when any of them changes
    and not otherwise.
- [ ] **Step 2:** run, fail. **Step 3:** implement. The model answers JSON (`json: true`, parsed with
  `jsonObjectIn` and a zod schema) citing message lines as `L<n>` and photo/PDF lines as `P<n>.L<m>` (the model
  transcribes photo lines it cites into a `photoLines` array). The prompt (built-in text, kept equal to the Langfuse
  production version) explains the trip snapshot, Hinglish and forwarded messages, "only this trip", "ask when the end
  date or the trip is unclear", and the change kinds; inputs are fenced (`fenced()` from `ai/fenced.ts`).
- [ ] **Step 4:** the new tests and `pnpm --filter @travel-crm/domain test -- ai/package-changes` pass.
- [ ] **Step 5:** commit `feat(domain): the ai reads what changed in a trip and proposes grounded changes`.

### Task 3: Apply and Undo all (domain)

**Files:**
- Create: `packages/domain/src/ai/package-changes/apply.ts`, `undo.ts`
- Test: `packages/domain/test/ai/package-changes/apply.test.ts`, `undo.test.ts`

**Interfaces:**
- Produces: `applyPackageChanges(tx, access, input, today): Promise<{ applied: number }>`;
  `undoPackageChanges(tx, access, input, today): Promise<UndoResult>`; `latestPackageChangeRun(tx, packageId)`.
- Consumes: `findPackageForChange` (lock first), `saveSpecialPrices`, `savePriceTable` (or `savePackageSeason` per id),
  `addPackageDates`, `cancelDeparture`, `reopenCancelledDeparture`, `setDepartureSeats`, `setDeparturePrices`,
  `mergePackagePart` + `updatePackage`, then `reconcilePackageDepartures` + `generatePackageDepartures` when a schedule
  field changed and departures may be made, `setPackageSellable`, `recordAudit`.

- [ ] **Step 1: failing tests**
  - apply: refuses a run of another trip or user (`NOT_FOUND`), a run not `proposed`, an unknown change id, a change
    flagged `not_allowed`; refuses `TRIP_CHANGED_SINCE` when the trip's stamp differs from the run's; applies a season,
    two departures, a seat change and a note in one transaction (a forced failure in the last one leaves nothing
    changed); writes one `package.ai-changes-applied` audit entry with the run id and count, besides each operation's
    own; stores `before` (seasons, touched fields, touched departures, created departure ids) and `stamp_after`.
  - undo: restores seasons, fields, seats, own prices, cancels created departures and reopens cancelled ones; keeps a
    created departure that has a booking or hold and reports it in `kept`; refuses `TRIP_CHANGED_SINCE` when the trip
    changed after apply; refuses a run that isn't the trip's latest applied one; writes
    `package.ai-changes-undone`.
- [ ] **Step 2:** run, fail. **Step 3:** implement. **Step 4:** tests pass. **Step 5:** commit
  `feat(domain): ai changes apply in one go and undo all`.

### Task 4: the api

**Files:**
- Create: `packages/api/src/routers/ai-package-changes.ts`, mounted as `ai.packageChanges`
- Modify: the ai router index, `apps/web/src/i18n/messages/en-IN/errors.json` (each new refusal reason) and
  `audit.json` (the two audit actions)
- Test: `packages/api/test/ai-package-changes.test.ts`

- [ ] Procedures: `propose` (`freshProcedure.requires("ai:suggest", "quotes:edit")`, mutation), `apply` and `undo`
  (`freshProcedure.requires("quotes:edit")`, mutations; departure changes inside are allowed only if the member holds
  their permission, which task 2 already flags), `latest` (`orgProcedure.requires("quotes:edit")`, query). Tests: each
  refuses without its permission; a happy path with the in-memory model; refusal reasons map to statuses.
- [ ] Commit `feat(api): ai change assistant procedures`.

### Task 5: the AI box on the trip page (web)

**Files:**
- Create: `apps/web/src/packages/ai-changes/ai-changes-card.tsx`, `change-table.tsx`, `change-row-words.tsx`
  (What / Now / New for each kind, from messages), `use-package-changes-ai.ts`
- Modify: `package-screen.tsx` (mount the card in the slot above Prices, for whoever holds `quotes:edit` with AI on the
  plan), the messages file for the feature
- Test: `apps/web/test/packages/ai-changes-card.test.tsx`, `change-table.test.tsx`

- [ ] Tests: the card shows a text box, Attach (photos or a PDF, through the AI input upload the rate reader uses) and
  Show the changes; while working it says so and the button is busy; questions show as choices and a box, and
  answering runs again; the table lists each change with a tick, What, Now and New, flagged rows in red with their
  reason and unticked; "Lines about other trips we left out" lists `ignored`; Apply N changes sends the ticked ids and
  then shows "N changes applied" with Undo all and the list; Undo all asks first (`ConfirmDialog`), then says what was
  undone and which departures stayed; a refusal shows `RefusalAlert`; the trip and its calendar refresh after Apply
  and Undo.
- [ ] Commit `feat(web): tell the ai what changed in a trip`.

### Task 6: a journey

- [ ] If the e2e harness can run the AI with a canned answer (look at `rates-packages-journey.spec.ts` and the api's
  test model settings), add `package-ai-changes-journey.spec.ts`: paste a message, see three changes, untick one, apply,
  see the price on the calendar, Undo all. If it can't, say so in the report and rely on the component and api tests.
- [ ] Commit `test(web): the ai change assistant journey`.
