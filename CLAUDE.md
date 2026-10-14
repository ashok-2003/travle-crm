# travel-crm

Subscription CRM and operations platform for Indian travel agencies. Each agency is an **organization**.
The design is in `docs/superpowers/specs/`, the build plans in `docs/superpowers/plans/`, and decisions in `docs/adr/`.

## Commands (always under Node 24)

Start every shell command with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&`.

| Command                             | What it does                                             |
| ----------------------------------- | -------------------------------------------------------- |
| `pnpm install`                      | install dependencies                                     |
| `pnpm db:up` / `pnpm db:down`       | start / stop local Postgres (Docker)                     |
| `pnpm db:migrate`                   | apply migrations to local Postgres                       |
| `pnpm format`                       | format every file with Prettier                          |
| `pnpm check`                        | everything CI runs: typecheck, lint, tests, import rules |
| `pnpm --filter @travel-crm/db test` | one package's tests (needs Docker running)               |

## How we write code

- **Test first.** Write the failing test, watch it fail, then make it pass. "Done" means `pnpm check` is green.
- **Readable over clever.** Small single-purpose files (~200 lines is a smell), clear names, no abbreviations in public names.
  Each source file starts with a one-line comment saying what it is for. Comments explain _why_.
- **Strict TypeScript.** No `any`, no `!` non-null assertions, no ignored build errors.
- **Pinned versions.** Shared tool versions live in the `catalog:` in `pnpm-workspace.yaml`. Prisma is pinned to 7.10.0;
  npm's `latest` for `prisma` is an 8.0 release candidate. Never install "latest" without checking.
- **Commits.** Small, Conventional Commits (`feat(db): …`), enforced by commitlint. Git hooks format and lint staged files;
  never bypass them with `--no-verify`. Never add a `Co-Authored-By` trailer. Never commit `.env` files or secrets.

## Data rules (non-negotiable)

- Organization data is read and written only inside `db.forOrg(orgId, tx => …)` from `@travel-crm/db`.
  Postgres row-level security then limits every query to that organization; with no organization set, queries see nothing.
- Every table with an `organization_id` column needs, in the migration that creates it:
  `SELECT app_enable_org_rls('<table_name>');`, plus a row-creating entry in `packages/db/test/org-table-fixtures.ts`.
  The test suite fails without both. See `packages/db/README.md` for the full recipe.
- Only the platform console uses `@travel-crm/db/platform` (it sees every organization).
- IDs are UUID v7 (`@default(uuid(7)) @db.Uuid`). Money is never a float.

## Repo map

- `packages/db`: Prisma schema, migrations, RLS, `forOrg`, document numbers.
- `packages/tsconfig`, `packages/eslint-config`: shared settings.
