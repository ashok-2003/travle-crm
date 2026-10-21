# Release 2: Bulk In and Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> This plan runs as four branches. Part 0 (`bulk/shared`) runs first, alone, and merges into `main`. Then
> `bulk/lead-import`, `bulk/lead-export` and `bulk/staff` run at the same time, each from `main` in its own worktree,
> and each merges into `main` as soon as its own merge gate is green, in whatever order they finish.

**Goal:** Agencies bring their lead sheet and their team in from a CSV or Excel file, and take their leads and staff
out again as files. Every row follows the rules a lead or a person added by hand follows, and every file is
short-lived and in the audit log.

**Architecture:**

- **One port reads and writes spreadsheets.** A spreadsheets port in `packages/integrations` is the only code that
  imports the four libraries (ADR 0008, and the new ADR 0030):
  - `csv-parse` and `csv-stringify` for CSV;
  - `read-excel-file` for .xlsx, behind a bounded pre-inflate with `fflate`;
  - our own streaming .xlsx writer on `fflate`'s `Zip`.
- **Two new L0 business modules:**
  - `imports`: batches, columns, value matches, header memory, rows, the reader, the report, an import's end, and
    the staff import;
  - `exports`: the export row, the runner that streams a kind's rows into a file, and its download.
  - crm (L1) calls them; they never call crm.
- **The browser never parses a file.**
  - It uploads the file straight to storage.
  - The worker reads it (`imports.read-file`), checks it (a dry run for its kind) and adds it (50 rows a
    transaction, resumable).
  - Each step is a listener on an event published in the step's own transaction (ADR 0009).
- **Part 0 owns every shared edit.** It builds every shared piece and makes every edit to a shared file, with stubs
  that a feature fills later. The three feature branches then own disjoint files and merge in any order.

**Tech Stack:**

- The Foundation's and release 1's stack, unchanged.
- Four new libraries, in `packages/integrations` only, pinned exactly (spec 6.1): `csv-parse` 7.0.3,
  `csv-stringify` 6.9.0, `read-excel-file` 9.3.12, `fflate` 0.8.3.
- No new registry component: `Progress`, `Collapsible`, `Checkbox`, `RadioGroup`, `Field`, `Select`, `Table`, `Item`
  and `Alert` are all in `components/ui` already.

**Spec:**

- `docs/superpowers/specs/2026-10-19-bulk-in-and-out-design.md` is the authority: rules B1-B55 and section 15's
  decisions. The owner set 10,000 rows per lead file, managers-only import, and blocked rows left out unless ticked.
- The screen reference is `docs/superpowers/specs/2026-10-19-bulk-in-and-out-screens.html`. Where it and the spec
  differ, the spec wins.
- Inputs:
  - `CLAUDE.md`, `DESIGN.md`, ADR 0028;
  - `docs/agent-playbook.md`, `docs/ui-build-loop.md`;
  - the release 1 plan (`2026-10-16-release-1-leads.md`), whose rulings R1 (predicates), R11 (`Sql`), R14 (lead
    workers), R15 (`firstOwner`), R23 (one rerun) and R32 (contacts) still hold.

---

## Global Constraints

Every task's requirements include these.

- **Shell and Node.**
  - Start every shell command with `cd <worktree> && source ~/.nvm/nvm.sh && nvm use >/dev/null &&`.
  - The worktrees are listed under "Branches" below. Never touch `/Users/ak/personal/travel-crm`, which is the owner's
    `main` checkout and only the controller merges there, and never touch another branch's worktree.
- **Git.**
  - Never `git stash`: worktrees share one stash.
  - Never `--no-verify`.
  - Stage files by name; never `git add -A`, `.` or `-a`.
  - Conventional Commits, header at most 100 characters, no `Co-Authored-By` trailer, never a `.env`.
- **Test first.** Every task writes its failing test, sees it fail, then writes the code.
- **File limits (B2, B4).**
  - The file is `.xlsx` or `.csv`, at most 10 MB, with at most 50 columns.
  - At most 10,000 data rows for leads, and 500 for staff.
  - A cell holds at most 4,000 characters.
  - At most 50 MB is inflated from a workbook.
  - Each column keeps 3 samples, and its values with their counts when it has at most 50 different ones (B11).
- **Content types.**
  - `text/csv` and `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` are for the `import_batch`
    record alone. Anywhere else they are refused with `VALIDATION`/`CONTENT_TYPE_NOT_ALLOWED`.
  - The web picks the type from the file's extension, never from `file.type`.
- **Keeping (B53, B54).**
  - An import's file and report are kept 7 days after the import's last status change.
  - An export's file is kept 24 hours after it is ready.
  - Download links last 5 minutes. An export downloads for its requester only.
- **Batches.**
  - The lead add writes 50 rows a transaction (B26).
  - The export reads 1,000 leads a page, by keyset, each page in its own transaction (B41).
  - A lead export holds at most 1,00,000 leads (B37).
  - Passwords go 25 to a call (B46).
- **Who may.** No new permission.
  - Lead import: both `leads:create` and `leads:assign`.
  - Lead export: `leads:view`, within its scope.
  - Staff import and export: `staff:manage`.
- **Procedures and lifecycle kinds.**
  - Procedures are exactly spec 6.5's, and their inputs name an import or export by id only.
  - Import steps are changes. Exports, their downloads and `reportLink` are `.meta({ lifecycle: "export" })`.
- **Files' names and formats.**
  - Exports are named `leads-2026-10-19-1612.xlsx` and `staff-2026-10-19.xlsx`, stamped in the agency's zone.
  - The report is named `<file name without its extension> - rows not added.xlsx`, or `.csv`.
  - Column orders are B38's (leads) and B52's (staff); formats are B39's.
  - The formula rule is B40's: `=`, `+`, `-`, `@`, a tab or a carriage return gets one leading apostrophe.
- **Data rules (CLAUDE.md).**
  - Every new table:
    - is an organization table, with `app_enable_org_rls`, composite keys and RESTRICT;
    - has an isolation fixture;
    - has UUID v7 ids and CHECK lists.
  - None is `appendOnly` and none is soft-deleted.
  - Ids of other modules' records (leads, people, members, users) are plain uuids, with no key.
  - Never `forOrg()` inside `forOrg()`. Never `$queryRawUnsafe`. Never `OFFSET`.
- **Privacy (spec 7, 8).**
  - Job data, job errors, logs and audit snapshots hold ids, counts and codes only: never a cell, a file name or a
    password.
  - Plain passwords exist only in the browser's memory and in the `setPasswords` requests (B46).
- **Words the tests read.**
  - Every new `DomainError` reason has its literal sentence in `errors.json`.
  - Every `recordAudit` action has its sentence in `audit.json`.
  - Every notification kind has its line in `kinds.ts` and its words in `notifications.json`.
  - Every word on screen is a next-intl message.
- **The owner's UI rules 1-7, `DESIGN.md` and the shared pieces (CLAUDE.md).**
  - Registry components only, with no `border`, `ring`, `shadow` or `divide` class outside `components/ui`.
  - 44px targets.
  - A dialog that sends a request holds while it is pending.
  - Dates show as "16 Oct" (`formatDay`), counts and money in mono with lakh grouping.
  - Every screen has its loading, empty, error-with-retry and refusal states.
- **Scale (ADR 0028, spec 11).**
  - Performance tests run in the performance tests' own database, with the large agency seeded (50,000 leads, 500
    staff).
  - Every plan is read with `EXPLAIN` as `app_runtime` inside `forOrg`.
  - A missed budget is a finding: fix the query or the index, never the budget.
- **Pinned versions.**
  - The four libraries above, exactly, are the only new packages.
  - If pnpm's release-age rule refuses one, stop and report.
- **Docker.**
  - Tests start their own containers. Never `pnpm dev`, `pnpm services:up` or `docker compose` in a branch
    worktree: the owner's `travel-crm-*` containers hold the ports.
  - Use `--concurrency=3`, run checks in the foreground, and keep each call under 10 minutes.
- **Readable code.**
  - Each source file opens with a one-line comment saying what it is for; ~200 lines is a smell.
  - No `any`, no `!`, no abbreviations in public names.
  - Inputs are `z.strictObject`; outputs are `z.object`.

## Review Focus

These five failure modes are the ones most likely to bite a person. Each is pinned by the test named, in the task
that owns the code.

1. **Excel's own values.**
   - The cases:
     - a phone typed as a number (Excel shows `9.19877E+11`, the cell holds `919876543210`);
     - a month-first date from a US-set Excel (`10/12/2026`);
     - a bare serial number in a text column (`45941`).
   - Expected:
     - every digit of the phone is kept;
     - dates are always day first;
     - a value that can't be trusted goes into the note, never in as a wrong date.
   - Pinned by:
     - 0.1: "reads a phone typed as a number with all its digits, never 9.19876543210E+11 or .0";
     - 1.2: "reads 10/12/2026 as 10 Dec 2026, never 12 Oct";
     - 1.2: "keeps 45941 in a date column as 'Travel date: 45941' in the note".
2. **A stale preview.**
   - The cases, between Check and Add:
     - staff add the same customer by hand;
     - a number is blocked;
     - an owner is removed from staff;
     - a staff username is taken.
   - Expected: the add applies the rules again, row by row, and never fails the whole import or answers 500:
     - the customer's row becomes a repeat enquiry;
     - the blocked row is left out unless ticked;
     - the removed owner's rows go to the default owner;
     - the staff import returns to its preview with that row marked.
   - Pinned by:
     - 1.4: "applies the rules again: a contact blocked since the check is left out, a lead added by hand meanwhile
       takes a repeat enquiry";
     - 1.4: "gives an owner removed since the check's rows to the default owner";
     - 3.3: "returns the import to the preview when a row fails now, its row marked, every hash cleared".
3. **One customer twice, or a contact someone else holds.**
   - The cases:
     - two rows with the same phone;
     - a later row with the same phone and a new email;
     - a row whose email belongs to another person.
   - Expected:
     - one person;
     - the later row is a repeat enquiry on the lead the earlier one made;
     - the new email is filled in;
     - another person's email is dropped (R32) and the row is still added.
   - Pinned by:
     - 1.3: "makes a later row for the same person a repeat enquiry on the lead an earlier row makes";
     - 1.4: "fills a contact the person lacks and drops one another person holds, still adding the row".
4. **Double presses from two tabs or a slow phone.**
   - The cases: Add twice, Add in two tabs, Stop twice, Cancel while adding, a `setPasswords` batch sent again after a
     timeout.
   - Expected: one add, never two, and a sentence or a no-op, never a second audit entry.
   - Pinned by:
     - 0.4: "answers IMPORT_NOT_READY to a second Add, queues one add and records one import.started";
     - 0.4: "changes nothing on a second Stop, and refuses Cancel while adding";
     - 3.3: "takes a batch of passwords sent again in place of the first".
5. **The agency's day.**
   - The cases:
     - an enquiry date `12/10/2026`;
     - a file made at 23:50 IST;
     - "Kept until".
   - Expected:
     - the lead is added 12 Oct at the agency's midnight, not 11 Oct in UTC;
     - tomorrow's date in the agency's zone is in the future and goes into the note;
     - "Added on", the file name's stamp and "Kept until 26 Oct" are on the agency's clock.
   - Pinned by:
     - 1.2: "takes an enquiry date not in the future as the added date, at the agency's midnight";
     - 2.1: "writes Added on and Next follow-up as the agency's wall clock, and stamps the file name in its zone".

## Branches, ownership and merge order

| Branch             | Worktree                                        | Tasks    | Waits for                                       |
| ------------------ | ----------------------------------------------- | -------- | ----------------------------------------------- |
| `bulk/shared`      | `/Users/ak/personal/travel-crm-bulk-shared`      | 0.1-0.14 | the spec and this plan on `main`                |
| `bulk/lead-import` | `/Users/ak/personal/travel-crm-bulk-lead-import` | 1.1-1.9  | `bulk/shared` merged                            |
| `bulk/lead-export` | `/Users/ak/personal/travel-crm-bulk-lead-export` | 2.1-2.4  | `bulk/shared` merged                            |
| `bulk/staff`       | `/Users/ak/personal/travel-crm-bulk-staff`       | 3.1-3.8  | `bulk/shared` merged                            |

**What each feature branch owns** (only it edits these, after Part 0):

- **`bulk/lead-import`:**
  - **Domain:** `packages/domain/src/crm/{save-enquiry,create-lead,repeat-enquiry,demo-lead-data}.ts` and
    `packages/domain/src/crm/lead-import/**`.
  - **Contracts:** `packages/contracts/src/crm/lead-import.ts`.
  - **Api:** `packages/api/src/routers/lead-imports.ts`.
  - **Web:**
    - `apps/web/src/leads/import/**` and `apps/web/src/app/(app)/leads/import/**`;
    - `leads.json`'s `import` key and `apps/web/public/samples/leads-sample.csv`.
  - **Tests:**
    - `packages/domain/test/crm/{save-enquiry.test.ts,lead-import/**}`;
    - `packages/domain/test/performance/lead-import-at-scale.test.ts` and
      `packages/domain/test/platform/demo.test.ts`;
    - `apps/api/test/lead-imports*.test.ts`;
    - `apps/web/test/leads/import/**`, `apps/web/test/e2e/lead-import-*.spec.ts` and
      `apps/web/test/e2e/audit/09-lead-import.audit.ts`.
- **`bulk/lead-export`:**
  - **Domain:** `packages/domain/src/crm/{lead-list,lead-list-query}.ts` and `packages/domain/src/crm/lead-export/**`.
  - **Contracts:** `packages/contracts/src/crm/lead-export.ts`.
  - **Api:** `packages/api/src/routers/lead-exports.ts`.
  - **Web:**
    - `apps/web/src/leads/export/**` and `apps/web/src/app/(app)/leads/exports/**`;
    - `leads.json`'s `export` key.
  - **Tests:**
    - `packages/domain/test/crm/lead-export*.test.ts` and
      `packages/domain/test/performance/lead-export-at-scale.test.ts`;
    - `apps/api/test/lead-exports.test.ts`;
    - `apps/web/test/leads/export/**`, `apps/web/test/e2e/lead-export*.spec.ts` and
      `apps/web/test/e2e/audit/10-lead-export.audit.ts`.
- **`bulk/staff`:**
  - **Domain:**
    - `packages/domain/src/identity/{identity,index,staff,staff-accounts,erasure}.ts` and the new
      `identity/{staff-phone,staff-row-facts,imported-staff,staff-export-rows}.ts`;
    - `packages/domain/src/imports/{index.ts,staff/**}` and `packages/domain/src/exports/{index,staff-export}.ts`.
  - **Data:** `packages/db/prisma/schema/identity-auth.prisma` and migration `20261021100000_staff_phone`.
  - **Contracts:** `packages/contracts/src/identity/{staff,staff-import,staff-export}.ts`.
  - **Api:** `packages/api/src/routers/{staff,staff-imports,staff-exports}.ts`.
  - **Web:**
    - `apps/web/src/organization/staff/**` and `apps/web/src/app/(app)/staff/**`;
    - `staff.json`, `apps/web/public/samples/staff-sample.csv`;
    - in `errors.json`, `IMPORT_OVER_SEAT_LIMIT`; in `audit.json`, `actions.staff.phone-changed`.
  - **Tests:**
    - `packages/domain/test/{identity/staff-*,imports/staff/**}` and
      `packages/domain/test/performance/staff-import-at-scale.test.ts`;
    - `apps/api/test/staff-*.test.ts`;
    - `apps/web/test/organization/staff/**`, `apps/web/test/e2e/staff-*.spec.ts` and
      `apps/web/test/e2e/audit/11-staff-bulk.audit.ts`.

**Shared files.** Part 0 makes every edit two features would otherwise both make. After Part 0 they are frozen, or
have the one owner named here:

