# How agents work on travel-crm: the method and the lessons

What the Foundation (plans 1 to 5C, October 2026) taught about building this product with Claude agents. Read it
before a feature, a fix wave or a review, together with `CLAUDE.md`, `DESIGN.md` and, for screens,
[ui-build-loop.md](ui-build-loop.md).

## 1. Shape of the work

- **Spec, then plan, then build.**
  - A module starts as a short spec in `docs/superpowers/specs/`, then a plan in `docs/superpowers/plans/`, with tasks
    and the exact tests.
  - The spec is the authority. Where the plan and the spec disagree, the spec wins, and the decision is recorded.
- **Record every decision as a ruling,** in the plan's ledger: `Ruling: <what> — <why> — <cost if wrong>`. Decide;
  don't park the work on a question unless it's destructive, security-sensitive, outward-facing, or the owner's to
  make (money, accounts, pushes, product choices).
- **Keep a ledger and a resume file.**
  - The run's ledger is `.superpowers/sdd/<plan>/progress.md`, a resume map that survives context compaction.
  - `.superpowers/sdd/CONTROLLER-STATE.md` says where things stand.
  - After a compaction, trust the ledger and `git log` over memory.
- **Run tracks in parallel, split by file ownership.**
  - Each builder or fixer works in its own git worktree and branch from the same base, and owns a list of files.
  - A change another owner's file needs goes under "Needs from others" in the report, never into that file.
  - Merge conflicts are then mostly import lines.
- **Build the shared pieces first.**
  - Parallel builders each invent their own dialog, field or helper, and the final review then finds three copies.
  - When a fix or feature needs a shared component, build and merge it first (one builder), then let every track
    adopt it.
- **Brief by file, not by pasted text.**
  - A brief is a file. The rules every builder follows are another file, and findings live in their own files.
  - The dispatch says where these are, what the builder can't know, and the report contract.
  - Some sessions refuse report files from subagents. Then the report comes back as the final message, and the
    controller saves it.

## 2. Reviews that catch what tests don't

- **Per task or track:** a reviewer reads the brief and the diff, then judges spec compliance (missing, extra,
  misunderstood), security, error handling, tests that check what they claim, accessibility and the owner's UI rules.
  Every finding gets file:line and a severity: Critical, Important or Minor.
- **Then a fix wave** by file ownership, and a **scoped re-review** of each fix diff (fixed, partly fixed, not fixed
  or ruled, and anything the fix broke).
- **A final whole-branch review in slices** (server and security; agency screens; console and release). It hunts
  seams: an api kind the screen ignores, a refusal with no sentence, the same thing built twice, docs that disagree
  with the code.
- **Then one fix dispatch, one re-check, and the merge.** Minors that can wait are listed as carried items, with the
  reason.
- **Screens also get the visual audit** described in [ui-build-loop.md](ui-build-loop.md).
- **Verify before claiming.** Before saying something works, run the real app and walk it in a browser on a phone
  size and a desktop size. "The tests pass" is not "it works".

## 3. The gate and the machine

- **`pnpm check`** covers format, typecheck, lint, unit tests and import rules. The full gate adds the journeys on
  phone and desktop, with axe after each test, plus `migrations:check`, `workflows:lint`, `scripts:test`,
  `images:smoke`, `product:smoke` and `lighthouse`. Each step runs in the foreground, at most 10 minutes per call.
- **Docker has 8 GB.**
  - Run at most two or three full gates at once.
  - Use `turbo … --concurrency=2` or `3`.
  - Timing tests (`relay.test.ts`, `counters.test.ts`) flake under heavy load. Re-run alone before calling it a
    failure.
- **Agents run checks in the foreground.**
  - An agent that started a check in the background and "waits" for it can miss its end and stall.
  - If an agent goes quiet, look for its processes (`ps`, `docker ps`) and its commits, then nudge it.
- **Messages from agents can arrive only between the controller's turns.** While waiting, watch the files and
  commits, and end the turn when the next step depends on a message.
- **Compose and the owner's containers:**
  - Every compose-wrapping script goes through `scripts/dev/compose.sh`.
  - A clone or worktree must set its own `COMPOSE_PROJECT_NAME` and check `scripts/dev/compose.sh --print-name`
    before any compose command.
  - Never copy the owner's `.env` (it pins `travel-crm`).
  - Once, a clone's `pnpm dev --help` recreated the owner's Postgres. Never `--help` an unknown pnpm script.