| Shared file                                                                                                                                | Part 0 writes                                                                                                                                                                    | After Part 0                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `apps/api/src/worker-jobs.ts`, `apps/api/src/services.ts`, `apps/api/src/console-jobs.ts`                                                  | every bulk listener with its dependencies (the features' as stubs), `spreadsheets`, the sweep's schedule                                                                         | frozen                                               |
| `packages/api/src/routers/app-router.ts`                                                                                                   | `leadImports`, `leadExports`, `staffImports`, `staffExports`                                                                                                                     | frozen                                               |
| `packages/api/src/routers/{lead-imports,lead-exports,staff-imports,staff-exports}.ts`                                                      | each `router({})`                                                                                                                                                                | lead-import / lead-export / staff / staff            |
| `packages/domain/src/crm/index.ts`                                                                                                         | `export { addLeadImportListener, checkLeadImportListener } from "./lead-import/index.js"` and `export { makeLeadExportListener } from "./lead-export/index.js"`                   | frozen                                               |
| `packages/domain/src/crm/lead-import/index.ts`, `crm/lead-export/index.ts`                                                                 | the stub listeners                                                                                                                                                               | lead-import / lead-export                            |
| `packages/domain/src/imports/index.ts`, `imports/staff/index.ts`, `exports/index.ts`, `exports/staff-export.ts`                            | the modules' API and the staff stubs                                                                                                                                             | staff                                                |
| `packages/domain/src/identity/{identity,index}.ts`                                                                                         | `matchLeadWorkers`, `matchRoles`                                                                                                                                                 | staff                                                |
| `packages/domain/src/platform/{erasure,failed-jobs,index}.ts`, `apps/web/src/console/jobs/platform-queues.ts`                              | the erasure's withdrawals, the sweep's queue                                                                                                                                     | frozen                                               |
| `packages/contracts/src/{imports,exports}/**`, `contracts/src/crm/{index,file-words}.ts`, `contracts/src/identity/index.ts`, `kernel/phone.ts` | every shared shape                                                                                                                                                               | frozen                                               |
| `packages/contracts/src/crm/lead-import.ts`, `crm/lead-export.ts`, `identity/{staff-import,staff-export}.ts`                               | the fields, reasons and headers                                                                                                                                                  | lead-import / lead-export / staff / staff            |
| `apps/web/src/i18n/messages/en-IN/errors.json`                                                                                             | `CONTENT_TYPE_NOT_ALLOWED`, `IMPORT_NOT_READY`, `IMPORT_ALREADY_RUNNING`, `IMPORT_NEEDS_NAME_AND_CONTACT`, `IMPORT_NEEDS_SIGN_IN_NAME_AND_ROLE`, `FIELD_MATCHED_TWICE`            | staff (`IMPORT_OVER_SEAT_LIMIT`, after `FIELD_MATCHED_TWICE`) |
| `apps/web/src/i18n/messages/en-IN/audit.json`                                                                                              | `actions.import.*`, `actions.export.*`, `recordTypes.import_batch`, `recordTypes.data_export`                                                                                    | staff (`actions.staff.phone-changed`)                |
| `notifications.json`, `apps/web/src/notifications/preferences/kinds.ts`                                                                    | `import.finished`, `lead.imported`, `export.ready`                                                                                                                               | frozen                                               |
| `apps/web/src/i18n/messages/en-IN/leads.json`                                                                                              | `"import": {}` right after `"newLead"`; `"export": {}` as the last key; `sources.bulk_upload` reads "Import"                                                                     | lead-import (`import`) / lead-export (`export`)      |
| `imports.json`, `exports.json`, `apps/web/src/i18n/messages.ts`, `apps/web/src/lib/routes.ts`                                              | all their keys and the six routes                                                                                                                                                | frozen                                               |
| `apps/web/src/leads/list/{leads-screen,leads-header-actions}.tsx`                                                                          | the header's three-pill row                                                                                                                                                      | frozen                                               |
| `apps/web/src/leads/import/lead-import-button.tsx`, `apps/web/src/leads/export/lead-export-button.tsx`                                     | each `() => null`                                                                                                                                                                | lead-import / lead-export                            |
| `apps/web/test/e2e/audit/shot-list.ts`, `apps/web/test/e2e/support/imports.ts`                                                             | every new shot, in one block per feature; the upload helpers                                                                                                                     | frozen                                               |
| `.dependency-cruiser.cjs`, `CLAUDE.md`, `packages/domain/README.md`, `docs/adr/**`, `docs/deploy-checklist.md`                             | the rules and the docs for all four                                                                                                                                              | frozen                                               |

**A change a feature needs in a frozen file** goes under "Needs from others" in its report, never into the file. The
controller makes it on `main` in a small branch (`bulk/shared-2`), and the features take it with
`git merge --no-edit main`. Two owners never meet in one JSON object's same lines. The two `leads.json` placeholders
are far apart, and the staff branch is the only later editor of `errors.json` and `audit.json`.

**Making a worktree** (`<name>` is `shared`, `lead-import`, `lead-export` or `staff`):

```bash
cd /Users/ak/personal/travel-crm && git worktree add ../travel-crm-bulk-<name> -b bulk/<name> main
cd /Users/ak/personal/travel-crm-bulk-<name> && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install --frozen-lockfile && pnpm --filter @travel-crm/db generate && pnpm --filter @travel-crm/brand build && pnpm --filter @travel-crm/web generate
```

(The controller runs the first line: it touches the main checkout's worktree list only.)

**The branch gate** is `pnpm check`'s parts, each in the foreground, with `W` the worktree:

```bash
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run format:check && pnpm run scripts:test && pnpm exec turbo run typecheck lint test --concurrency=3 && pnpm run depcruise
cd $W/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec playwright test --project=phone
cd $W/apps/web && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec playwright test --project=desktop
```

**The merge gate** is the branch gate, then CI's other jobs, each in the foreground:

```bash
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm migrations:check
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm audit --audit-level=high
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm workflows:lint
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm images:smoke
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm product:smoke
cd $W && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm lighthouse
```

**Gate rules:**

- Each task ends green on the parts it touches, and a branch's last task ends green on the merge gate.
- A timing test the branch doesn't touch (`relay.test.ts`, `counters.test.ts`) may need one rerun alone.
- To run one journey, use `./node_modules/.bin/playwright test test/e2e/<spec>` from `apps/web`.

**Merging a branch** (its last task, then the controller):

1. In the worktree: `git merge --no-edit main`, to take in whatever merged first.
   - Conflicts are import lines at most.
   - `pnpm-lock.yaml` takes either side, then `pnpm install`.
2. Run the merge gate again.
3. The controller merges in the main checkout:
   `git merge --no-ff bulk/<name> -m "chore: merge bulk/<name> (<what it brings>)"`.
4. The owner allows pushing `main` after a merge whose full gate is green (playbook 3).

**The visual audit loop** (each feature's last task; `docs/ui-build-loop.md` section 5):

1. Shoot the branch's own audit file on both projects:
   `AUDIT_OUT=test-results/audit/round-1 pnpm exec playwright test --config playwright.audit.config.ts --project=phone test/e2e/audit/<file>`,
   then again with `--project=desktop`.
2. Open every PNG and judge it against `DESIGN.md` and the owner's seven rules. List the findings as
   `# | must/should/could | shots | what's wrong | file | the fix`.
3. Fix every must and should in the branch's own files. A fix to a shared piece goes under "Needs from others".
4. Re-shoot into `round-2` and compare. Repeat until no must is left, and keep the table in the report.

## Rulings ledger

Format: `Ruling: <what> — <why> — <cost if wrong>`. These are the planner's calls on what the spec leaves open or
where it conflicts with the code. Branches add their own to their reports.

**Branches**

- D1. Ruling: the features' listeners, routers, header buttons and `leads.json` keys reach `main` as Part 0's stubs:
  - a listener's body throws `new Error("Not built yet: bulk plan, Task <n>")`;
  - a router is `router({})`;
  - a button is `() => null`;
  - a message key is `{}`.

  Why: the shared files are then written once, so three branches never edit the same lines. The stubs are
  unreachable on `main`: no procedure publishes their events and no screen links to them until the feature merges.
  Cost if wrong: a feature that needs a different stub signature asks the controller for `bulk/shared-2`.
- D2. Ruling: journey 9 is split. Lead import proves Import is off with its hint, lead export proves Export still
  works, and staff proves both on Staff. The `leads-header` shot (three pills on one 390px row) lives in
  `10-lead-export.audit.ts`, and whichever of lead import and lead export merges second re-shoots it after
  `git merge main` — spec 13 gives journey 9 to "whichever merges second", but each branch must be green on its own —
  cost if wrong: none.
- D3. Ruling: value matching (B11) is Part 0's, including identity's `matchLeadWorkers` and `matchRoles` — spec 13
  lists "value matches" under the shared pieces and only the function's name under lead import, and the reader is
  shared — cost if wrong: none.

**Data**

- D4. Ruling: `import_batch` gains three columns the screens need and section 5 leaves out:
  - `rows_added`, for Recent imports and B6's "1,094 leads added";
  - `sheet_count`, for B3's "the first of 3";
  - `rows_new_stage`, for the quiet line "612 leads will be New".

  Also, `import_value_match.rows` is nullable: it is filled once a column is matched to the field. Cost if wrong:
  three columns dropped.
- D5. Ruling: every status change sets `keep_until` to that moment plus 7 days — B53's "after the import ends, or
  after its last change while it waits at a step" is the same rule — cost if wrong: none.
- D6. Ruling: an import is its starter's. Every procedure on it from anyone else answers `NOT_FOUND`, and Recent
  imports lists the person's own last ten. Why:
  - the job acts as the importer (B31);
  - the notices go to the importer;
  - the staff passwords live in the importer's tab.

  Cost if wrong: managers can't follow each other's imports; widening to the agency is one `where`.
- D7. Ruling: the keys from `import_batch` and `data_export` to `attachment` are RESTRICT. The sweep and erasure set
  the batch's or export's attachment ids to null in the same transaction, before `deleteRecordFiles` deletes the
  attachment rows — a column-list `SET NULL` key can't be written in Prisma's schema, and the drift check compares it
  — cost if wrong: none.
- D8. Ruling: a row's reasons are stored as text: `code`, `code:field`, `same_as_row:12` or
  `already_imported:2026-10-12`. The imports module encodes and decodes them; the api sends objects — one column,
  readable in SQL — cost if wrong: none.
- D9. Ruling: the fingerprint is the SHA-256 of the JSON array `[kind, ...matched values as read]`, as `bytea` — B33
  — cost if wrong: none.

**Reading**

- D10. Ruling: cells come as text.
  - A whole number is `toFixed(0)`, so it never reads as `9.19876543210E+11` or `919876543210.0`.
  - Other numbers are as JavaScript prints them, and booleans `TRUE` or `FALSE`.
  - A date or date-time cell is its day, `yyyy-mm-dd`, in UTC (Excel's dates have no zone).
  - A cell is cut to 4,001 characters, so the callers' own limits still refuse what was longer, and a 10 MB cell
    costs no more than its file. B2 says "a cell at most 4,000 characters" but B5 gives no reason for refusing a
    file over it.

  Cost if wrong: a long cell's file refused instead.
- D11. Ruling: B3's encodings and row numbers.
  - A CSV without a byte-order mark is decoded as UTF-8 with `fatal: true`, and on failure as `windows-1252`.
  - The delimiter is the most frequent of `,` `;` and tab outside quotes in the first record, a comma on a tie.
  - Row numbers count CSV records, the header being row 1, so a quoted cell with a line break keeps Excel's
    numbering.

  Cost if wrong: none.
- D12. Ruling: B4 and B5 for workbooks.
  - A file that starts with the compound-file signature is `protected` when it holds the UTF-16 name
    `EncryptedPackage`, and `old_excel` otherwise.
  - The pre-inflate streams every entry through `fflate`'s `Unzip` against a 50 MB running total.
  - It resolves the first sheet's part from `xl/workbook.xml` and its rels, and counts that part's `<row` elements
    before `read-excel-file` runs. So a million-row sheet is refused before its cells are read.

  Cost if wrong: a second inflate's time (it is bounded by the first).
- D13. Ruling: B3 and B9's headers.
  - A blank header is named "Column C" by its letter, and a repeat gets "(2)", "(3)".
  - A header's key is the header lower-cased with every space, punctuation mark and symbol removed
    (`/[\s\p{P}\p{S}]+/gu`).
  - The reader suggests a target for every value of every column with at most 50 values, for each of the kind's
    value fields, stored per `(field, value)`. Step 2 can then show the values of a column the importer re-matches
    to Owner at once.
  - The check completes the suggestions for a longer column (B11).

  Cost if wrong: none.
- D14. Ruling: staff header guesses (B43 names none):
  - Name: name, full name, staff name, employee name, naam;
  - Username: username, user name, login, user id;
  - Email: email, email id, mail id, e-mail;
  - Phone: phone, mobile, mobile no, contact, whatsapp;
  - Role: role, designation, position.

  The lead export's Source detail and the staff export's Joined, Status and Last active are guessed "Don't import".
  Cost if wrong: one list.
- D15. Ruling: the sample files are static CSVs (`/samples/leads-sample.csv`, `/samples/staff-sample.csv`) — spec 3.2
  asks for "a static file"; a CSV needs no build step — cost if wrong: one file.

**Leads**

- D16. Ruling: an Enquiry date makes the lead's `created_at` and `stage_changed_at` 00:00 of that day in the agency's
  zone. Its timeline entries are at the import's time (`NewLeadRecord.recordedAt`). A date after the agency's today is
  a value we can't read (B21) — B23 — cost if wrong: none.
- D17. Ruling: with a Budget column, no Budget basis column and no answer, budgets are "for everyone". The question
  starts there — B20 leaves the default open — cost if wrong: one default.
- D18. Ruling: the add checks B31 at the start of every batch, not only the job's. A 6-minute add can outlive a
  removal — cost if wrong: one query a batch.
- D19. Ruling: a row whose owner can no longer work leads when its batch is added goes to the default owner, never
  failing the import — B12, and Review Focus 2 — cost if wrong: none.
- D20. Ruling: `import.finished` and `export.ready` are notified as `systemActor(organizationId)` with the importer or
  requester as the recipient, because `notify()` always leaves out its own actor. `lead.imported` is notified as the
  importer's job access, which leaves the importer out as B18 wants. Each notice carries the step's event id as
  `sourceEventId` — cost if wrong: none.
- D21. Ruling: `lead.imported` links `/leads?source=bulk_upload` — the owner's own Leads, Mine by default, filtered by
  source Import — cost if wrong: none.

**Staff**

- D22. Ruling: the staff import has no `decide` and makes no report.
  - Its preview has no choices and lists every row not added (spec 3.4).
  - Its add is all or nothing (B45).
  - Its Done screen offers only the passwords.

  Spec 6.5 lists `decide` for staff; it would have nothing to decide. Cost if wrong: one procedure.
- D23. Ruling: a staff row whose name `personName` refuses (`invalid_name`), or whose phone isn't one
  (`invalid_phone`), is not added — B43 reads values "with Add staff's own schemas", which refuse them, and B44's list
  doesn't name these two — cost if wrong: the phone dropped and the row added instead.
- D24. Ruling: when the staff add can't finish (a username taken meanwhile, the seats gone), the import returns to
  `checked`:
  - the row is marked;
  - `failure_reason` is `row_changed` or `over_seat_limit`;
  - every hash is cleared.

  The browser drops its passwords when it sees that. B47's "returns to the preview" needs a status, and `failed`
  would end the import. Cost if wrong: none.
- D25. Ruling: the staff add's one transaction runs with `{ timeout: 30_000 }` through identity's `forOrg` options.
  Spec 11 allows 10 s for 500 accounts; the default is 5 s. Cost if wrong: none.
- D26. Ruling: the password sheet's formula rule is a second copy, in `password-sheet.ts`. The web can't import the
  adapter, and the adapter imports nothing of ours. Both copies are pinned by the same six cases. Cost if wrong: one
  copy drifting, which the tests catch.

**Exports**

- D27. Ruling: each export page runs `leadListQuery` (the list's own keyset, filters and indexes) for 1,000 ids, then
  `leadExportRowsQuery(ids)` for the columns the list doesn't select, by `(organization_id, id) = ANY` — spec 6.3's
  "leadListQuery a page at a time" — cost if wrong: one query a page.
- D28. Ruling: dates and times in files.
  - In .xlsx, a date's format is `d mmm yyyy` and a date-time's `d mmm yyyy h:mm AM/PM`.
  - In CSV, a date is `yyyy-mm-dd` and a date-time `yyyy-mm-dd HH:MM`, on the agency's clock.
  - B20's reader accepts all of them.

  Cost if wrong: none.
- D29. Ruling: a file's words are the screen's (`leads.json`): "Contacted", "4★", "Vegetarian", "per person",
  "Import".
  - `@travel-crm/contracts/crm`'s `leadFileWords` holds them with the reader's synonyms (B11, B20).
  - A web test holds them equal to `leads.json`.
  - A contracts test reads each one back to its key.

  Cost if wrong: none.
- D30. Ruling: `leads.json`'s `sources.bulk_upload` changes from "Bulk upload" to "Import" (spec B19 names it so) in
  Part 0 — cost if wrong: one word.
- D31. Ruling: the sweep also deletes any file still stored under an import or export that is already `expired` — a
  job's late write after an erasure — so no file outlives its record by more than an hour — cost if wrong: one query
  an hour.
- D32. Ruling: erasure marks every unfinished import (`uploading` to `adding`) and every `making` or `ready` export
  `expired`. Their files are gone; a job meeting the status then stops quietly — cost if wrong: an import the agency
  starts again.

**Errors**

- D33. Ruling: `EXPORT_NOT_READY` and `EXPORT_EXPIRED` already have sentences (the platform's exports). The bulk
  exports throw the same reasons, and so does the report's download, which B36 calls an export. Spec 6.5 lists them as
  new; the sentences stay as they are — cost if wrong: a report-specific pair of reasons.
- D34. Ruling: `FIELD_MATCHED_TWICE`'s sentence is generic ("Each field takes one column."). `ColumnMatcher` names
  the column in place ("Phone · matched to 'Mobile No'") — a refusal's sentence can't carry names (release 1's R32) —
  cost if wrong: none.
- D35. Ruling: `import_batch_one_adding` is spec 5's index, for both kinds, so a staff import and a lead import can't
  add at once either. `IMPORT_ALREADY_RUNNING`'s sentence reads "Another import is being added. Try again when it's
  done." — cost if wrong: a staff import of seconds waits.
- D36. Ruling: file names stay through the sweep and erasure. Spec B53 and B55 list what is emptied, and a file named
  after one customer is rare — cost if wrong: one column to empty.
- D37. Ruling: the shared web hook is `importRefetchInterval(detail)`, not a `useImport(id)`. Each kind's procedures
  are on its own router, so `useLeadImport` and `useStaffImport` pass it to their query — spec 6.6's `useImport` can't
  know the router — cost if wrong: none.

## File structure

```
packages/integrations/src/spreadsheets/                  0.1  the port, the CSV and .xlsx readers and writers
packages/db/prisma/schema/{imports,exports}.prisma       0.2  six tables
packages/db/prisma/migrations/20261020100000_imports_and_exports/   0.2
packages/contracts/src/{imports,exports}/                0.3  shared shapes
packages/contracts/src/crm/{lead-import,lead-export,file-words}.ts   0.3 (lead-import / lead-export fill theirs)
packages/contracts/src/identity/{staff-import,staff-export}.ts       0.3 (staff fills)
packages/domain/src/identity/import-matches.ts           0.4  owners and roles by a file's words
packages/domain/src/imports/                             0.5-0.8, 0.10; staff/ is 3.2, 3.3
packages/domain/src/exports/                             0.9, 0.10; staff-export.ts is 3.5
packages/domain/src/platform/bulk-files-sweep.ts         0.10
packages/domain/src/crm/save-enquiry.ts, lead-import/    1.1-1.4
packages/domain/src/crm/lead-export/                     2.1
apps/web/src/imports/, apps/web/src/exports/             0.12, 0.13
apps/web/src/leads/import/, app/(app)/leads/import/      1.6, 1.7
apps/web/src/leads/export/, app/(app)/leads/exports/     2.3
apps/web/src/organization/staff/{import,export}/, app/(app)/staff/   3.6, 3.7
```

---

## Part 0: Shared pieces (`bulk/shared`, in order)

### Task 0.1: The spreadsheets port and its adapters

**Files:**

- Create, in `packages/integrations/src/spreadsheets/`:
  - `index.ts`;
  - `spreadsheets.ts` (the port and `SpreadsheetUnreadableError`);
  - `cell-text.ts`;
  - `read-csv.ts`, `bounded-unzip.ts`, `read-xlsx.ts`;
  - `formula-safety.ts`;
  - `write-csv.ts`, `write-xlsx.ts`, `xlsx-parts.ts`;
  - `real-spreadsheets.ts`, `memory-spreadsheets.ts`.
- Create the tests:
  - `packages/integrations/test/spreadsheets/{read-csv,read-xlsx,limits,write,memory-spreadsheets}.test.ts`;
  - `packages/integrations/test/spreadsheets/sample-files.ts`, which builds the test workbooks with `fflate`: a zip
    bomb, a million-row sheet, compound-file headers with and without `EncryptedPackage`.
- Modify:
  - `packages/integrations/package.json` (the four dependencies, exact versions);
  - `pnpm-lock.yaml`;
  - `.dependency-cruiser.cjs` (`vendor-sdks-only-in-integrations` gains `csv-parse|csv-stringify|read-excel-file|fflate`).

**Interfaces** (produces, from `@travel-crm/integrations/spreadsheets`):

```ts
export type SpreadsheetKind = "csv" | "xlsx";
export const unreadableReasons = ["not_a_spreadsheet", "protected", "old_excel", "no_column_names", "no_rows",
  "too_many_rows", "too_many_columns", "too_large_unpacked"] as const;
export type UnreadableReason = (typeof unreadableReasons)[number];
export class SpreadsheetUnreadableError extends Error { readonly reason: UnreadableReason }
export interface ReadLimits { kind: SpreadsheetKind; maxRows: number; maxColumns: number; maxCellLength: number }
/** A data row: its number in the file (the header is row 1), its cells as text, null when empty. */
export interface SheetRow { rowNumber: number; cells: readonly (string | null)[] }
/** header: blanks named "Column C", repeats "(2)" (D13). sheetName is null for a CSV, whose sheetCount is 1. */
export interface ReadSheet { sheetName: string | null; sheetCount: number; header: readonly string[]; rows: readonly SheetRow[] }
export type ColumnKind = "text" | "phone" | "number" | "date" | "date-time";
export interface WriterColumn { header: string; kind: ColumnKind }
/** text, phone: string; number: number; date: "yyyy-mm-dd"; date-time: "yyyy-mm-ddTHH:MM" on the agency's clock. */
export type WrittenCell = string | number | null;
export interface SheetWriter { write(rows: readonly (readonly WrittenCell[])[]): void; finish(): Promise<Uint8Array> }
export interface Spreadsheets {
  read(bytes: Uint8Array, limits: ReadLimits): Promise<ReadSheet>;
  writer(options: { kind: SpreadsheetKind; sheetName: string; columns: readonly WriterColumn[] }): SheetWriter;
}
export function createSpreadsheets(): Spreadsheets;
export interface MemorySpreadsheets extends Spreadsheets {
  bytesOf(sheet: { header: string[]; rows: (string | null)[][]; sheetName?: string }): Uint8Array;
  failNextRead(reason: UnreadableReason): void;
  readonly written: readonly { kind: SpreadsheetKind; columns: readonly WriterColumn[]; rows: WrittenCell[][] }[];
}
export function createMemorySpreadsheets(): MemorySpreadsheets;
```

- [ ] **Step 1: Write the failing tests.**

```ts
// read-csv.test.ts
it("reads UTF-8 with or without a byte-order mark, UTF-16 with one, and Windows-1252 otherwise", …) // "Café Mumbai" each way
it("finds the delimiter from the first row: comma, semicolon or tab", …)
it("names a blank header by its letter and a repeated one with (2)", …) // ["Name","","Name"] → ["Name","Column B","Name (2)"]
it("skips empty rows, numbering each row as the file does", …) // rows 2 and 4 when 3 is empty; a quoted two-line cell is one row
it("drops one leading apostrophe", …) // "'+91 98765 43210" → "+91 98765 43210"; "''x" → "'x"
// read-xlsx.test.ts
it("reads the first sheet and says its name and how many there are", …) // "Leads Oct", 3
it("reads a formula's last value, never the formula", …)
it("reads a phone typed as a number with all its digits, never 9.19876543210E+11 or .0", …) // "919876543210"
it("reads a date cell as yyyy-mm-dd", …) // 12 Oct 2026 → "2026-10-12"
it("reads hidden rows, and a merged cell's value in its first cell", …)
it("tells a password-protected workbook from an old .xls", …) // "protected", "old_excel"
// limits.test.ts
it("refuses a zip bomb as too_large_unpacked, inflating no more than 50 MB", …) // heapUsed grows < 80 MB
it("refuses a sheet of a million rows as too_many_rows before reading its cells", …) // within 3 s
it("takes 10,000 rows and 50 columns, and refuses a 10,001st row and a 51st column", …)
it("cuts a cell to 4,001 characters, so a 10 MB cell costs no more than its file", …)
it("says not_a_spreadsheet, no_column_names and no_rows for files that are those", …)
// write.test.ts
it("writes .xlsx values only, with a bold frozen header, dates as date cells and numbers as numbers", …) // no <f> in the sheet; read back typed
it("writes CSV as UTF-8 with a byte-order mark, CRLF line ends and every cell quoted", …)
it("puts an apostrophe before text starting with =, +, -, @, a tab or a carriage return, in both formats", …)
it("keeps an .xlsx phone cell as +91 98765 43210, and gives the CSV's the apostrophe", …)
it("reads back what it wrote, each apostrophe dropped once", …)
it("streams 50,000 rows of 16 columns 1,000 at a time, holding only the compressed output", …) // heapUsed grows < 100 MB; read back 50,000 rows
// memory-spreadsheets.test.ts
it("reads a sheet given as JSON bytes, fails with any reason asked for, and keeps what a writer wrote", …)
```

- [ ] **Step 2: Run them to see them fail.**
  - Run `pnpm install` (after adding the dependencies), then `pnpm --filter @travel-crm/integrations test -- spreadsheets`.
  - Expected: FAIL; the module doesn't exist.
- [ ] **Step 3: Implement** by D10-D13.
  - The CSV reader uses `csv-parse` with `relax_column_count`. It skips empty records itself, keeping the numbering,
    and stops at `maxRows + 1` data rows.
  - The .xlsx reader checks the file's signature, runs the bounded pre-inflate, then `read-excel-file`'s Node entry
    with `sheet: 1` and its sheet names.
  - The .xlsx writer:
    - feeds a `ZipDeflate` sheet entry one `<row>` per row, with inline strings, numbers as `<v>`, and dates as
      serial numbers;
    - has three styles: 1 the bold header, 2 dates `d mmm yyyy`, 3 date-times `d mmm yyyy h:mm AM/PM`;
    - freezes the header with `<pane ySplit="1" state="frozen"/>`;
    - keeps only the compressed chunks.
  - `neutraliseFormula(text)` prefixes `'` on `/^[=+\-@\t\r]/`. It applies to text cells in both formats, and to
    phone cells in CSV only (B40).
- [ ] **Step 4: Run the tests and the import rules.**
  - Run the tests above, then `pnpm run depcruise`.
  - Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(integrations): the spreadsheets port: CSV and .xlsx, read bounded, written streaming`.

### Task 0.2: The tables, and files only imports and exports take

**Files:**

- Create:
  - `packages/db/prisma/schema/{imports,exports}.prisma`;
  - `packages/db/prisma/migrations/20261020100000_imports_and_exports/migration.sql`;
  - `packages/db/test/org-table-fixtures/{imports,exports}.ts`;
  - `packages/db/test/bulk-tables.test.ts`;
  - `packages/domain/src/files/record-types.ts`;
  - `packages/domain/test/files/record-types.test.ts`.
- Modify:
  - `packages/db/prisma/schema/{organization,files}.prisma` (back-relations);
  - `packages/contracts/src/files/attachments.ts`;
  - `packages/domain/src/files/{attachment-row,uploads,purge}.ts`;
  - `packages/domain/src/files/README.md`;
  - `apps/web/src/i18n/messages/en-IN/errors.json` (`CONTENT_TYPE_NOT_ALLOWED`: "This file can't go here. Choose
    another.").

**Interfaces:**

- **Models**, columns snake_case through `@map`. Each has `organizationId` (the README's line), `id` (UUID v7),
  `@@unique([organizationId, id])`, and a Restrict/Restrict `organization` relation.
  - **`ImportBatch`:**
    - `kind`, `status` (default `"uploading"`);
    - `fileAttachmentId?`, `fileName`, `fileKind`, `fileSha256? Bytes`, `sheetName?`, `sheetCount?`;
    - `unreadableReason?`, `failureReason?`;
    - `rowsTotal`, `rowsToAdd`, `rowsDone`, `rowsAdded`, `rowsNewStage` (ints, default 0; D4);
    - `defaultStage` (default `"new"`), `defaultOwnerUserId?`, `budgetBasis?`, `defaultRoleKey?`;
    - `addBlocked`, `addAlreadyImported`, `stopRequested` (booleans, default false);
    - `reportAttachmentId?`;
    - `startedBy @db.Uuid`, `impersonatedBy?`;
    - `createdAt`, `checkedAt?`, `addRequestedAt?`, `finishedAt?`, `keepUntil`.
  - **`ImportColumn`:** `batchId`, `position`, `header`, `samples String[]`, `distinctValues String[]?`,
    `distinctCounts Int[]?`, `field?`.
  - **`ImportValueMatch`:** `batchId`, `field`, `value`, `rows Int?`, `target?`, `matchedBy`.
  - **`ImportRow`:**
    - `batchId`, `rowNumber`, `plan`, `reasons String[]`, `noted`, `newDestination?`;
    - `outcome?`, `leadId?`, `personId?`, `memberId?`;
    - `fingerprint? Bytes`, `passwordHash?`;
    - `exampleName?`, `exampleValue?`.
  - **`ImportHeaderMatch`:** `kind`, `headerKey`, `field`, `updatedAt`.
  - **`DataExport`:**
    - `kind`, `format`, `status` (default `"making"`), `filter Json`, `failureReason?`;
    - `rowsTotal`, `rowsDone`, `fileAttachmentId?`;
    - `requestedBy`, `impersonatedBy?`;
    - `createdAt`, `readyAt?`, `expiresAt?`.
- **Keys**, composite with `organization_id`, Restrict/Restrict:
  - column, value match and row → `import_batch`;
  - `import_batch.file_attachment_id`, `report_attachment_id` and `data_export.file_attachment_id` → `attachment`.
- **Indexes, by exact name** (predicates as Postgres prints them, R1):
  - `import_batch_one_adding`: unique `(organization_id)` where `(status = 'adding'::text)`;
  - `import_batch_recent (organization_id, kind, id DESC)`;
  - `import_batch_file (organization_id, file_sha256)`;
  - `import_batch_due (keep_until)` where `(status <> 'expired'::text)`;
  - `import_column_position` unique `(organization_id, batch_id, position)`;
  - `import_value_match_value` unique `(organization_id, batch_id, field, value)`;
  - `import_row_number` unique `(organization_id, batch_id, row_number)`;
  - `import_row_by_plan (organization_id, batch_id, plan)`;
  - `import_row_fingerprint (organization_id, fingerprint)` where `(fingerprint IS NOT NULL)`;
  - `import_row_person (organization_id, person_id)`;
  - `import_header_match_key` unique `(organization_id, kind, header_key)`;
  - `data_export_by_requester (organization_id, requested_by, id DESC)`;
  - `data_export_due (expires_at)` where `(status <> 'expired'::text)`.
- **Contracts** (`@travel-crm/contracts/files`):
  - `spreadsheetContentTypes = ["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]`;
  - `type SpreadsheetContentType`;
  - `MAX_IMPORT_BYTES = 10 * 1024 * 1024`;
  - `requestUploadInput.contentType` becomes `z.enum([...attachmentContentTypes, ...spreadsheetContentTypes])`.
- **Files module:**
  - `allowedContentTypes(recordType): readonly string[]`: the two spreadsheet types for `import_batch`, the
    attachment types for anything else;
  - `requestUpload` refuses any other with `VALIDATION`/`CONTENT_TYPE_NOT_ALLOWED`;
  - `SYSTEM_OWNED_RECORD_TYPES` gains `import_report` and `data_export`;
  - `isShortLivedRecordType(t)` is true for `import_batch`, `import_report` and `data_export`;
  - `deleteRecordFiles` refuses a system-owned type unless it is short-lived.

- [ ] **Step 1: Write the failing tests.**
  - Isolation fixtures:
    - `imports.ts` makes a batch, a column, a value match, a row and a header match;
    - `exports.ts` makes an export;
    - `import_batch`, `import_column`, `import_header_match` and `data_export` are `undeletable: true`.

```ts
// packages/db/test/bulk-tables.test.ts (inserts as app_runtime in forOrg; CHECKs matched by their names)
it("holds kinds, statuses, file kinds, reasons, stages, fields, plans, outcomes and formats to their lists", …)
it("lets one import of an organization be adding at a time", …) // a second rejects /import_batch_one_adding/
it("keeps three samples and fifty listed values a column, each value with its count", …) // import_column_samples, import_column_values
it("keeps a fingerprint only on an added or merged row, and a password hash only before an outcome", …)
it("purges an organization with imports, their rows, a report and an export", …) // deleteOrganizationRows resolves
// packages/domain/test/files/record-types.test.ts
it("takes only CSV and .xlsx for an import's file, and refuses both types elsewhere: CONTENT_TYPE_NOT_ALLOWED", …)
it("refuses an upload under an import report or an export: SYSTEM_OWNED_FILE", …)
it("lets the platform delete an import report's or an export's files, still refusing an issued document's", …)
```

- [ ] **Step 2: Run them to see them fail.**
  - Run `pnpm --filter @travel-crm/db test -- bulk-tables isolation` and
    `pnpm --filter @travel-crm/domain test -- files/record-types`.
  - Expected: FAIL.
- [ ] **Step 3: Write the schema and the migration** by the README's recipe (`prisma migrate diff … --output`).
  - Then append to `migration.sql`, the CHECKs first, named `<table>_<rule>`:
    - the value lists: `kind_value`, `status_value`, `file_kind_value`, `unreadable_reason_value`,
      `failure_reason_value`, `default_stage_value` (open stages, `won`, `lost`), `budget_basis_value`,
      `import_column_field_value` (the 25 fields of both kinds, 0.3), `import_value_match_field_value`,
      `matched_by_value`, `plan_value`, `outcome_value`, `format_value`;
    - `import_batch_unreadable_pair`: a reason exactly when `unreadable`;
    - `import_batch_counts`: every count at least 0;
    - `import_column_samples`: at most 3;
    - `import_column_values`: at most 50, with as many counts;
    - `import_row_fingerprint_added`;
    - `import_row_password_before_outcome`;
    - text lengths: a header at most 200, examples at most 120.
  - Then the grants and row-level security:
    - `REVOKE DELETE ON TABLE import_batch, import_column, import_header_match, data_export FROM app_runtime;`;
    - `SELECT app_enable_org_rls('<table>');` for each of the six tables.
  - Run `pnpm --filter @travel-crm/db generate`.
- [ ] **Step 4: Run the db and files tests.**
  - Run `pnpm --filter @travel-crm/db test` and `pnpm --filter @travel-crm/domain test -- files`.
  - Expected: PASS, including the isolation, organization-keys, schema and drift checks.
- [ ] **Step 5: Commit.** Message: `feat(db): import and export tables, and files only imports and exports take`.

### Task 0.3: The shared contracts

**Files:**

- Create:
  - `packages/contracts/src/imports/{index,import-batch,import-columns,import-rows,events}.ts`;
  - `packages/contracts/src/exports/{index,data-export}.ts`;
  - `packages/contracts/src/crm/{lead-import,lead-export,file-words}.ts`;
  - `packages/contracts/src/identity/{staff-import,staff-export}.ts`.
- Modify:
  - `packages/contracts/src/crm/index.ts` and `identity/index.ts` (their new files);
  - `packages/contracts/src/kernel/phone.ts` (`internationalPhone`).
- Test:
  - `packages/contracts/test/imports/import-inputs.test.ts`;
  - `packages/contracts/test/crm/file-words.test.ts`;
  - `packages/contracts/test/kernel/international-phone.test.ts`;
  - `apps/web/test/leads/file-words.test.ts`.

**Interfaces** (inputs `z.strictObject`, outputs `z.object`, `datetime` is `z.iso.datetime()`):

- **`imports`:**
  - **Kinds, statuses and limits:**
    - `importKinds = ["leads", "staff"]`, `importKind`;
    - `importStatuses` (spec 5's twelve), `importStatus`;
    - `waitingImportStatuses = ["uploading", "reading", "matching", "checking", "checked"]`;
    - `importRowLimits = { leads: 10_000, staff: 500 }`, `MAX_IMPORT_COLUMNS = 50`, `MAX_CELL_LENGTH = 4000`,
      `MAX_LISTED_VALUES = 50`.
  - **Reasons:**
    - `unreadableReasons` (the adapter's eight; a domain test in 0.6 holds them equal);
    - `importFailureReasons = ["no_longer_a_member", "lost_permission", "organization_cannot_change",
      "file_withdrawn", "row_changed", "over_seat_limit"]`.
  - **Fields** (D29):
    - `importField`, the union of `leadImportFields` and `staffImportFields`;
    - `valueFields = ["owner", "stage", "role"]`;
    - `valueMatchedBy = ["name", "username", "email", "first_name", "word", "chosen", "none"]`.
  - **Rows:**
    - `rowPlans = ["new", "returning", "enquiry", "blocked", "already_imported", "not_added"]`;
    - `rowOutcomes = ["added", "merged", "left_out", "not_added"]`;
    - `rowReasonCodes`:
      - for leads: `no_name`, `no_contact`, `not_a_lead`, `notes_too_long`, `same_as_row`, `blocked`,
        `already_imported`, `not_reached`;
      - for staff: `invalid_name`, `no_sign_in_name`, `invalid_username`, `invalid_email`, `invalid_phone`,
        `same_username_as_row`, `same_email_as_row`, `email_elsewhere`, `role_unmatched`, `owner_role`,
        `role_above_yours`, `already_on_staff`, `taken_meanwhile`;
    - `rowReason = { code, field?: importField, row?: int, on?: calendarDate }`.
  - **Inputs:**
    - `startImportInput = { fileName: attachmentFileName, contentType: z.enum(spreadsheetContentTypes),
      sizeBytes: 1..MAX_IMPORT_BYTES }`;
    - `importIdInput = { importId: recordId }`;
    - `importRowsInput = { importId, plan: rowPlan, reason?: rowReasonCode, after?: int, limit: 1..500 default 5 }`.
  - **Outputs:**
    - `startedImport = { importId, attachmentId, upload: presignedUpload }`;
    - `importColumn = { position, header, samples: string[], values: { value, rows }[] | null, field: importField |
      null, guessedBy: "last-time" | "common-name" | null }`;
    - `valueMatch = { field, value, target | null, matchedBy }`;
    - `importDetail`:
      - `{ id, kind, status, fileName, fileKind, sheet: { name, count } | null }`;
      - `{ unreadableReason | null, failureReason | null }`;
      - `sameFile: { importedAt: datetime, rowsAdded } | null` (B6);
      - `columns`, `valueMatches`;
      - `defaults: { stage, ownerUserId | null, budgetBasis | null, roleKey | null }`;
      - `choices: { addBlocked, addAlreadyImported }`;
      - `counts: { byPlan: Record<rowPlan, int>, returning, noted, newStage, notAdded: { reason: rowReasonCode, rows
        }[], newDestinations: string[], outcomes: Record<rowOutcome, int> } | null`;
      - `progress: { rowsTotal, rowsToAdd, rowsDone, rowsAdded, addRequestedAt | null }`;
      - `{ createdAt, checkedAt | null, finishedAt | null, keepUntil, report: { fileName, sizeBytes } | null }`;
    - `importRow = { rowNumber, name | null, value | null, reasons: rowReason[], outcome | null }`;
    - `importRowsPage = { items, nextCursor: int | null }`;
    - `recentImport = { id, fileName, createdAt, status, rowsTotal, rowsAdded }`.
  - **Events:** `importUploadedEvent = { importId }`, `importStepEvent = { importId, kind }`.
- **`exports`:**
  - `exportKinds = ["leads", "staff"]`, `exportFormats = ["xlsx", "csv"]`, `exportFormat`;
  - `exportStatuses = ["making", "ready", "failed", "expired"]`;
  - `exportFailureReasons = ["no_longer_a_member", "lost_permission", "too_many_rows"]`;
  - `exportIdInput = { exportId }`, `startedExport = { exportId }`;
  - `exportDetail = { id, kind, format, status, failureReason | null, rowsTotal, rowsDone, file: { fileName,
    sizeBytes } | null, createdAt, readyAt | null, expiresAt | null }`;
  - `startStaffExportInput = { format }`;
  - `exportRequestedEvent = { exportId, kind }`.
- **`crm/lead-import.ts`** (lead import may add to it later):
  - `leadImportFields = ["name", "phone", "email", "instagram", "destination", "travel_from", "travel_to",
    "travel_month", "adults", "children_ages", "children_count", "budget", "budget_basis", "departure_city",
    "trip_type", "hotel_category", "food", "room_type", "stage", "owner", "enquiry_date", "their_source", "note"]`;
  - `leadImportStages`, the open stages plus `won` and `lost`;
  - `matchLeadColumnsInput = { importId, columns: { position: 0..49, field: leadImportField | null }[] (≤50),
    values: ({ field: "owner", value (≤4000), target: recordId | null } | { field: "stage", value, target: leadStage |
    null })[] (≤5000, a discriminated union on `field`), defaults: { stage: leadImportStage, ownerUserId: recordId |
    null, budgetBasis: budgetBasis | null } }`;
  - `decideLeadImportInput = { importId, addBlocked, addAlreadyImported }`.
- **`crm/lead-export.ts`:** `leadExportHeaders`, B38's 26 headers in order ("Name" … "Lead link").
- **`crm/file-words.ts`:** `leadFileWords`, one entry per field (stage, tripType, hotelCategory, food, budgetBasis,
  source). Each maps a value's key to `[shown, ...alsoRead]`:
  - stage: B11's common words (Booked, Confirmed, Converted → won; …);
  - hotel: `"4★", "4 star", "4-star", "4 stars"`;
  - food: `"Vegetarian", "veg"`, `"Non-vegetarian", "non veg", "non-veg", "nonveg"`;
  - basis: `"per person", "pp", "per head"`, `"for everyone", "total"`;
  - also `wordOf(field, key): string` and `keyOfWord(field, text): string | null` (case and spaces ignored).
- **`identity/staff-import.ts`** (staff may add to it later):
  - `staffImportFields = ["name", "username", "email", "phone", "role"]`;
  - `matchStaffColumnsInput = { importId, columns: { position, field: staffImportField | null }[], values: { field:
    "role", value, target: roleKey | null }[] (≤2500), defaults: { roleKey: roleKey | null } }`.
- **`identity/staff-export.ts`:** `staffExportHeaders`, B52's 8 headers.
- **`kernel/phone.ts`:** `internationalPhone(e164: string): string` (`+91 98765 43210`).

- [ ] **Step 1: Write the failing tests.**

```ts
it("takes an import's file as CSV or .xlsx, at most 10 MB, with a file name storage can keep", …)
it("refuses unknown keys in every import and export input", …)
it("lists a lead import's 23 fields and a staff import's 5, and their union of 25", …)
it("takes an owner value's target as a user id and a stage value's as a stage, and nothing else", …) // the discriminated union
it("reads every word a file holds back to its key, and B11's stage words: Booked as won, Junk as not_a_lead", …)
it("writes +919876543210 as +91 98765 43210, and a foreign number in its own form", …)
// apps/web/test/leads/file-words.test.ts
it("holds the words a file holds equal to the screen's", …) // leadFileWords' shown words === leads.json's
```

- [ ] **Step 2: Run them to see them fail.**
  - Run `pnpm --filter @travel-crm/contracts test` and `pnpm --filter @travel-crm/web test -- file-words`.
  - Expected: FAIL.
- [ ] **Step 3: Write the contracts.**
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(contracts): imports, exports, and the lead and staff fields a file holds`.

### Task 0.4: An import's steps: start, upload, cancel, stop and Add

**Files:**

- Create:
  - `packages/domain/src/imports/{index,README.md,dependencies,batch-row,batches,import-steps,import-detail,row-reasons,importer-access}.ts`;
  - `packages/domain/test/imports/{batches,import-steps}.test.ts`;
  - `packages/domain/test/imports/support/batches.ts` (`aBatch(tx, overrides)`, `aRow(tx, overrides)`, direct
    inserts for other tests' setup).
- Modify:
  - `apps/web/src/i18n/messages/en-IN/errors.json`:
    - `IMPORT_NOT_READY`: "This import has moved on. Reload to see where it is.";
    - `IMPORT_ALREADY_RUNNING` (D35);
  - `audit.json`: `actions.import.started`, `actions.import.cancelled`, `recordTypes.import_batch`.

**Interfaces** (`access: MemberAccess`; `kind: ImportKind`):

```ts
/** What every import listener is built from (dependencies.ts); 0.6 adds "matchLeadWorkers" | "matchRoles" once 0.5 made them. */
export type ImportIdentity = Pick<Identity, "resolveAccess" | "firstOwner" | "leadWorkers" | "staff">;
export interface ImportJobDependencies {
  files: Files;
  spreadsheets: Spreadsheets;
  identity: ImportIdentity;
  subscriptions: Pick<SubscriptionAccess, "entitlementsOf">;
  seatLimit: SeatLimit;
}
export interface ImportBatchRow { /* every import_batch column, typed */ }
export function startImport(db: Database, files: Files, access, kind, input: StartImportInput, now: Date): Promise<{ importId: string; attachmentId: string; upload: PresignedUpload }>
export function confirmImportUpload(db: Database, files: Files, access, kind, importId: string, now: Date): Promise<void>
export function findImport(tx: OrgTx, access, kind, importId: string): Promise<ImportBatchRow>
export function importDetail(tx: OrgTx, access, kind, importId: string): Promise<ImportDetail>
export function recentImports(tx: OrgTx, access, kind): Promise<RecentImport[]>
export function requestImportAdd(db: Database, access, kind, importId: string, now: Date): Promise<void>
export function stopImport(tx: OrgTx, access, kind, importId: string): Promise<void>
export function cancelImport(tx: OrgTx, access, kind, importId: string, now: Date): Promise<void>
export function decideLeadImport(tx: OrgTx, access, input: DecideLeadImportInput): Promise<void>
/** B31: the starter's access afresh as the job's actor (source "job", the batch's impersonatedBy), or why not. */
export function importerAccess(dependencies: Pick<ImportJobDependencies, "identity" | "subscriptions">, batch: ImportBatchRow, required: readonly Permission[]): Promise<{ access: MemberAccess } | { failure: ImportFailureReason }>
export function encodeRowReason(reason: RowReason): string
export function decodeRowReason(text: string): RowReason
```

- How the steps behave:
  - `startImport`:
    - writes the batch (`uploading`, `started_by`, `impersonated_by`, `keep_until` now + 7 days);
    - asks `files.requestUpload` for record type `import_batch`;
    - sets `file_attachment_id`;
    - a refused upload leaves the batch `cancelled`.
  - `confirmImportUpload`: `uploading` → `reading`, after `files.confirmUpload`, publishing `import.uploaded`. Asked
    again in `reading`, it does nothing.
  - `requestImportAdd`: `checked` → `adding`.
    - It sets `add_requested_at`, resets `rows_done`, records `import.started` (`{ kind, rowsToAdd }`) and publishes
      `import.add-requested`.
    - `import_batch_one_adding` is mapped to `CONFLICT`/`IMPORT_ALREADY_RUNNING` outside the transaction.
  - `stopImport`: in `adding`, it sets `stop_requested`; a repeat changes nothing.
  - `cancelImport`: from a waiting status → `cancelled`, recording `import.cancelled`.
  - Every status change moves `keep_until` (D5). A step asked out of turn is `CONFLICT`/`IMPORT_NOT_READY`.
  - An import of another kind, organization or starter is `NOT_FOUND`/`NOT_FOUND` (D6).

- [ ] **Step 1: Write the failing tests.**

```ts
it("starts an import with a presigned upload for its file, and reads it once the upload is confirmed", …) // import.uploaded published once, even confirmed twice
it("answers NOT_FOUND for another person's import, another kind's, or another organization's", …)
it("answers IMPORT_NOT_READY to a second Add, queues one add and records one import.started", …)
it("answers IMPORT_ALREADY_RUNNING while another import of the agency is adding", …)
it("changes nothing on a second Stop, and refuses Cancel while adding", …)
it("cancels a waiting import and records import.cancelled with no file name", …)
it("keeps each import 7 days from its last change", …)
it("lists the person's last ten imports of the kind, newest first", …)
it("fails the job's access for a removed member, a lost permission, or an agency that can't make changes", …) // importerAccess
it("acts in the job as the importer, source job, keeping who impersonated them", …)
```

- [ ] **Step 2: Run them to see them fail.** Run `pnpm --filter @travel-crm/domain test -- imports`. Expected: FAIL.
- [ ] **Step 3: Implement.** The module's README says what it owns and its public functions.
- [ ] **Step 4: Run the gate's first line.** Expected: PASS, including the web's reasons and actions tests.
- [ ] **Step 5: Commit.** Message: `feat(imports): an import's steps: upload, cancel, stop and Add`.

### Task 0.5: identity matches a file's owners and roles

**Files:**

- Create `packages/domain/src/identity/import-matches.ts`.
- Modify `packages/domain/src/identity/{identity,index}.ts`.
- Test `packages/domain/test/identity/import-matches.test.ts`.

**Interfaces:**

```ts
export interface LeadWorkerMatch { userId: string; matchedBy: "name" | "username" | "email" | "first_name" }
export interface RoleMatch { roleKey: string; matchedBy: "name" | "word" }
export function matchLeadWorkers(database: IdentityDatabase, organizationId: string, values: readonly string[]): Promise<Map<string, LeadWorkerMatch>>
export function matchRoles(database: IdentityDatabase, organizationId: string, values: readonly string[]): Promise<Map<string, RoleMatch>>
// on Identity: matchLeadWorkers(organizationId, values) and matchRoles(organizationId, values)
```

- A value is compared lower-cased with its spaces collapsed.
- A value that matches nothing is absent from the map.
- Lead workers are R14's: active, not banned, on a role that sees leads.

- [ ] **Step 1: Write the failing tests.**

```ts
it("matches an owner value by full name, username or email, ignoring case and spaces", …) // "asha  SHARMA", "Asha", "ASHA@SHARMA.IN"
it("matches a first name alone only when one lead worker has it", …) // two Ravis: no match for "Ravi"
it("never matches someone removed, banned or who can't work leads", …)
it("matches a role by its name or its key, the Owner's included", …) // "Sales" by name, "org-admin" by word
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement**, reading members, users and roles once per call.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(identity): match a file's owner and role words to staff and roles`.

### Task 0.6: Reading a file: columns, guesses, header memory and value suggestions

**Files:**

- Create `packages/domain/src/imports/{read-file,read-listener,columns,header-memory,guesses,value-matches}.ts`.
- Modify `packages/domain/src/imports/dependencies.ts`: `ImportIdentity` gains `"matchLeadWorkers" | "matchRoles"`.
- Test `packages/domain/test/imports/{read-file,guesses,value-matches}.test.ts`.

**Interfaces:**

```ts
/** A column's position and its listed values (at most 50), for the suggestions. */
export interface ImportColumnValues { position: number; values: readonly string[] }
export function readImportFileListener(dependencies: ImportJobDependencies): EventListener // "imports.read-file" on "import.uploaded"
/** The import's file as its kind's limits read it: the check's and the add's one reader (B1). */
export function readImportFile(dependencies: Pick<ImportJobDependencies, "files" | "spreadsheets">, batch: ImportBatchRow): Promise<ReadSheet>
export function headerKey(header: string): string
export function guessFields(kind: ImportKind, headers: readonly string[], remembered: ReadonlyMap<string, ImportField | null>): { field: ImportField | null; guessedBy: "last-time" | "common-name" | null }[]
export function suggestValueMatches(tx: OrgTx, identity: ImportIdentity, batch: ImportBatchRow, columns: readonly ImportColumnValues[]): Promise<void>
export function valueTargetsFor(context: ListenerContext, identity: ImportIdentity, batch: ImportBatchRow, field: ValueField, values: readonly string[]): Promise<Map<string, string | null>>
```

- **The listener** acts only on a `reading` batch. It:
  1. reads the file outside a transaction (`files.systemFile`, then `spreadsheets.read` with `importRowLimits[kind]`,
     50 columns and 4,000 characters);
  2. keeps its SHA-256, sheet name and sheet count;
  3. writes, in one transaction:
     - the columns: their samples (the first three non-empty values), and for at most 50 different values those
       values and their counts;
     - the guesses;
     - the value suggestions;
     - `rows_total`;
  4. moves the batch to `matching`, or to `unreadable` with the adapter's reason.
- **Guesses** (B9, D14):
  1. first the agency's last confirmed field for the same header key and kind;
  2. then the common names;
  3. then each field's own label, and every header of `leadExportHeaders` or `staffExportHeaders`;
  4. else nothing.
  - "Why it wasn't added" and "Row" are always unmatched. Returning, Next follow-up, Next follow-up note, Lead link and
    Source detail are guessed "Don't import".
  - A field already guessed for an earlier column isn't guessed again, Note excepted.
- **Suggestions** (B11, D13):
  - owner through `matchLeadWorkers`;
  - stage through `keyOfWord("stage", …)`;
  - role through `matchRoles`;
  - an unmatched value is stored with target null and `matchedBy: "none"`.

- [ ] **Step 1: Write the failing tests.**

```ts
it("reads a CSV's columns: their names, three samples, and up to fifty values with their counts", …)
it("guesses Mobile No as Phone, Assigned To as Owner, Lead Status as Stage and Remarks as Note", …)
it("guesses a header the agency matched last time 'As last time', before the common names", …)
it("never guesses our report's 'Why it wasn't added' and 'Row', and guesses an export's own headers back", …) // Added on → enquiry_date; Lead link → null
it("suggests owners, stages and roles for every value of a short column", …) // "Asha" → Asha's user id by name; "Booked" → won by word
it("ends an unreadable file as unreadable with its reason, and a good one as matching", …)
it("says the agency imported the same file before, and how many rows that added", …) // sameFile from file_sha256
it("does nothing for an import no longer reading", …)
it("holds the contract's unreadable reasons equal to the adapter's", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(imports): read an import's file: its columns, guesses and value matches`.

### Task 0.7: Matching the columns

**Files:**

- Create `packages/domain/src/imports/column-matches.ts`.
- Modify `apps/web/src/i18n/messages/en-IN/errors.json`:
  - `IMPORT_NEEDS_NAME_AND_CONTACT`: "Match a column to Name, and one to a phone, email or Instagram.";
  - `IMPORT_NEEDS_SIGN_IN_NAME_AND_ROLE`: "Match Name, a Username or Email column, and give a role.";
  - `FIELD_MATCHED_TWICE` (D34).
- Test `packages/domain/test/imports/column-matches.test.ts`.

**Interfaces:**

```ts
export interface ColumnMatchInput {
  importId: string;
  columns: readonly { position: number; field: ImportField | null }[];
  values: readonly { field: ValueField; value: string; target: string | null }[];
  defaults: { stage?: LeadImportStage; ownerUserId?: string | null; budgetBasis?: BudgetBasis | null; roleKey?: string | null };
}
export function matchImportColumns(tx: OrgTx, access, kind, input: ColumnMatchInput, context: { owners: ReadonlySet<string>; roleKeys: ReadonlySet<string>; now: Date }): Promise<void>
export interface ColumnMatches { fieldOf: ReadonlyMap<number, ImportField>; positionsOf(field: ImportField): readonly number[] }
export function columnMatchesOf(tx: OrgTx, importId: string): Promise<ColumnMatches>
```

- It is allowed from `matching` or `checked`.
- A field or stage the kind doesn't have can't arrive: each router parses its kind's own schema (0.3).
- It refuses:
  - two columns for one field, Note excepted: `FIELD_MATCHED_TWICE`;
  - leads without Name and one of Phone, Email or Instagram: `IMPORT_NEEDS_NAME_AND_CONTACT`;
  - staff without Name, one of Username or Email, and a Role column or a `roleKey`:
    `IMPORT_NEEDS_SIGN_IN_NAME_AND_ROLE`;
  - an owner target or default outside `owners`: `NOT_A_LEAD_WORKER`;
  - a role target or default outside `roleKeys`: `ROLE_NOT_FOUND`.
- Then it:
  - saves each column's field and the defaults;
  - stores each changed value as `matchedBy: "chosen"`, and sets `rows` from the matched column's counts;
  - remembers every matched header's key (B10; upsert on `import_header_match_key`);
  - empties the earlier rows and value matches of a longer column;
  - moves to `checking` and publishes `import.columns-matched` (`{ importId, kind }`).

- [ ] **Step 1: Write the failing tests.**

```ts
it("needs Name and a phone, email or Instagram for leads: IMPORT_NEEDS_NAME_AND_CONTACT", …)
it("needs Name, a username or email, and a role for staff: IMPORT_NEEDS_SIGN_IN_NAME_AND_ROLE", …)
it("lets several columns go to Note and one to any other field: FIELD_MATCHED_TWICE", …)
it("refuses an owner who can't work leads and a role the agency doesn't have", …)
it("remembers the matched headers, so next month's file is matched 'As last time'", …)
it("saves the importer's value choices and the file's defaults, and starts the check", …) // import.columns-matched published
it("matches again from the preview, emptying the last check's rows", …)
it("stores every field of both kinds' lists", …) // the CHECK accepts all 25
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gate's first line.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(imports): match an import's columns and values, and remember them`.

### Task 0.8: Rows, fingerprints, the report, and an import's end

**Files:**

- Create `packages/domain/src/imports/{import-rows,fingerprints,report,report-words,finish,report-link}.ts`.
- Modify:
  - `audit.json`: `actions.import.finished`, `actions.import.report-downloaded`;
  - `notifications.json`: `preferences.kinds.importFinished`;
  - `apps/web/src/notifications/preferences/kinds.ts` (`import.finished`).
- Test `packages/domain/test/imports/{import-rows,fingerprints,report,finish}.test.ts`.

**Interfaces:**

```ts
export interface ImportRowPlan { rowNumber: number; plan: RowPlan; reasons: readonly RowReason[]; noted: boolean; newDestination: string | null; exampleName: string | null; exampleValue: string | null }
export function replaceImportRows(context: ListenerContext, importId: string, rows: readonly ImportRowPlan[]): Promise<void> // 1,000 a transaction, moving rows_done
export function markImportChecked(tx: OrgTx, importId: string, summary: { rowsTotal: number; rowsToAdd: number; rowsNewStage: number }, now: Date): Promise<void>
export function importRowsPage(tx: OrgTx, access, kind, input: ImportRowsInput): Promise<ImportRowsPage>
export function holdImport(tx: OrgTx, importId: string): Promise<ImportBatchRow | null> // FOR UPDATE
export function rowsToAdd(tx: OrgTx, importId: string, limit: number): Promise<{ rowNumber: number; plan: RowPlan }[]>
export interface RowOutcomeRecord { rowNumber: number; outcome: RowOutcome; reasons?: readonly RowReason[]; leadId?: string; personId?: string; memberId?: string; fingerprint?: Uint8Array }
export function recordRowOutcomes(tx: OrgTx, importId: string, outcomes: readonly RowOutcomeRecord[]): Promise<void> // moves rows_done, rows_added
export function rowFingerprint(kind: ImportKind, values: readonly (string | null)[]): Uint8Array
export function earlierFingerprintsQuery(kind: ImportKind, fingerprints: readonly Uint8Array[], exceptImportId: string): Sql
export function earlierFingerprints(tx: OrgTx, kind: ImportKind, fingerprints: readonly Uint8Array[], exceptImportId: string): Promise<Map<string, Date>> // by hex, when it was added
export interface ImportEnd { status: "done" | "stopped" | "failed"; failureReason?: ImportFailureReason; sourceEventId: string; notifyImporter: boolean; report: boolean }
export function finishImport(context: ListenerContext, dependencies: Pick<ImportJobDependencies, "files" | "spreadsheets">, importId: string, end: ImportEnd, alsoInTransaction?: (tx: OrgTx, batch: ImportBatchRow) => Promise<void>): Promise<void>
export function importReportLink(db: Database, files: Files, access, kind, importId: string): Promise<DownloadLink>
```

- `rowsToAdd` returns the rows with no outcome whose plan is `new`, `returning`, `enquiry`, `blocked` or
  `already_imported`, by row number.
- **`finishImport`** acts only on an `adding` batch.
  1. It gives every remaining row an outcome:
     - rows with no outcome and a plan to add get `not_added` with `not_reached`;
     - un-ticked `blocked` and `already_imported` rows get `left_out`.
  2. With `report`, it writes the report (B34) and stores it with `storeGeneratedFile`:
     - record type `import_report`, the import's id as both the record and the attachment id;
     - the uploaded format, two first columns "Why it wasn't added" and "Row", then the original columns in their
       order with their values as read.
  3. In one transaction:
     - it sets the status, `report_attachment_id`, `finished_at` and `keep_until`;
     - it records `import.finished` (`{ kind, status, failureReason, outcomes }`);
     - it publishes `import.finished`;
     - with `notifyImporter`, it notifies the importer (D20; kind `import.finished`, link `/leads/import/<id>`),
       for example:
       - title "Your import is done";
       - body "1,094 new leads, 63 repeat enquiries. 129 rows weren't added.";
       - or the stopped and failed words;
     - it runs `alsoInTransaction`.
- `report-words.ts` holds the report's English sentences ("No phone, email or Instagram", "Same as row 12",
  "Already imported on 12 Oct", "Stopped before this row"), with days in the agency's zone.
- `importReportLink` is a 5-minute link that records `import.report-downloaded`. It answers `EXPORT_NOT_READY` before
  the report exists and `EXPORT_EXPIRED` once swept.

- [ ] **Step 1: Write the failing tests.**

```ts
it("writes 10,000 row plans 1,000 to a transaction, moving the progress", …)
it("counts the rows by plan and by first reason with one GROUP BY", …)
it("gives the next rows to add in row order, skipping rows with an outcome", …)
it("finds a fingerprint another import of the agency added, with its day, and none of this import's own", …)
it("makes the report in the uploaded format: Why it wasn't added, Row, then the file's columns as they were", …) // name "enquiries-oct-2026 - rows not added.xlsx"
it("ends an import once, with import.finished, the counts and one notice to the importer", …) // a second call changes nothing
it("marks rows never reached 'Stopped before this row' and un-ticked blocked rows left out", …)
it("downloads the report through a 5-minute link, recording import.report-downloaded", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gate's first line.** Expected: PASS, including the notification kinds test.
- [ ] **Step 5: Commit.** Message: `feat(imports): an import's rows, fingerprints, report and end`.

### Task 0.9: Exports: the request, the runner and the download

**Files:**

- Create:
  - `packages/domain/src/exports/{index,README.md,export-row,export-requests,export-download,export-runner,dependencies}.ts`;
  - the stub `packages/domain/src/exports/staff-export.ts`.
- Modify:
  - `audit.json`: `actions.export.made`, `actions.export.downloaded`, `recordTypes.data_export`;
  - `notifications.json`: `preferences.kinds.exportReady`;
  - `kinds.ts` (`export.ready`).
- Test `packages/domain/test/exports/{export-requests,export-runner}.test.ts`.

**Interfaces:**

```ts
export type ExportIdentity = Pick<Identity, "resolveAccess" | "memberContacts" | "staff">;
export interface ExportJobDependencies { files: Files; spreadsheets: Spreadsheets; identity: ExportIdentity; appUrl: string }
export function startExport(tx: OrgTx, access, kind: ExportKind, request: { format: ExportFormat; filter: JsonValue }, now: Date): Promise<{ exportId: string }>
export function exportDetail(tx: OrgTx, access, kind: ExportKind, exportId: string): Promise<ExportDetail & { filter: unknown }>
export function exportDownloadLink(db: Database, files: Files, access, kind: ExportKind, exportId: string, now: Date): Promise<DownloadLink>
export interface ExportSource<Filter> {
  kind: ExportKind;
  /** The permission the requester must still hold when the job starts (B41). */
  requires: Permission;
  sheetName: string;
  columns: readonly WriterColumn[];
  fileName(stamp: { day: CalendarDate; time: TimeOfDay }, format: ExportFormat): string;
  filterOf(stored: unknown): Filter;
  maxRows: number | null;
  count(context: Pick<ListenerContext, "forOrg">, access: MemberAccess, filter: Filter): Promise<number>;
  /** A page of rows after the cursor, in its own transaction(s); next is null after the last page. */
  page(context: Pick<ListenerContext, "forOrg">, access: MemberAccess, filter: Filter, after: string | null): Promise<{ rows: WrittenCell[][]; next: string | null }>;
  /** export.made's view of the filter: ids and fixed values, `searched: true` for a search, never its text. */
  auditFilter(filter: Filter): JsonValue;
  /** The filter kept once the file is made: the search emptied. */
  keptFilter(filter: Filter): JsonValue;
}
export function runExport<Filter>(event: DomainEvent<ExportRequestedEvent>, context: ListenerContext, dependencies: ExportJobDependencies, source: ExportSource<Filter>): Promise<void>
export function makeStaffExportListener(dependencies: ExportJobDependencies): EventListener // stub: throws "Not built yet: bulk plan, Task 3.5"
```

- `startExport` writes a `making` export and publishes `export.requested`.
- An export of another kind, organization or requester is `NOT_FOUND`.
- **`runExport`** acts only on a `making` export.
  1. It resolves the requester's access afresh (source `job`); a removed member or a lost `requires` fails the export.
  2. It counts; past `maxRows` it fails with `too_many_rows`.
  3. It writes page by page, moving `rows_done`.
  4. It stores the file with `storeGeneratedFile`: record type `data_export`, the export's id as the record and the
     attachment id.
  5. In one transaction:
     - it marks the export `ready`, with `ready_at` and `expires_at = ready_at + 24 h`;
     - it keeps `keptFilter`;
     - it records `export.made` (`{ kind, format, rows, filter: auditFilter }`);
     - it publishes `export.made`;
     - it notifies the requester (D20; kind `export.ready`, link `/leads/exports/<id>` or `/staff/exports/<id>`,
       "Your leads export is ready" or "Your staff export is ready").
  - A failure also empties the search.
- `exportDownloadLink`:
  - answers `EXPORT_NOT_READY` while making and `EXPORT_EXPIRED` when expired or past `expires_at`;
  - records `export.downloaded`;
  - gives a 5-minute link.

- [ ] **Step 1: Write the failing tests** (with a test source of three rows, and the memory spreadsheets).

```ts
it("makes an export for its requester only: another person's is NOT_FOUND", …)
it("counts, writes page by page and stores the file once under the export's id, even run twice", …)
it("fails an export whose requester lost the permission or left, and one past its row limit", …)
it("records export.made with the filter's ids and searched: true, never the search, and empties the search", …)
it("tells the requester the export is ready, linking its page", …)
it("downloads through a 5-minute link for 24 hours, recording export.downloaded; EXPORT_NOT_READY before, EXPORT_EXPIRED after", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gate's first line.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(exports): exports: the request, the runner and the download`.

### Task 0.10: Keeping and deleting: the sweep, erasure and purge

**Files:**

- Create:
  - `packages/domain/src/imports/{withdraw,sweep}.ts`;
  - `packages/domain/src/exports/{withdraw,sweep}.ts`;
  - `packages/domain/src/platform/bulk-files-sweep.ts`.
- Modify:
  - `packages/domain/src/platform/{erasure,failed-jobs,index}.ts`;
  - `packages/domain/src/platform/README.md`;
  - `apps/api/src/console-jobs.ts`;
  - `apps/web/src/console/jobs/platform-queues.ts`;
  - `apps/web/test/console/jobs/platform-queues.test.ts`;
  - `apps/api/test/console-jobs.test.ts`.
- Test:
  - `packages/domain/test/imports/withdraw-and-sweep.test.ts`;
  - `packages/domain/test/exports/withdraw-and-sweep.test.ts`;
  - extend `packages/domain/test/platform/erasure.test.ts`.

**Interfaces:**

```ts
export type ForgottenSubject = { personId: string } | { memberId: string };
export function withdrawImportFiles(tx: PlatformTx, organizationId: string, now: Date, forget: ForgottenSubject | null): Promise<{ imports: number; files: number }>
export function withdrawExportFiles(tx: PlatformTx, organizationId: string, now: Date): Promise<{ exports: number; files: number }>
export interface SweptOrganizations { swept: number; organizationIds: string[] }
export function sweepExpiredImports(tx: PlatformTx, now: Date, limit: number): Promise<SweptOrganizations>
export function sweepExpiredExports(tx: PlatformTx, now: Date, limit: number): Promise<SweptOrganizations>
export const SWEEP_BULK_FILES_QUEUE = "platform.sweep-bulk-files";
export function bulkFilesSweepSchedule(services: PlatformServices): ScheduledJob // hourly, "17 * * * *", Asia/Kolkata
```

- **A withdrawal** (B55, D7, D32), in the erasure's platform transaction:
  - It nulls the attachment ids, then `deleteRecordFiles` deletes every kept file of the organization: the
    `import_batch` and `import_report` files and the `data_export` files.
  - It empties every import's kept values:
    - `samples`, `distinct_values` and `distinct_counts`;
    - the value matches;
    - `example_name`, `example_value` and `password_hash`.
  - It marks every unfinished import and every `making` or `ready` export `expired`.
  - With `forget`, that person's rows (`person_id` or `member_id`) lose their `fingerprint`, `lead_id`, `person_id`
    and `member_id`.
- **The sweep** (B53, B54, D31) does the same, for at most `limit` imports past `keep_until` and exports past
  `expires_at`, and for any file still stored under an `expired` one. Then `deleteFilesAfterCommit` runs for each
  organization swept.
- **Erasure** (spec 9) calls both withdrawals, a customer's with `{ personId }` and a removed member's with
  `{ memberId }`, beside `expireOrganizationExports`. Their counts go in `subject.erased`'s platform log entry as
  `importsWithdrawn` and `exportsWithdrawn`.

- [ ] **Step 1: Write the failing tests.**

```ts
it("sweeps an import a week after its last change: its file and report deleted for good, its kept values emptied, its counts kept", …)
it("sweeps an export 24 hours after it was ready", …)
it("deletes a file stored late under an import or export already expired", …)
it("withdraws every import and export file of the organization in an erasure, and empties the person's rows' ids and fingerprints", …)
it("erases a customer and a removed member with an import and an export holding them", …) // erasure.test.ts
it("registers platform.sweep-bulk-files with the console's schedules", …) // console-jobs.test.ts and platform-queues.test.ts
it("purges an organization's import and export tables and files with the rest", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gate's first line.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(platform): sweep import and export files after their time, and on erasure`.

### Task 0.11: The api and the worker, the features' stubs, and the shared queries' speed

**Files:**

- Create:
  - `packages/api/src/routers/{lead-imports,lead-exports,staff-imports,staff-exports}.ts`, each `router({})`;
  - the stubs `packages/domain/src/crm/lead-import/index.ts`, `crm/lead-export/index.ts` and
    `packages/domain/src/imports/staff/index.ts`;
  - `packages/domain/test/performance/imports-at-scale.test.ts`.
- Modify:
  - `packages/api/src/routers/app-router.ts`;
  - `packages/domain/src/crm/index.ts` (its two lines, from the shared-files table);
  - `packages/domain/src/imports/index.ts`;
  - `apps/api/src/{services,worker-jobs,worker}.ts`;
  - `apps/api/test/worker.test.ts` (the listener names);
  - `.dependency-cruiser.cjs`: `business-modules-call-down`'s `from` becomes `(catalog|tasks|imports|exports|crm)`,
    so imports and exports never call crm or today.

**Interfaces:**

- The stubs, each `defineListener` with its final name and event, and a body that throws
  `new Error("Not built yet: bulk plan, Task <n>")`:

  | Stub                                                   | Name                         | Event                    | Task |
  | ------------------------------------------------------ | ---------------------------- | ------------------------ | ---- |
  | `checkLeadImportListener(dependencies: ImportJobDependencies): EventListener` | `crm.check-lead-import`      | `import.columns-matched` | 1.3  |
  | `addLeadImportListener(dependencies: ImportJobDependencies)`                  | `crm.add-lead-import`        | `import.add-requested`   | 1.4  |
  | `makeLeadExportListener(dependencies: ExportJobDependencies)`                 | `crm.make-lead-export`       | `export.requested`       | 2.1  |
  | `checkStaffImportListener(dependencies: ImportJobDependencies)`               | `imports.check-staff-import` | `import.columns-matched` | 3.2  |
  | `addStaffImportListener(dependencies: ImportJobDependencies)`                 | `imports.add-staff-import`   | `import.add-requested`   | 3.3  |

  `makeStaffExportListener` is 0.9's.
- `Services` gains `spreadsheets: Spreadsheets` (`createSpreadsheets()`).
- `WorkerJobDependencies` gains:
  - `spreadsheets`;
  - `subscriptions`;
  - `seatLimit` (`planLimits`' seats);
  - `identity` widened to `Pick<Identity, … | "resolveAccess" | "leadWorkers" | "matchLeadWorkers" | "matchRoles" | "staff">`.
- `workerJobs` lists `readImportFileListener` and the six bulk listeners above.

- [ ] **Step 1: Write the failing tests.**

```ts
it("runs imports.read-file, the two lead import listeners, the two staff import listeners and both export listeners", …) // worker.test.ts names
it("serves leadImports, leadExports, staffImports and staffExports, empty until their features", …)
// imports-at-scale.test.ts (performance database; 50 imports of the person, one of 10,000 rows, a neighbouring agency's 10,000)
it("lists Recent imports within 150 ms, on import_batch_recent", …)
it("counts a 10,000-row preview by plan and reason within 150 ms, on import_row_by_plan", …)
it("finds 10,000 earlier fingerprints with = ANY on import_row_fingerprint", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gate's first line.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(api): wire imports and exports into the api and the worker, with the features' stubs`.

### Task 0.12: The web's import pieces

**Files:**

- Create:
  - `apps/web/src/imports/{import-file.ts,import-file-step.tsx,column-matcher.tsx,value-matcher.tsx,import-refetch.ts,import-progress.tsx,import-counts.tsx,recent-imports.tsx,import-status-badge.tsx,import-step-caption.tsx,row-reason-text.ts}`;
  - `apps/web/src/i18n/messages/en-IN/imports.json`.
- Modify `apps/web/src/i18n/messages.ts` (`imports`, `exports`).
- Test `apps/web/test/imports/{import-file,import-file-step,column-matcher,value-matcher,import-progress,recent-imports,import-step-caption}.test.tsx`.

**Interfaces** (paths under `apps/web/src`):

- `checkImportFile(file: { name; type; size }): { ok: true; contentType: SpreadsheetContentType } | { ok: false;
  problem: "type" | "old" | "size" | "empty" | "name" }`:
  - the type comes from the extension;
  - `.xls` and `.numbers` are `old`, whose sentence is "Save it as an Excel Workbook (.xlsx) or CSV and choose it
    again.".
- `ImportFileStep({ maxRows, sampleHref, start(file: { fileName; contentType; sizeBytes }): Promise<StartedImport>, confirm(importId): Promise<unknown>, onUploaded(importId): void })`, with `StartedImport` the contract's output (0.3):
  - the file button, labelled "Choose a file";
  - "Excel (.xlsx) or CSV, up to {maxRows} rows and 10 MB. We read the first sheet; its first row must name the
    columns.";
  - Download a sample file;
  - the upload through `useSignedUpload`, with its progress, Stop, and Try again without choosing again;
  - every button asks `useWriteAccess("change")`.
- `ColumnMatcher({ columns: ImportColumn[], fields: readonly { field: ImportField; label: string }[], chosen: ReadonlyMap<number, ImportField | null>, onChoose(position, field | null) })`:
  - a `Table` (Column in your file · Sample values · Import as) from `md`, an `ItemGroup` below;
  - each column has a `Select` with "Don't import" first and "As last time" for a remembered guess;
  - a field another column holds shows "Phone · matched to 'Mobile No'" and can't be picked, Note excepted (D34).
- `ValueMatcher({ heading, values: { value; rows }[], targets: { value: string; label: string }[], chosen: ReadonlyMap<string, string | null>, onChoose(value, target | null), defaultLabel })`: the counts in mono,
  right-aligned.
- `importRefetchInterval(detail: ImportDetail | undefined): 2000 | false` (D37): 2000 while reading, checking or
  adding.
- `ImportProgress({ done, total, since: string | null, label })`: a `Progress`, "642 of 1,157 rows", and "About a
  minute left" once 5 seconds of rate are known.
- `ImportCounts({ items: { label: string; count: number }[] })`: `Details`, with the counts in mono.
- `RecentImports({ imports: RecentImport[], hrefOf(id): string })`: each with its file name, its day ("16 Oct"),
  "1,286 rows · 1,094 added" and its badge. Nothing shows when there are none.
- `ImportStatusBadge({ status })`, the spec 3.2 tones:
  - Waiting for you (matching, checked): attention;
  - Reading, Checking, Adding, Stopped, Cancelled and Expired: neutral;
  - Done: good;
  - Failed and Can't read: bad.
- `ImportStepCaption({ status })`: "Step 2 of 4 · Match columns".
- `useRowReasonText(): (reason: RowReason) => string`, from `imports.json`'s `reasons`, for both kinds' codes.
- `imports.json` holds every shared word:
  - `steps`, `statuses`, `file`, `problems`;
  - `unreadable` (one sentence per reason, and Choose another file);
  - `columns`;
  - `fields.leads.*` and `fields.staff.*`;
  - `values`, `progress`, `counts`, `reasons`, `failures`, `recent`.

- [ ] **Step 1: Write the failing tests.**

```tsx
it("takes .xlsx and .csv by their extension, CSV even when Windows calls it application/vnd.ms-excel", …)
it("says to save an .xls or .numbers file as .xlsx or CSV", …)
it("uploads with its progress, stops, and tries again without choosing the file again", …)
it("shows the files module's own sentence when the agency's storage is full", …) // STORAGE_LIMIT_REACHED (B7)
it("shows a Table on a computer and an ItemGroup on a phone, Don't import first, As last time where remembered", …)
it("shows a field another column holds as matched to it, and never lets two columns take it but Note", …)
it("lists a column's values with their counts in mono, each with its own Select", …)
it("polls every 2 seconds while reading, checking or adding, and stops after", …)
it("says 642 of 1,157 rows and About a minute left", …)
it("captions each status with its step: Step 2 of 4 · Match columns", …)
it("badges Waiting for you in amber, Done in green, Failed and Can't read in red, the rest neutral", …)
```

- [ ] **Step 2: Run them to see them fail.** Run `pnpm --filter @travel-crm/web test -- imports`. Expected: FAIL.
- [ ] **Step 3: Build them** as thin compositions of the registry parts.
- [ ] **Step 4: Run the web tests.** Expected: PASS, including the border, colour and touch-target guards.
- [ ] **Step 5: Commit.** Message: `feat(web): the shared import pieces: the file step, the matchers and the progress`.

### Task 0.13: The web's export pieces, the Leads header slot and the shared lists

**Files:**

- Create:
  - `apps/web/src/exports/{export-dialog,export-screen,export-status-badge}.tsx` and `use-export.ts`;
  - `apps/web/src/i18n/messages/en-IN/exports.json`;
  - `apps/web/src/leads/list/leads-header-actions.tsx`;
  - the stubs `apps/web/src/leads/import/lead-import-button.tsx` and `apps/web/src/leads/export/lead-export-button.tsx`;
  - `apps/web/test/e2e/support/imports.ts`.
- Modify:
  - `apps/web/src/leads/list/leads-screen.tsx` (`action={<LeadsHeaderActions />}`);
  - `apps/web/src/lib/routes.ts`;
  - `leads.json` (D30, the two placeholders);
  - `notifications.json` (`preferences.kinds.leadImported`);
  - `kinds.ts` (`lead.imported`);
  - `apps/web/test/e2e/audit/shot-list.ts`.
- Test:
  - `apps/web/test/exports/{export-dialog,export-screen}.test.tsx`;
  - `apps/web/test/leads/leads-header-actions.test.tsx`.

**Interfaces:**

- `ExportCalls = { start(format: ExportFormat): Promise<{ exportId: string }>; detailOptions(exportId: string): UseQueryOptions<ExportDetail>; downloadLink(exportId: string): Promise<DownloadLinkOutput> }`.
- `useExport(calls)`: `{ exportId, detail, start, download }`. `detail` polls every 2 s while making.
- `ExportDialog({ open, onOpenChange, title, intro, holds: ReactNode, rowsWord: "leads" | "people", calls })`:
  - a `ResponsiveDialog`;
  - `holds` as `Details`;
  - the format as the registry's radio choice cards: Excel (.xlsx), "Opens in Excel and Google Sheets" (chosen), or
    CSV, "For other tools";
  - the sentence "The file holds customers' phone numbers and emails. Your export is recorded in the audit log, and
    the file is deleted after 24 hours.";
  - Prepare the file, then "Preparing 312 leads…" with a `Progress`. The dialog may close.
  - Then the file's name and size with Download (`useDownload`).
  - Prepare and Download ask `useWriteAccess("export")`.
- `ExportScreen({ title, holds, calls, exportId })`: `PageHeader`, what it holds, the state, and Download until the file
  is deleted. Then "This file was deleted after 24 hours." with a way back.
- `LeadsHeaderActions()`: New lead (primary, with `leads:create`), `<LeadImportButton />` and `<LeadExportButton />`
  in one wrapping row of pills.
- Routes:
  - `leadImport: "/leads/import"`, `leadImportRoute(id)`, `leadExportRoute(id)`;
  - `staffImport: "/staff/import"`, `staffImportRoute(id)`, `staffExportRoute(id)`.
- `support/imports.ts`:
  - `chooseImportFile(page: Page, file: { name: string; mimeType: string; buffer: Buffer }): Promise<void>`;
  - `csvOf(rows: string[][]): Buffer`;
  - `xlsxOf(rows: (string | number | null)[][]): Promise<Buffer>`, through `createSpreadsheets().writer`;
  - `waitForImportStatus(page: Page, words: RegExp): Promise<void>`.
- The shot names, in one block per feature:
  - lead import: `lead-import-choose`, `lead-import-uploading`, `lead-import-unreadable`, `lead-import-match`,
    `lead-import-match-values`, `lead-import-check`, `lead-import-check-examples`, `lead-import-confirm`,
    `lead-import-adding`, `lead-import-done`, `lead-import-read-only`;
  - lead export: `leads-header`, `lead-export-dialog`, `lead-export-preparing`, `lead-export-ready`,
    `lead-export-page`, `lead-export-sales`;
  - staff: `staff-header`, `staff-add-with-phone`, `staff-change-phone`, `staff-import-match`, `staff-import-check`,
    `staff-import-over-seats`, `staff-import-passwords`, `staff-import-passwords-lost`, `staff-export-dialog`.

- [ ] **Step 1: Write the failing tests.**

```tsx
it("offers Excel (chosen) or CSV, says the file holds phones and is deleted after 24 hours, and holds while preparing", …)
it("shows Preparing 312 leads… then the file's name and size with Download, also while the agency is read-only", …)
it("keeps New lead the header's one primary button, followed by the Import and Export slots in one wrapping row", …) // the slots render their stubs
it("shows an export's page with Download until it's deleted, then says so", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Build them.** `exports.json` holds:
  - the dialog's words;
  - `statuses`;
  - `failures`, with `too_many_rows.leads`: "This export has more than 1,00,000 leads. Narrow it with a filter.";
  - the page's words.
- [ ] **Step 4: Run the whole gate.** Expected: PASS: the Leads header changed, so the journeys run.
- [ ] **Step 5: Commit.** Message: `feat(web): the shared export pieces, the Leads header's slot and the new shots`.

### Task 0.14: ADR 0030, the docs, and Part 0's merge

**Files:**

- Create `docs/adr/0030-imports-and-exports.md`, recording:
  - the spreadsheets port and why these libraries (spec 6.1, 15.16);
  - reading only in the worker (15.1);
  - the step events;
  - the keeping times;
  - D1's stubs.
- Modify:
  - `docs/adr/README.md`;
  - `CLAUDE.md`: the repo map's modules `imports` and `exports`; the adapter `spreadsheets`; "Bulk files" under shared
    services (the port, `storeGeneratedFile` for system files, the sweep);
  - `packages/domain/README.md` (the modules, L0);
  - `docs/deploy-checklist.md`: no new variable; the worker reads files up to 10 MB in its own memory (spec 11).

- [ ] **Step 1: Write the docs.** Commit with `docs: ADR 0030, imports and exports, in the repo map and the module list`.
- [ ] **Step 2: Run the merge gate** in the foreground. Expected: PASS. `pnpm audit` covers the four new packages.
- [ ] **Step 3: Report**, with the gate's results and the stubs left for each feature. The controller merges
  `bulk/shared` into `main` (`chore: merge bulk/shared (the shared pieces of bulk in and out)`) and makes the three
  feature worktrees.

---

## Part 1: Lead import (`bulk/lead-import`)

Tests use these for setup:

- the release 1 seeds (`aPerson`, `aLead`, `aTask`) and `aBatch` and `aRow` (0.4);
- `memberWithStarterRole("org-admin" | "sales", …)` for actors;
- the memory spreadsheets for files, or the real adapter where a test reads an .xlsx.

HTTP tests use `createTestServer`, `signedInOwner` and `addStaff`, and the worker flow where a step must run.

Erasure and purge need nothing more here: 0.10 deletes every import file and report and empties the erased person's
import rows (spec 9), and the purge reads the catalog.

### Task 1.1: One save path for an enquiry

**Files:**

- Create `packages/domain/src/crm/save-enquiry.ts`.
- Modify `packages/domain/src/crm/{create-lead,repeat-enquiry}.ts`.
- Test `packages/domain/test/crm/save-enquiry.test.ts`.

**Interfaces:**

```ts
export interface Enquiry { person: NewPerson; trip: TripInput; note: string | null; source: LeadSource; sourceDetail: string | null }
export type EnquiryOptions =
  | { from: "form"; ownerUserId: string; whenOpenLead: "add-to-it" | "new-lead" | null }
  | { from: "import"; ownerUserId: string; stage: LeadStage; createdAt: Date | null };
export interface SavedEnquiry { outcome: "created" | "added-to-open-lead"; leadId: string; personId: string; returning: boolean; leadOwnerUserId: string | null }
export function saveEnquiry(tx: OrgTx, access: MemberAccess, enquiry: Enquiry, now: Date, options: EnquiryOptions): Promise<SavedEnquiry>
```

- **The form's path** is release 1's `saveLead`, unchanged: `createLead` calls `saveEnquiry`, notifies as before, and
  keeps its scope rule on `leadId`.
- **The import's path:**
  - it always adds to an open lead;
  - it notifies nobody (B18);
  - it writes the stage and `createdAt` (D16);
  - the timeline is at `now`: `NewLeadRecord` gains `recordedAt?: Date`, `occurredAt` uses it, and the demo's default
    stays `createdAt`;
  - an imported lead past New has no first reply (B17).

- [ ] **Step 1: Write the failing tests.**

```ts
it("gives the form and an import the same person, lead and timeline for the same enquiry", …)
it("adds an import's row for a person with an open lead as a repeat enquiry, without asking", …)
it("marks a known person with no open lead returning", …)
it("sends no 'New lead assigned to you' or 'Repeat enquiry on your lead' for an import", …)
it("dates an imported lead from its enquiry date, and its timeline from the import", …)
it("leaves an imported lead past New without a first reply", …)
// create-lead.test.ts and leads-create.test.ts stay green, unchanged
```

- [ ] **Step 2: Run them to see them fail.** Run `pnpm --filter @travel-crm/domain test -- crm`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the crm tests and `apps/api` leads tests.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `refactor(crm): one save path for an enquiry, the form's and an import's`.

### Task 1.2: Reading a row into an enquiry

**Files:**

- Create `packages/domain/src/crm/lead-import/{row-values,trip-values,budget-values,lead-row}.ts`.
- Test `packages/domain/test/crm/lead-import/{row-values,lead-row}.test.ts`.

**Interfaces:**

```ts
export interface LeadRowContext {
  columns: ColumnMatches;
  ownerOf(value: string): string | null;   // the value match's target; null: the default owner
  stageOf(value: string): LeadStage | null; // null: the default stage
  defaults: { stage: LeadImportStage; ownerUserId: string; budgetBasis: BudgetBasis };
  fileName: string;
  today: CalendarDate;
  timeZone: string;
}
/** A row's contacts as stored: E.164, a lower-case email, a handle without "@"; null when it has none we can use. */
export interface LeadRowContacts { phone: string | null; email: string | null; instagramHandle: string | null }
export type LeadRowReading =
  | { kind: "enquiry"; enquiry: Enquiry; stage: LeadStage; ownerUserId: string; createdAt: Date | null; noted: boolean;
      contacts: LeadRowContacts;
      destinationName: string | null; fingerprintValues: readonly (string | null)[]; exampleName: string }
  | { kind: "not_added"; reasons: RowReason[]; exampleName: string | null; exampleValue: string | null };
export function readLeadRow(row: SheetRow, context: LeadRowContext): LeadRowReading
```

- `row-values.ts` holds:
  - `readDay(text): CalendarDate | null`: day first, never month first;
  - `readMonth(text): CalendarMonth | "flexible" | null`;
  - `readPaise(text): number | null`;
  - `readAdults`, `readChildrenAges`.
- `keyOfWord` (0.3) reads the fixed lists.
- **Rules:** B14 and B19-B24, through `toE164`, `emailAddress` and `instagramHandle`, with D16 and D17.

- [ ] **Step 1: Write the failing tests.**

```ts
it("reads 98765 43210, 09876543210, 919876543210, +91-98765-43210 and an Excel number as +919876543210", …)
it("lower-cases an email and drops a handle's @", …)
it("reads dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, '16 Oct 2026' and date cells", …)
it("reads 10/12/2026 as 10 Dec 2026, never 12 Oct", …)
it("keeps 45941 in a date column as 'Travel date: 45941' in the note", …)
it("reads Dec 2026, December 2026, 12/2026 and 2026-12 as a month, and flexible, open or not fixed as flexible", …)
it("makes Travel from alone a one-day trip", …)
it("reads ₹1,50,000, Rs 150000, INR 1.5 lakh, 150k, 1.5 L, 2 lac, 1 Cr and 1 crore in rupees", …) // 1.5 lakh = 15_000_000 paise
it("reads 'Honeymoon', '4 star', 'Jain' and stage words, case ignored", …)
it("adds a row with a bad phone and an email, keeping the phone in the note", …)
it("notes 'Children: 2, ages not given', and a count that disagrees with the ages", …)
it("joins the Note columns as 'Remarks: wants a houseboat' lines, and refuses notes over 4,000 characters", …)
it("refuses a row with no name, no usable contact, or marked Not a lead", …)
it("sources a row as Import with the file's name, then their source: 'enquiries-oct-2026.xlsx · Instagram', cut to 120", …)
it("takes an enquiry date not in the future as the added date, at the agency's midnight", …) // "12/10/2026" Asia/Kolkata → 2026-10-11T18:30:00.000Z; tomorrow → the note
it("gives empty cells the file's defaults: stage, owner and budget basis", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement** as pure functions.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(crm): read an import's row into an enquiry, keeping what it can't read in the note`.

### Task 1.3: The check

**Files:**

- Create `packages/domain/src/crm/lead-import/{lead-lookups,lead-check}.ts`.
- Modify `crm/lead-import/index.ts` (the real `checkLeadImportListener`).
- Test `packages/domain/test/crm/lead-import/lead-check.test.ts`.

**Interfaces:**

```ts
export function personContactsQuery(kind: ContactKind, values: readonly string[]): Sql // = ANY on person_*_live
export function openLeadsOfQuery(personIds: readonly string[]): Sql                    // on lead_person, open and live
export function blockedContactsQuery(values: { kind: ContactKind; value: string }[]): Sql // on blocked_contact_live
export interface LeadLookups { personOf(contacts: LeadRowContacts): string | null; openLeadOf(personId: string): string | null; isBlocked(contacts: LeadRowContacts): boolean; hasDestination(name: string): boolean }
export function lookUpLeadRows(tx: OrgTx, rows: readonly LeadRowReading[]): Promise<LeadLookups>
export function planLeadRows(rows: readonly LeadRowReading[], lookups: LeadLookups, earlier: ReadonlyMap<string, Date>): { plans: ImportRowPlan[]; rowsToAdd: number; rowsNewStage: number }
```

- The listener acts only on a `leads` batch that is `checking`. It:
  1. reads the file again (`readImportFile`);
  2. builds the context: the columns through `columnMatchesOf`, the value targets through `valueTargetsFor`, owners
     from `leadWorkers`, the default owner from the batch or `firstOwner`, and the agency's zone;
  3. reads every row;
  4. makes one lookup per kind for the whole file, and the fingerprints through `earlierFingerprints`;
  5. plans every row:
     - people and leads made earlier in the same file count (B15);
     - an identical row is `same_as_row` (B33);
  6. writes the plans with `replaceImportRows`, then `markImportChecked`.
- It changes no lead (B25).

- [ ] **Step 1: Write the failing tests.**

```ts
it("plans each row: new, returning, a repeat enquiry on an open lead, blocked, already imported, or not added with its reason", …)
it("makes a later row for the same person a repeat enquiry on the lead an earlier row makes", …)
it("leaves a row identical to an earlier one out as 'Same as row 12'", …)
it("names the destinations the import will add, once each, ignoring case", …) // "goa" when Goa exists: none
it("counts the leads that will be New", …)
it("looks up contacts, open leads, blocked contacts and fingerprints once per kind for the whole file", …) // counts statements
it("matches an Owner column of more than fifty values at the check, value by value", …)
it("changes no lead, person or destination, and a second run writes the same rows", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL with "Not built yet".
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(crm): check a lead import: a dry run of every row`.

### Task 1.4: The add, and the owners' notices

**Files:**

- Create `packages/domain/src/crm/lead-import/{lead-add,owner-notices}.ts`.
- Modify `crm/lead-import/index.ts` (the real `addLeadImportListener`).
- Test `packages/domain/test/crm/lead-import/lead-add.test.ts`.

**Interfaces:**

```ts
/** One batch of at most 50 rows; says whether rows are left, or how the import ends. */
export function addLeadBatch(context: ListenerContext, dependencies: ImportJobDependencies, importId: string): Promise<"more" | "done" | "stopped" | { failed: ImportFailureReason }>
export function noticeImportedOwners(tx: OrgTx, access: MemberAccess, batch: ImportBatchRow, sourceEventId: string): Promise<void>
```

- **Each batch is one transaction** (B26-B31, D18, D19). It:
  1. holds the import (`holdImport`);
  2. stops as `stopped` if Stop was pressed, or as `failed` if `importerAccess` refuses;
  3. takes `rowsToAdd(…, 50)`;
  4. reads their blocked contacts and earlier fingerprints at once;
  5. for each row:
     - leaves it out (`left_out`) if it is blocked or already imported and not ticked;
     - otherwise saves it through `saveEnquiry` with `from: "import"`, its owner falling back to the default when it
       can no longer work leads;
  6. writes the outcomes with `recordRowOutcomes` (added or merged, with the lead, the person and the fingerprint),
     which moves the progress.
  - A unique violation runs the batch once more in a new transaction (R23).
- **The listener** acts only on a `leads` batch that is `adding`. It loops until a batch says anything but "more", then
  calls `finishImport(…, { status, failureReason, report: true, notifyImporter: true, sourceEventId: event.id },
  (tx, batch) => noticeImportedOwners(tx, access, batch, event.id))`.
- **`noticeImportedOwners`** counts the batch's added and merged leads by their owner. Each owner but the importer gets
  one `lead.imported` (D20, D21):
  - title "120 leads from an import are now yours";
  - body "And 12 repeat enquiries on your leads." when there are some, else "They're on your Leads list now.".

- [ ] **Step 1: Write the failing tests.**

```ts
it("adds rows 50 to a transaction through the one save path, writing each row's outcome, lead and person", …)
it("leaves blocked and already imported rows out unless ticked, and adds them when ticked", …)
it("applies the rules again: a contact blocked since the check is left out, a lead added by hand meanwhile takes a repeat enquiry", …)
it("gives an owner removed since the check's rows to the default owner", …)
it("fills a contact the person lacks and drops one another person holds, still adding the row", …)
it("never saves a row with an outcome again: a run after a crash carries on, and two overlapping runs add each row once", …)
it("runs a batch again once when a contact was added meanwhile", …)
it("stops after the batch under way when Stop is pressed; the rest are 'Stopped before this row'", …)
it("fails, keeping what it added, when the importer left, lost leads:create or leads:assign, or the agency can't change", …)
it("records each row's own audit entries as the importer with source job, and import.finished with the counts", …)
it("tells each owner but the importer once: '120 leads from an import are now yours'", …)
it("makes the report of rows not added and tells the importer the import is done", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gate's first line.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(crm): add a lead import 50 rows at a time, resumable and stoppable`.

### Task 1.5: The `leadImports` procedures

**Files:**

- Modify `packages/api/src/routers/lead-imports.ts`.
- Test `apps/api/test/lead-imports.test.ts` and `apps/api/test/lead-imports-flow.test.ts` (the worker flow, MinIO).

**Interfaces:**

- `importer = orgProcedure.requires("leads:create", "leads:assign")`:
  - `start(startImportInput) → startedImport`;
  - `confirmUpload(importIdInput)`;
  - `match(matchLeadColumnsInput)`, passing `owners` from `identity.leadWorkers`;
  - `decide(decideLeadImportInput)`, `stop(importIdInput)`, `cancel(importIdInput)`;
  - `get(importIdInput) → importDetail`;
  - `rows(importRowsInput) → importRowsPage`;
  - `recent() → recentImport[]`.
- `freshProcedure.requires("leads:create", "leads:assign")`:
  - `add(importIdInput)`;
  - `reportLink(importIdInput) → downloadLink`, with `.meta({ lifecycle: "export" })`.

- [ ] **Step 1: Write the failing tests.**

```ts
it("lets only holders of both leads:create and leads:assign import, on the crm plan module", …)
it("answers NOT_FOUND for another person's import, a staff import, or another organization's", …)
it("answers IMPORT_NOT_READY to a step out of turn, and IMPORT_ALREADY_RUNNING to a second import's Add", …)
it("refuses an owner target who can't work leads: NOT_A_LEAD_WORKER", …)
it("uploads a CSV, reads it, matches, checks and adds it through the worker", …) // flow test
it("downloads the report on a read-only agency, and refuses Add there", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement** the handlers, each a call into `imports` or crm with `ctx.db` and `ctx.files`.
- [ ] **Step 4: Run the gate's first line.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(api): the leadImports procedures`.

### Task 1.6: Screens: choosing a file and matching its columns

**Files:**

- Create:
  - `apps/web/src/app/(app)/leads/import/page.tsx` and `apps/web/src/app/(app)/leads/import/[importId]/page.tsx`, each
    inside two nested `RequirePermission`s, `leads:create` and `leads:assign`;
  - `apps/web/src/leads/import/{choose-file-screen,lead-import-screen,match-step,lead-file-questions}.tsx`;
  - `apps/web/src/leads/import/{use-lead-import,lead-import-fields}.ts`;
  - `apps/web/public/samples/leads-sample.csv`: B9's common headers and three made-up rows, no organization data.
- Modify:
  - `apps/web/src/leads/import/lead-import-button.tsx`;
  - `leads.json`'s `import` key.
- Test `apps/web/test/leads/import/{lead-import-button,choose-file-screen,match-step}.test.tsx`.

**Interfaces:**

- `useLeadImport(importId)`: `leadImports.get` with `importRefetchInterval`.
- `LeadImportScreen({ importId })`: picks the step from the status (D37):
  - reading: "Reading enquiries-oct-2026.xlsx…";
  - unreadable: the reason's sentence and Choose another file;
  - matching: `MatchStep`;
  - the rest: 1.7's steps.

- [ ] **Step 1: Write the failing tests.**

```tsx
it("shows Import to holders of leads:create and leads:assign, off with its hint while the agency can't make changes", …)
it("explains the import, uploads the file, says Reading enquiries-oct-2026.xlsx… and opens the import's address", …)
it("lists recent imports with their badges, each linking to its page", …)
it("fills the guesses, says As last time, and lists a matched Owner or Stage column's values with their counts", …)
it("checks off Name and a phone, email or Instagram, and asks what the file leaves open", …) // default stage New, default owner the agency's Owner, budget basis
it("sends match with the columns, the values changed and the defaults when Check the rows is pressed", …)
it("says why a file can't be read, with Choose another file", …)
it("says the file was imported on 12 Oct with 1,094 leads added", …)
it("names the sheet: Sheet 'Leads Oct', the first of 3", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Build it** from 0.12's pieces, `PageHeader`, `ImportStepCaption` and `FormField`. The open questions are
  `SelectField`s and a `RadioGroup`.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(web): lead import's first steps: choose a file and match its columns`.

### Task 1.7: Screens: check, adding and done

**Files:**

- Create `apps/web/src/leads/import/{check-step,adding-step,done-step}.tsx`.
- Modify `leads.json`'s `import` key.
- Test `apps/web/test/leads/import/{check-step,adding-step,done-step}.test.tsx`.

- [ ] **Step 1: Write the failing tests.**

```tsx
it("groups the preview: Will be added, Your choice, Won't be added with five examples, New destinations, the quiet line", …) // "Row 14 · Rahul Sharma · no phone, email or Instagram"
it("asks 'Add 1,094 leads and 63 repeat enquiries? Imported leads can't be removed in bulk later.' and sends add", …)
it("ticks Add them anyway and Add them again through decide, without a new check", …)
it("goes back to the columns with Change the columns, and cancels with Cancel this import", …)
it("shows 642 of 1,157 rows and About a minute left, says you can leave, and stops after asking", …)
it("shows Done with the counts, Download the 129 rows not added, Kept until 26 Oct, and See the imported leads", …) // /leads?source=bulk_upload
it("shows a stopped or failed import's counts, the download and the reason", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Build it** with:
  - `Card`, `ImportCounts`, `Collapsible` with `leadImports.rows`, `Checkbox`;
  - `ConfirmDialog` for Add and Stop;
  - `ImportProgress`;
  - `useDownload(reportLink)`, which asks `useWriteAccess("export")`.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(web): lead import's check, progress and done`.

### Task 1.8: The demo's imported leads, and 10,000 rows at speed

**Files:**

- Modify:
  - `packages/domain/src/crm/demo-lead-data.ts`: two leads with source `bulk_upload` and the detail
    `september-enquiries.xlsx`, owned one each by Asha and Ravi;
  - `packages/domain/test/platform/demo.test.ts`.
- Create `packages/domain/test/performance/lead-import-at-scale.test.ts`.

- [ ] **Step 1: Write the tests.**

```ts
it("gives the demo two leads from an import, september-enquiries.xlsx, and keeps no import batch", …) // demo.test.ts
// lead-import-at-scale.test.ts: 10,000 rows as .xlsx, a third matching the large agency's people
it("reads a 10,000-row file within 2 s", …)
it("checks 10,000 rows within 15 s, each lookup one query on its live unique index", …) // planOf: person_phone_live, person_email_live, person_instagram_live, blocked_contact_live, lead_person, import_row_fingerprint
it("adds 10,000 rows within 3 minutes, the progress moving every 50 rows, no transaction longer than one batch", …)
```

- [ ] **Step 2: Run them.** Run `pnpm --filter @travel-crm/domain test -- performance/lead-import platform/demo`.
  A miss is a finding: fix the query, not the budget.
- [ ] **Step 3: Commit.** Message: `test(crm): a 10,000-row lead import within its budgets, and the demo's imported leads`.

### Task 1.9: Journeys, the visual audit, and the merge

**Files:**

- Create:
  - `apps/web/test/e2e/lead-import-{guessed,problems,same-file,stop,read-only}.spec.ts`;
  - `apps/web/test/e2e/audit/09-lead-import.audit.ts`.

- [ ] **Step 1: Write the journeys.** Each runs on phone and desktop, with axe after each, and builds its files with
  `csvOf` and `xlsxOf`.

```ts
test("a CSV of 20 leads with guessed columns and an Owner column: added with source Import, each owner told once", …)
test("an .xlsx with every problem: each group in the preview; the rows not added, fixed and imported again, add only those", …)
test("the same file again: Already imported, nothing added unless chosen", …)
test("an import stopped halfway: the report holds the rest as Stopped before this row", …)
test("a read-only agency: Import is off with its hint", …)
```

- [ ] **Step 2: Run them until they pass.** Run `./node_modules/.bin/playwright test test/e2e/lead-import-*.spec.ts`.
- [ ] **Step 3: Write the camera file.**
  - It shoots 0.13's lead import shots. Then run the visual audit loop until no must is left.
  - If `bulk/lead-export` is already on `main`, merge `main` and re-shoot `leads-header` from `10-lead-export.audit.ts`
    (D2).
- [ ] **Step 4: Run the merge gate.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `test(web): the lead import journeys and audit shots`. Then merge (above).

---

## Part 2: Lead export (`bulk/lead-export`)

Erasure and purge need nothing more here: 0.10 deletes every export file of the organization (spec 9). The spec asks for
no demo data for exports.

### Task 2.1: The lead export's rows

**Files:**

- Create `packages/domain/src/crm/lead-export/{lead-export-source,export-rows}.ts`.
- Modify:
  - `crm/lead-export/index.ts` (the real `makeLeadExportListener`);
  - `crm/lead-list.ts` (export `filterFor`);
  - `crm/lead-list-query.ts` (`exportCountQuery`, `leadExportRowsQuery`);
  - `packages/contracts/src/crm/lead-export.ts`.
- Test `packages/domain/test/crm/lead-export.test.ts`.

**Interfaces:**

- **Contracts:**
  - `leadExportFilter = listLeadsInput.omit({ before, limit })`, strict;
  - `startLeadExportInput = { filter: leadExportFilter, format: exportFormat }`;
  - `leadExportDetail = exportDetail.extend({ filter: leadExportFilter, people: peopleNames, destinationName: string |
    null })`;
  - `MAX_LEAD_EXPORT_ROWS = 100_000`.
- **Domain:**

```ts
export function exportCountQuery(filter: LeadCountsFilter & { stages: readonly LeadStage[] }): Sql
export function leadExportRowsQuery(leadIds: readonly string[]): Sql // the columns the list doesn't select, by (organization_id, id) = ANY
/** maxRows defaults to MAX_LEAD_EXPORT_ROWS; a test passes a small one. */
export function leadExportSource(dependencies: ExportJobDependencies, options: { timeZone: string; maxRows?: number }): ExportSource<LeadExportFilter>
```

- **A page** is:
  1. `leadListQuery` (D27) for 1,000 ids after the cursor, with the filter through `filterFor(access, …)`;
  2. `leadExportRowsQuery`;
  3. `nextOpenTasks` and `destinationNames`, in one transaction;
  4. the owners' names from `memberContacts`, outside it ("Former member" for one missing).
- **The columns** are B38's in order, with `leadFileWords`' words:
  - the phone through `internationalPhone`;
  - the budget in rupees as a number;
  - Added on and Next follow-up as the agency's wall clock (D28);
  - Lead link as `${appUrl}/leads/<id>`.
- **The file name** is `leads-yyyy-mm-dd-HHMM` in the agency's zone.

- [ ] **Step 1: Write the failing tests.**

```ts
it("exports exactly the list a person sees: a salesperson's own leads whatever they ask", …)
it("exports Everyone · Contacted · Goa matching 'Sharma', newest first", …)
it("writes B38's columns in order: +91 98765 43210, Returning Yes, Dec 2026 or Flexible, '7, 4', the budget in rupees, the owner or Former member", …)
it("writes Added on and Next follow-up as the agency's wall clock, and stamps the file name in its zone", …) // 23:50 IST → leads-2026-10-19-2350.xlsx
it("stops past its row limit with too_many_rows", …) // the source's maxRows, set low for the test
it("fails for a requester who lost leads:view", …)
it("records export.made with the filter by ids and searched: true, never the search", …)
it("imports back: the lead import's guesses read Added on as Enquiry date, and Returning and the follow-up columns as Don't import", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL with "Not built yet".
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(crm): the lead export's rows, 1,000 a page by keyset`.

### Task 2.2: The `leadExports` procedures

**Files:**

- Modify `packages/api/src/routers/lead-exports.ts`.
- Test `apps/api/test/lead-exports.test.ts`.

**Interfaces** (all `.meta({ lifecycle: "export" })`):

- `start(startLeadExportInput) → startedExport` and `downloadLink(exportIdInput) → downloadLink`, on
  `freshProcedure.requires("leads:view")`;
- `get(exportIdInput) → leadExportDetail`, on `orgProcedure.requires("leads:view")`, naming the owner and the
  destination.

- [ ] **Step 1: Write the failing tests.**

```ts
it("starts, follows and downloads an export with leads:view, a suspended Owner included", …)
it("answers NOT_FOUND for another person's export or a staff export", …)
it("answers EXPORT_NOT_READY while it's made and EXPORT_EXPIRED after 24 hours", …)
it("records export.downloaded for each download", …)
it("exports through the worker into a file with B38's header row", …) // worker flow, MinIO
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gate's first line.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(api): the leadExports procedures`.

### Task 2.3: Screens: Export and the export's page

**Files:**

- Create:
  - `apps/web/src/leads/export/{lead-export-holds,lead-export-screen}.tsx`;
  - `apps/web/src/app/(app)/leads/exports/[exportId]/page.tsx` (`leads:view`).
- Modify:
  - `apps/web/src/leads/export/lead-export-button.tsx`;
  - `leads.json`'s `export` key.
- Test `apps/web/test/leads/export/{lead-export-button,lead-export-screen}.test.tsx`.

**Interfaces:**

- `LeadExportButton()`: outline, for everyone with `leads:view`. It opens `ExportDialog` with the list's input as it
  is: `listFiltersOf(useSearchParams(), scope)` and the search from `useListSearch`.
- `leadExportHolds(input, names): string`: "Everyone · Open · Goa · matching 'Sharma'".

- [ ] **Step 1: Write the failing tests.**

```tsx
it("shows Export to everyone who sees the list, working while the agency is read-only", …)
it("says what the file holds: 'Everyone · Open · Goa · matching \"Sharma\"', and 'Mine · Contacted' for a salesperson", …)
it("prepares Excel by default, or CSV, and downloads it", …)
it("opens the export's page from the bell, with Download until it's deleted", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Build it** from 0.13's `ExportDialog` and `ExportScreen`.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(web): export the Leads list, and the export's page`.

### Task 2.4: 50,000 leads at speed, journeys, the visual audit, and the merge

**Files:**

- Create:
  - `packages/domain/test/performance/lead-export-at-scale.test.ts`;
  - `apps/web/test/e2e/lead-export.spec.ts` and `apps/web/test/e2e/lead-export-read-only.spec.ts`;
  - `apps/web/test/e2e/audit/10-lead-export.audit.ts`.

- [ ] **Step 1: Write the tests.**

```ts
// lead-export-at-scale.test.ts (the large agency; the real adapter)
it("exports 50,000 leads within 60 s, the resident memory growing less than 150 MB", …) // peak rss − baseline; the worker idles near 50 MB
it("reads each page by keyset on lead_open or lead_open_by_owner, never OFFSET, never a whole table", …) // planOf on leadListQuery (1,000) and leadExportRowsQuery
it("makes about 3 MB of .xlsx and 9 MB of CSV", …) // 2-5 MB and 6-13 MB
// journeys, phone and desktop, axe after each
test("export Everyone · Contacted · Goa as Excel, download it, and find it in the audit log; a salesperson's holds only their own", …)
test("a read-only agency still exports its leads", …)
```

- [ ] **Step 2: Run them until they pass.**
- [ ] **Step 3: Write the camera file.**
  - It shoots 0.13's lead export shots; `leads-header` shows the three pills once `bulk/lead-import` is on `main`
    (D2).
  - Run the visual audit loop until no must is left.
- [ ] **Step 4: Run the merge gate.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `test(crm): 50,000 leads export within budget; the lead export journeys and shots`.
  Then merge.

---

## Part 3: Staff import and export (`bulk/staff`)

Erasure: 0.10 covers the staff import's rows and files and the staff exports; 3.1 adds the one new piece of personal
data, the member's phone. The spec asks for no staff demo data.

### Task 3.1: Staff phones

**Files:**

- Create:
  - `packages/db/prisma/migrations/20261021100000_staff_phone/migration.sql`: `member.phone_e164`, nullable, with
    `member_phone_format` `^\+[1-9][0-9]{6,14}$`;
  - `packages/domain/src/identity/staff-phone.ts`;
  - `apps/web/src/organization/staff/change-phone-dialog.tsx`.
- Modify:
  - `packages/db/prisma/schema/identity-auth.prisma`;
  - `packages/contracts/src/identity/staff.ts`:
    - `createStaffInput.phone: phoneNumber.optional()`;
    - `staffMember.phone: string | null`;
    - `changeStaffPhoneInput = { memberId, phone: phoneNumber | null }`;
  - `packages/domain/src/identity/{staff,staff-accounts,identity}.ts` (`staff.changePhone`);
  - `packages/domain/src/identity/erasure.ts`: erasing a removed member empties `phone_e164`, and `personExport`
    carries it (spec 9's erasure step for this feature);
  - `packages/api/src/routers/staff.ts` (`changePhone`);
  - `audit.json`'s `actions.staff.phone-changed`;
  - `apps/web/src/organization/staff/{create-staff-form,create-staff-values,staff-list,staff-actions}.tsx`;
  - `staff.json`.
- Test:
  - `packages/domain/test/identity/staff-phone.test.ts`;
  - `apps/api/test/staff-phone.test.ts`;
  - `apps/web/test/organization/staff/{change-phone-dialog,create-staff-phone}.test.tsx`.

**Interfaces:** `changeStaffPhone(database, actor: MemberAccess, input: ChangeStaffPhoneInput): Promise<StaffMember>`,
under `assertMayManageMember`, recording `staff.phone-changed` with no number (B51).

- [ ] **Step 1: Write the failing tests.**

```ts
it("keeps a staff member's phone in E.164, optional and not unique, and never in the audit log", …)
it("changes a phone with staff.changePhone on a fresh session with staff:manage, recording staff.phone-changed", …)
it("empties a removed member's phone when they are erased, and lists it in their export before", …) // identity erasure
```

```tsx
it("adds staff with an optional phone, shows it on the list, and changes it from the row's menu", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.** Add staff's field is `PhoneField`.
- [ ] **Step 4: Run the whole gate.** The Staff screen changed. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(identity): staff phones, from Add staff and Change phone`.

### Task 3.2: The staff import's check

**Files:**

- Create:
  - `packages/domain/src/identity/staff-row-facts.ts`;
  - `packages/domain/src/imports/staff/{staff-row,staff-check}.ts`.
- Modify:
  - `packages/domain/src/imports/staff/index.ts` (the real `checkStaffImportListener`);
  - `packages/domain/src/identity/{identity,index}.ts` (`staff.rowFacts`, `staff.seatsFree`);
  - `packages/contracts/src/identity/staff-import.ts`: `staffImportDetail = importDetail.extend({ seats: { free: int
    | null }, added: { rowNumber, memberId, name, username | null, email | null, mustChangePassword }[] })`.
- Test:
  - `packages/domain/test/identity/staff-row-facts.test.ts`;
  - `packages/domain/test/imports/staff/staff-check.test.ts`.

**Interfaces:**

```ts
export interface StaffRowFacts { activeUsernames: ReadonlySet<string>; activeEmails: ReadonlySet<string>; emailsElsewhere: ReadonlySet<string>; roles: ReadonlyMap<string, { isOwner: boolean; mayGive: boolean }> }
// on Identity.staff:
rowFacts(actor: MemberAccess, names: { usernames: readonly string[]; emails: readonly string[] }): Promise<StaffRowFacts>
seatsFree(organizationId: string): Promise<number | null>
export interface StaffRowValues { rowNumber: number; name: string; email?: string; username?: string; phone?: string; roleKey: string }
export type StaffRowReading =
  | { kind: "ready"; values: StaffRowValues }
  | { kind: "not_added"; reasons: RowReason[]; exampleName: string | null; exampleValue: string | null };
export function readStaffRow(row: SheetRow, context: { columns: ColumnMatches; roleOf(value: string): string | null; defaultRoleKey: string | null }): StaffRowReading
export function planStaffRows(rows: readonly StaffRowReading[], facts: StaffRowFacts): ImportRowPlan[] // the file's own repeats, then the facts
```

- The listener acts only on a `staff` batch that is `checking`. It reads the file (`readImportFile`), the columns
  (`columnMatchesOf`), the role targets (`valueTargetsFor`) and the facts, plans each row `new` or `not_added` with
  B44's and D23's reasons, and ends with `replaceImportRows` and `markImportChecked`.

- [ ] **Step 1: Write the failing tests.**

```ts
it("reads Name, Username, Email, Phone and Role with Add staff's own schemas", …)
it("leaves out a row with no name, no username or email, or a username or email another row uses: 'Same username as row 4'", …)
it("leaves out an email on another organization's account, a bad username, email or phone, and a role unmatched", …)
it("leaves out the Owner role ('Add an Owner from Add staff, one at a time') and a role above the importer's", …)
it("calls a username or email already an active member here Already on your staff", …)
it("gives every row the file's role when there's no Role column", …)
it("counts the seats free beside the rows to add", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(imports): check a staff import against the agency's staff, roles and seats`.

### Task 3.3: Temporary passwords, and the all-or-nothing add

**Files:**

- Create:
  - `packages/domain/src/identity/imported-staff.ts`;
  - `packages/domain/src/imports/staff/{staff-passwords,staff-add}.ts`.
- Modify:
  - `packages/domain/src/identity/staff-accounts.ts`:
    - `assertSeatFree` becomes `assertSeatsFree(tx, organizationId, seatLimit, adding)`;
    - `StaffAccountRecord` gains `phone?` and `importId?`, which `staff.created`'s snapshot keeps;
  - `identity/{identity,index}.ts` (`staff.hashTemporaryPasswords`, `staff.addImported`);
  - `imports/staff/index.ts` (the real `addStaffImportListener`);
  - `imports/index.ts`;
  - `errors.json`'s `IMPORT_OVER_SEAT_LIMIT`: "This file adds more people than your plan has seats free. Leave some
    rows out, or ask us about more seats.".
- Test:
  - `packages/domain/test/identity/imported-staff.test.ts`;
  - `packages/domain/test/imports/staff/staff-add.test.ts`;
  - `apps/api/test/staff-passwords-never-kept.test.ts`.

**Interfaces:**

```ts
export interface ImportedStaffRow extends StaffRowValues { passwordHash: string } // StaffRowValues: 3.2
export interface AddedStaff { rowNumber: number; memberId: string; userId: string }
// on Identity.staff:
hashTemporaryPasswords(passwords: readonly string[]): Promise<string[]>
addImported(actor: MemberAccess, rows: readonly ImportedStaffRow[], importId: string, afterwards: (tx: OrgTx, added: readonly AddedStaff[]) => Promise<void>): Promise<AddedStaff[]>
export function setStaffImportPasswords(db: Database, identity: ImportIdentity, access, input: SetStaffPasswordsInput): Promise<void>
```

- **Contracts:** `setStaffPasswordsInput = { importId, passwords: { rowNumber, password: newPassword }[] (1..25) }`.
- **`addImported`** (B45, B47, D24, D25) runs in one identity transaction with `{ timeout: 30_000 }`. It:
  1. holds the organization's row (`FOR NO KEY UPDATE`);
  2. checks `assertSeatsFree` for the whole file;
  3. writes each account through `insertStaffAccount` with `mustChangePassword: true`;
  4. runs `afterwards`, which links the rows to their members and clears every hash.
- **The add listener** acts only on a `staff` batch that is `adding`. It:
  1. checks `importerAccess` with `staff:manage`;
  2. reads the file again and checks every row again;
  3. calls `addImported`;
  4. calls `finishImport(…, { status: "done", report: false, notifyImporter: false, … })`.
  - On a row's refusal or `IMPORT_OVER_SEAT_LIMIT`, it returns the batch to `checked` with D24's reason.

- [ ] **Step 1: Write the failing tests.**

```ts
it("keeps only each password's hash on its row, 25 to a call, never for a row not to be added", …)
it("takes a batch of passwords sent again in place of the first", …)
it("adds every ready row in one transaction, each with a temporary password to change, each row linked to its member", …)
it("refuses the whole file past the seats: IMPORT_OVER_SEAT_LIMIT", …)
it("lets only one of two imports racing for the last seats add, and an Add staff racing them", …)
it("returns the import to the preview when a row fails now, its row marked, every hash cleared", …)
it("records staff.created with the import's id, and import.finished, and notifies nobody", …)
it("fails for an importer who lost staff:manage", …)
// staff-passwords-never-kept.test.ts (the api and worker flow): grep for the plain passwords
it("never keeps a password in a job's data, the database or a log", …) // pgboss.job data, every text column, the captured process log
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gate's first line.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(identity): add an imported team at once, each with a temporary password`.

### Task 3.4: The `staffImports` procedures

**Files:**

- Modify `packages/api/src/routers/staff-imports.ts`.
- Test `apps/api/test/staff-imports.test.ts`.

**Interfaces:**

- Every procedure is on `freshProcedure.requires("staff:manage")` (core):
  - `start`, `confirmUpload`;
  - `match(matchStaffColumnsInput)`;
  - `setPasswords(setStaffPasswordsInput)`;
  - `add`, `cancel`;
  - `get → staffImportDetail`, `rows`, `recent`.
- `add` refuses `IMPORT_OVER_SEAT_LIMIT` when the rows to add pass the seats free.

- [ ] **Step 1: Write the failing tests.**

```ts
it("puts every staff import procedure on a fresh session with staff:manage, on core", …)
it("refuses Add over the seat limit: IMPORT_OVER_SEAT_LIMIT", …)
it("refuses setPasswords for more than 25 at once", …)
it("imports five staff with roles through the worker; each signs in with the organization code and must choose a password", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the gate's first line.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(api): the staffImports procedures`.

### Task 3.5: The staff export

**Files:**

- Create `packages/domain/src/identity/staff-export-rows.ts`.
- Modify:
  - `packages/domain/src/exports/{staff-export,index}.ts`;
  - `identity/{identity,index}.ts` (`staff.exportRows`);
  - `packages/api/src/routers/staff-exports.ts`.
- Test:
  - `packages/domain/test/exports/staff-export.test.ts`;
  - `apps/api/test/staff-exports.test.ts`.

**Interfaces:**

- `staff.exportRows(actor: MemberAccess): Promise<StaffExportRow[]>`: B52's fields, the active staff oldest first, an
  email only when it isn't a placeholder.
- `makeStaffExportListener(dependencies)`: `runExport` with a one-page source named `staff-yyyy-mm-dd`.
- `staffExports`: `start(startStaffExportInput)`, `get`, `downloadLink`, on
  `freshProcedure.requires("staff:manage").meta({ lifecycle: "export" })`.

- [ ] **Step 1: Write the failing tests.**

```ts
it("exports the active staff oldest first: Name, Username, Email (blank without one), Phone, Role, Joined, Status, Last active", …)
it("names the file staff-2026-10-19.xlsx and records export.made", …)
it("starts, follows and downloads a staff export on a fresh session with staff:manage; another's is NOT_FOUND", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(exports): export the staff list`.

### Task 3.6: Screens: the staff import and the one-time password sheet

**Files:**

- Create:
  - `apps/web/src/app/(app)/staff/import/page.tsx` and `apps/web/src/app/(app)/staff/import/[importId]/page.tsx`
    (`staff:manage`);
  - `apps/web/src/organization/staff/import/{staff-import-screen,staff-choose-file,staff-match-step,staff-check-step,passwords-step,lost-passwords}.tsx`;
  - `apps/web/src/organization/staff/import/{password-store,password-sheet,use-staff-import}.ts`;
  - `apps/web/public/samples/staff-sample.csv`.
- Modify `staff.json`'s `import` key.
- Test `apps/web/test/organization/staff/import/{staff-match-step,staff-check-step,passwords-step,password-sheet,password-store}.test.tsx`.

**Interfaces:**

- `password-store.ts` is a module-level `Map<importId, Map<rowNumber, string>>`, emptied when the import's screen
  unmounts. It is never in the query cache, IndexedDB or web storage (B46, B48).
- `passwordSheet(people, organizationCode, signInUrl): Blob`:
  - CSV columns: Name, Username, Email, Temporary password, Organization code, Sign-in page;
  - D26's formula rule;
  - a UTF-8 byte-order mark and CRLF line ends.

- [ ] **Step 1: Write the failing tests.**

```tsx
it("asks 'Give everyone the role: Sales' without a Role column, and matches a Role column's values", …)
it("lists every row not added, Already on your staff apart, and shows 'Adds 12 people: your plan has 14 seats free.'", …)
it("turns Add off over the seats with 'This file adds 16 people, and your plan has 14 seats free. Leave some rows out, or ask us about more seats.' and the support contact", …)
it("asks 'Add 12 people? Each gets a temporary password, shown once on the next screen.', makes the passwords in the browser and sends them 25 at a time", …)
it("keeps Add busy while the passwords are sent and the job runs, and drops them if the import returns to the preview", …)
it("shows each password once with CopyButton, downloads the sheet, and reads Downloaded after", …)
it("writes the sheet's six columns, formula-safe", …) // "=cmd" → "'=cmd"
it("forgets the passwords on leaving; coming back offers new passwords for the 9 who haven't signed in", …) // staff.resetPassword, one at a time
it("keeps passwords out of the query cache, IndexedDB and web storage", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Build it** from 0.12's pieces and `temporaryPassword()`. Under the passwords: "Each person chooses their
  own password when they first sign in, with the organization code SHARMA."
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(web): the staff import, with a password sheet shown once`.

### Task 3.7: Screens: Import and Export on Staff, and the staff export's page

**Files:**

- Create:
  - `apps/web/src/organization/staff/{staff-header-actions,export/staff-export-button,export/staff-export-screen}.tsx`;
  - `apps/web/src/app/(app)/staff/exports/[exportId]/page.tsx`.
- Modify:
  - `apps/web/src/organization/staff/staff-screen.tsx` (the header's action);
  - `staff.json`.
- Test `apps/web/test/organization/staff/{staff-header-actions,staff-export}.test.tsx`.

- [ ] **Step 1: Write the failing tests.**

```tsx
it("keeps Add staff primary, with Import and Export outline beside it", …)
it("turns Import off with its hint while the agency can't make changes, and leaves Export working", …)
it("exports '18 people, with their roles and joined dates' and downloads the file", …)
```

- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Build it** from 0.13's `ExportDialog` and `ExportScreen`.
- [ ] **Step 4: Run the whole gate.** The Staff screen changed. Expected: PASS.
- [ ] **Step 5: Commit.** Message: `feat(web): import and export on Staff, and the staff export's page`.

### Task 3.8: 500 people at speed, journeys, the visual audit, and the merge

**Files:**

- Create:
  - `packages/domain/test/performance/staff-import-at-scale.test.ts`;
  - `apps/api/test/staff-passwords-timing.test.ts`;
  - `apps/web/test/e2e/staff-{import,import-seats,export,read-only}.spec.ts`;
  - `apps/web/test/e2e/audit/11-staff-bulk.audit.ts`.

- [ ] **Step 1: Write the tests.**

```ts
it("hashes 25 passwords a call within 5 s", …) // staff-passwords-timing.test.ts, Better Auth's real hasher
it("adds 500 people in one transaction within 10 s", …)
it("reads the staff export's rows within 150 ms", …)
// journeys, phone and desktop, axe after each
test("import five staff with roles, download the passwords; one signs in with the organization code and must choose a password", …)
test("a staff file over the seat limit: Add is off with the sentence, and the api refuses it too", …)
test("export the staff list", …)
test("a read-only agency: Import is off with its hint, and Export still works", …)
```

- [ ] **Step 2: Run them until they pass.**
- [ ] **Step 3: Write the camera file.** It shoots 0.13's staff shots. Run the visual audit loop until no must is left.
- [ ] **Step 4: Run the merge gate.** Expected: PASS: `migrations:check` takes `20261021100000_staff_phone`.
- [ ] **Step 5: Commit.** Message: `test(web): the staff import and export journeys and audit shots`. Then merge.

---

## Spec coverage (self-review)

| Spec                                                                                   | Where                                                    |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1 goals and anti-goals: no parser in the browser, no kept password, short-lived files, one notice, memory | 0.1, 0.12 (D10-D12); 3.3, 3.6; 0.10; 1.4; 2.4             |
| 2 who uses it                                                                          | 1.5, 2.2, 3.4; 1.6, 2.3, 3.7                             |
| 3.1 header buttons                                                                     | 0.13 (slot), 1.6, 2.3, 3.7; D2                           |
| 3.2 the four steps, states, upload, Recent imports                                     | 0.12; 1.6, 1.7                                           |
| 3.3 export dialog and page                                                             | 0.13; 2.3                                                |
| 3.4 staff import's differences                                                         | 3.2, 3.6; D22                                            |
| 3.5 staff export                                                                       | 3.5, 3.7                                                 |
| B1-B7 files and reading                                                                | 0.1, 0.2, 0.4, 0.6; B7 through the files module          |
| B8-B13 matching                                                                        | 0.3, 0.5, 0.6, 0.7; 1.3                                  |
| B14-B24 a lead row                                                                     | 1.1, 1.2                                                 |
| B25-B32 check and add                                                                  | 1.3, 1.4; 0.4 (B29, B31)                                 |
| B33-B36 rows not added, uploading again, the report                                   | 0.8; 1.3, 1.5, 1.7                                       |
| B37-B42 lead export                                                                    | 0.9; 2.1, 2.2                                            |
| B43-B51 staff import and phones                                                        | 3.1-3.4, 3.6                                             |
| B52 staff export                                                                       | 3.5                                                      |
| B53-B55 keeping and deleting                                                           | 0.10                                                     |
| 5 data                                                                                 | 0.2 (D4, D7); 3.1                                        |
| 6.1-6.6 modules, procedures, web pieces                                                | 0.1, 0.3-0.13; 1.5, 2.2, 3.4, 3.5                        |
| 7 jobs and events, the sweep                                                           | 0.4, 0.6-0.11; 1.3, 1.4, 2.1, 3.2, 3.3, 3.5              |
| 8 audit and notifications                                                              | 0.4, 0.8, 0.9; 1.4; 3.1, 3.3 (D20, D21)                  |
| 9 erasure and purge                                                                    | 0.10; 3.1 (a member's phone)                             |
| 10 the demo                                                                            | 1.8                                                      |
| 11 performance                                                                         | 0.11, 1.8, 2.4, 3.8                                      |
| 12 journeys 1-9, the builders' tests, the visual audit                                 | 1.9 (1-4, 9), 2.4 (5, 9), 3.8 (6-9); each task's Step 1  |
| 13 build order                                                                         | the branches and ownership tables                        |