- **Running one journey:** `pnpm --filter @travel-crm/web e2e -- <spec>` runs every journey. Use
  `./node_modules/.bin/playwright test test/e2e/<spec>` from `apps/web`.
- **A Playwright run empties its output folder as it starts.** Until release 1 the journeys wrote to
  `apps/web/test-results`, the visual audit's default `AUDIT_OUT` lived inside it, and one journey run wiped a round
  of shots before its review. The journeys now write to `test-results/journeys`; still keep each audit round in a
  folder of its own (`AUDIT_OUT=test-results/audit/round-2`).
- **Never `git stash`.** The stash is one stack shared by every worktree of the repository, so two builders' stashes
  cross: in release 1, G's pop took C's entry and C's took G's. lint-staged's pre-commit backup uses git's stash too,
  so commits in two worktrees at once can meet there. Set a file aside by copying it to the scratchpad, or commit.
- **A fresh worktree** needs `pnpm install`, `pnpm --filter @travel-crm/db generate`,
  `pnpm --filter @travel-crm/brand build` and `pnpm --filter @travel-crm/web generate` before a journey. A failed
  first build leaves a `.next` that keeps failing until it's removed.
- **Commits:**
  - Conventional Commits, with the header at 100 characters at most (commitlint);
  - stage files by name;
  - never `--no-verify`;
  - no `Co-Authored-By` trailer.
- **Merging and pushing:** merge commits on `main` use `chore: merge …`. The owner allows pushing `main` to origin
  after a merge whose full gate is green.

## 4. Security lessons from the reviews

- **Image uploads (logos):**
  - Check what the decoder will really read, not just the header. png-js lets every IHDR chunk overwrite the size,
    inflates all IDAT data at once, and throws uncaught on an unknown filter type or a narrow interlaced file.
    jay-peg's EXIF reader can allocate gigabytes from a 130-byte JPEG.
  - So validate at upload confirm AND before the worker renders: one IHDR, a bounded inflate, filter bytes 0-4, no
    interlacing, and JPEGs redrawn from their drawing segments only. Test it with a fuzzer.
- **Exports and downloads** read the session from the database (`freshProcedure`), never the 5-minute cookie cache.
- **Lifecycle kinds:** every call has a kind (view, change, export, revoke). A suspended Owner keeps export and revoke
  calls, so the screens must follow the same kinds, and the locks must open those screens.
- **Better Auth:**
  - The `trustDevice` body flag is honoured for anyone, so platform staff needed a before-hook.
  - Two-factor is now off behind one constant, `features.twoFactor` in `packages/contracts`. Turning it on enforces
    the stored requirements and asks for the old secrets at once.
- **Upload limits:**
  - A pending upload stops counting toward storage once its link lapses, so a late confirm must check the limit
    again, under a lock.
  - The browser keeps the chosen file for Try again. The retry reuses the signed upload while it is valid, and
    otherwise signs anew.
- **Images and ports:**
  - `.dockerignore` needs `**/.env` and `**/.env.*` (Next copies `.env*` into its standalone output).
  - Published ports bind `127.0.0.1`.
- **Unsubscribe:** every email's link opens `/account/notifications`. Keep it open in every subscription state
  (DPDP).

## 5. Product rules agents keep forgetting

- **Organization data:** stays inside `db.forOrg()` and RLS. Soft delete only; permanent deletion is the platform's.
- **Query plans under RLS:**
  - Check a plan with `EXPLAIN` as `app_runtime` inside `forOrg()` (with `app.org_id` set), never as the migrator or
    the platform role. Row-level security changes the plans, so a plan read as a privileged role proves nothing.
  - Under row-level security Postgres makes an index condition only of a leakproof operator. `LIKE`, `ILIKE` and
    pg_trgm's similarity operators are not, so a trigram index can't serve a search there (ADR 0028). Test such a
    query against a time budget at the seeded size instead of asserting its index.
- **Product identity:** the name, contacts and colours come from `@travel-crm/brand`. The support email is the
  owner's for now; the phone is `null` until given, and `null` contacts are hidden.
- **Dates:** a displayed date reads "16 Oct" (`formatDay` / `formatCalendarDay`); dd/mm/yyyy appears only in date
  inputs.
- **Money:** in paise, shown as ₹ with lakh grouping, with GST shown separately.
- **Refusals:** every api refusal code has a sentence in `errors.json`, and the screens show it: `ErrorState`,
  `RefusalAlert`, `WriteHint`.
- **Owner items:** anything that needs the owner (prices, legal name, accounts, hosting) is written down for the owner,
  never invented as final.
