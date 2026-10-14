# Foundation 01: Repo and Data Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pnpm + Turborepo monorepo whose `@travel-crm/db` package gives every later module a Postgres database where organizations' data is kept apart by Postgres row-level security, reached only through `db.forOrg()`, with tests that prove it.

**Architecture:**
- `packages/db` owns the Prisma 7 schema, the SQL migrations (including the RLS policies), the three database roles, and a small public API:
  - `createDatabase(url).forOrg(orgId, fn)`
  - `createPlatformClient(url)`
  - `nextDocumentNumber(tx, …)`
- Tests run against a real Postgres 18 started by Testcontainers. Every pull request checks:
  - organization isolation, for every table that carries `organization_id`
  - that every such table has its RLS policies

**Tech Stack:**
- Node 24 LTS; pnpm 12.11.2; Turborepo 2.11.8
- TypeScript 6.0.3 (strict, NodeNext)
- Prisma 7.10.0 with `@prisma/adapter-pg`; Postgres 18
- Vitest 5.0.4 with `@testcontainers/postgresql` 12.2.1
- ESLint 10 with typescript-eslint 8.71 (type-aware)
- dependency-cruiser 18.6.0

**Spec:** `docs/superpowers/specs/2026-10-13-foundation-design.md` (sections 3, 4, 12). This is plan 1 of 5 for the Foundation:

1. Repo and data isolation (this plan)
2. API and identity
3. Shared services
4. Platform and subscriptions
5. Web app and release

## Global Constraints

- **Node 24 for every command, from the repo root.** Every shell call starts in another directory, so prefix each shell command with `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null &&` (`nvm use` reads `.nvmrc`). Node 22 remains the machine default; do not change it.
- **Pinned versions.** Use these exact versions, and never let a command pick "latest":
  - Packages: `prisma`/`@prisma/client`/`@prisma/adapter-pg` 7.10.0, `typescript` 6.0.3, `vitest` 5.0.4, `eslint` 10.12.0, `@eslint/js` 10.0.1, `typescript-eslint` 8.71.2, `turbo` 2.11.8, `pnpm` 12.11.2, `pg` and `@types/pg` 8.23.1, `@types/node` 24.19.2, `@testcontainers/postgresql` 12.2.1, `dotenv` 18.0.7, `dependency-cruiser` 18.6.0.
  - Postgres image: `postgres:18-alpine`.
  - `npm`'s `latest` tag for `prisma` is an 8.0 release candidate. Do not use it.
- **Naming.** The tenant is an **organization**: column `organization_id`, Prisma field `organizationId`, setting `app.org_id`, function `forOrg`. Package scope is `@travel-crm/*`. Database tables and columns are snake_case (`@@map`/`@map`); Prisma models are PascalCase.
- **Readable code.** Files stay small and single-purpose; a file over ~200 lines needs a reason. Every source file opens with a one-line comment saying what it is for. Comments explain *why*, not *what*. No abbreviations in public names.
- **Data rules.**
  - Organization data is reached only through `db.forOrg()`.
  - Every table with an `organization_id` column gets `SELECT app_enable_org_rls('<table>');` in the migration that creates it, plus an entry in `packages/db/test/org-table-fixtures.ts`.
- **Commits.** Small commits with messages like `feat(db): …`, `chore: …`, `test(db): …`. **Never add a `Co-Authored-By` trailer.** The owner's global instructions forbid it. No secrets or `.env` files in git.
- **Git.** Work on branch `foundation/01-data`. Don't push; there is no remote.

## Review Focus

These failure modes are implied by the spec but easy to miss. Each one is pinned by a test in the task named.

1. **A pooled connection reused after a `forOrg` transaction must return 0 organization rows, not raise an error and not show the previous organization's rows.** Postgres reads the cleared setting back as `''`, not NULL. Pinned in Task 3: "does not leak the organization to the next query on the same connection".
2. **A malformed organization id must be rejected with `InvalidOrganizationIdError` before any SQL runs.** Examples: `""`, `"abc"`, an SQL fragment. Pinned in Task 3.
3. **A document counter past 9999 must keep going (`BK-2026-10000`) and never repeat under concurrency.** Pinned in Task 4.
4. **The runtime role must not be able to create tables or read `_prisma_migrations`.** It must not see past RLS through schema changes. Pinned in Task 2.
5. **A new table with `organization_id` but without the policies must fail the test suite.** Pinned in Task 5 by a negative probe that creates such a table inside a rolled-back transaction.

## File Structure

```
travel-crm/
├── .nvmrc                         Node 24
├── .gitignore
├── .env.example                   local database URLs (dev-only passwords)
├── .dependency-cruiser.cjs        import rules checked in CI
├── .github/workflows/ci.yml       CI: install, then `pnpm check`
├── CLAUDE.md                      conventions for anyone (human or AI) writing code here
├── README.md                      what this is, how to run it
├── docker-compose.yml             local Postgres 18 with the three roles
├── package.json                   root scripts (turbo), pinned tool versions
├── pnpm-workspace.yaml            workspace, version catalog, approved build scripts
├── turbo.json                     task graph
├── docs/adr/                      architecture decision records
│   ├── README.md
│   ├── 0001-toolchain.md
│   └── 0002-row-level-security.md
└── packages/
    ├── tsconfig/                  shared strict TypeScript settings
    │   ├── package.json
    │   └── base.json
    ├── eslint-config/             shared ESLint flat config
    │   ├── package.json
    │   └── index.js
    └── db/                        @travel-crm/db
        ├── package.json
        ├── README.md              how to add an organization-owned table
        ├── tsconfig.json
        ├── eslint.config.js
        ├── vitest.config.ts
        ├── prisma.config.ts
        ├── sql/bootstrap.sql      creates the three roles (local and tests)
        ├── prisma/schema/
        │   ├── base.prisma        generator + datasource
        │   ├── organization.prisma
        │   └── org-counter.prisma
        ├── prisma/migrations/     generated by Prisma, RLS SQL appended by hand
        ├── src/
        │   ├── index.ts           public API
        │   ├── platform.ts        platform-console entry point
        │   ├── client.ts          PrismaClient factory (internal)
        │   ├── for-org.ts         forOrg + InvalidOrganizationIdError
        │   ├── database.ts        createDatabase
        │   ├── counters.ts        nextDocumentNumber
        │   └── generated/         Prisma output (git-ignored)
        └── test/
            ├── global-setup.ts    Testcontainers Postgres, roles, migrations, drift check
            ├── helpers.ts         createTestOrganization
            ├── org-table-fixtures.ts
            ├── database-setup.test.ts
            ├── for-org.test.ts
            ├── counters.test.ts
            ├── isolation.test.ts
            └── schema-check.test.ts
```

---

### Task 1: Workspace and tooling

**Files:**
- Create: `.nvmrc`, `.gitignore`, `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.dependency-cruiser.cjs`, `CLAUDE.md`, `README.md`, `docs/adr/README.md`, `docs/adr/0001-toolchain.md`
- Create: `packages/tsconfig/package.json`, `packages/tsconfig/base.json`
- Create: `packages/eslint-config/package.json`, `packages/eslint-config/index.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `@travel-crm/tsconfig/base.json`, which packages extend with `"extends": "@travel-crm/tsconfig/base.json"`.
  - `@travel-crm/eslint-config`, exporting `base({ tsconfigRootDir, ignores? })`, used as `export default base({ tsconfigRootDir: import.meta.dirname })`.
  - Root scripts `typecheck`, `lint`, `test`, `depcruise`, `check`, `db:up`, `db:down`, `db:migrate`.
  - The pnpm catalog. Packages reference `"catalog:"` for typescript, @types/node, vitest, eslint and the prisma packages.

- [ ] **Step 1: Write `.nvmrc`, `.gitignore`**

`.nvmrc`:
```
24
```

`.gitignore`:
```
node_modules/
.turbo/
.next/
.vitest/
coverage/
dist/
*.tsbuildinfo
next-env.d.ts
.env
.env.*
!.env.example
**/src/generated/
.DS_Store
```

- [ ] **Step 2: Write the root `package.json`**

```json
{
  "name": "travel-crm",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@12.11.2",
  "engines": { "node": ">=24" },
  "scripts": {
    "typecheck": "turbo run typecheck",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "depcruise": "depcruise packages --config .dependency-cruiser.cjs",
    "check": "turbo run typecheck lint test && pnpm run depcruise",
    "db:up": "docker compose up -d --wait postgres",
    "db:down": "docker compose down",
    "db:migrate": "pnpm --filter @travel-crm/db db:migrate:deploy"
  },
  "devDependencies": {
    "dependency-cruiser": "18.6.0",
    "turbo": "2.11.8",
    "typescript": "catalog:"
  }
}
```

- [ ] **Step 3: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"

# One version of each shared tool across the repo. Packages refer to these as "catalog:".
catalog:
  typescript: 6.0.3
  "@types/node": 24.19.2
  vitest: 5.0.4
  eslint: 10.12.0
  prisma: 7.10.0
  "@prisma/client": 7.10.0
  "@prisma/adapter-pg": 7.10.0

# pnpm 12 refuses to run install scripts unless approved here.
# Prisma and esbuild need theirs; the others come in through testcontainers and are not needed.
allowBuilds:
  "@prisma/engines": true
  prisma: true
  esbuild: true
  cpu-features: false
  protobufjs: false
  ssh2: false
```

- [ ] **Step 4: Write `turbo.json`**

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "ui": "stream",
  "globalPassThroughEnv": ["PRISMA_HIDE_UPDATE_MESSAGE"],
  "tasks": {
    "generate": {
      "dependsOn": ["^generate"],
      "inputs": ["prisma/schema/**", "prisma.config.ts", "package.json"],
      "outputs": ["src/generated/**"]
    },
    "build": { "dependsOn": ["^build", "generate", "^generate"], "outputs": [".next/**", "!.next/cache/**", "dist/**"] },
    "typecheck": { "dependsOn": ["generate", "^generate"], "outputs": [] },
    "lint": { "dependsOn": ["generate", "^generate"], "outputs": [] },
    "test": {
      "dependsOn": ["generate", "^generate"],
      "outputs": [],
      "passThroughEnv": ["DOCKER_HOST", "TESTCONTAINERS_*"]
    },
    "db:migrate:deploy": { "cache": false, "env": ["DATABASE_MIGRATOR_URL"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

- [ ] **Step 5: Write the shared TypeScript config**

`packages/tsconfig/package.json`:
```json
{
  "name": "@travel-crm/tsconfig",
  "version": "0.0.0",
  "private": true,
  "files": ["base.json"],
  "exports": { "./base.json": "./base.json" }
}
```

`packages/tsconfig/base.json`:
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

- [ ] **Step 6: Write the shared ESLint config**

`packages/eslint-config/package.json`:
```json
{
  "name": "@travel-crm/eslint-config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./index.js" },
  "dependencies": {
    "@eslint/js": "10.0.1",
    "typescript-eslint": "8.71.2"
  },
  "devDependencies": {
    "eslint": "catalog:",
    "typescript": "catalog:"
  },
  "peerDependencies": { "eslint": ">=10" }
}
```
The `typescript` devDependency is required. Without it, pnpm resolves typescript-eslint's peer to TypeScript 7, which typescript-eslint rejects at import time.

`packages/eslint-config/index.js`:
```js
// Shared ESLint flat config: strict, type-aware TypeScript rules for every package.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

/**
 * @param {{ tsconfigRootDir: string, ignores?: string[] }} options
 */
export function base({ tsconfigRootDir, ignores = [] }) {
  return defineConfig(
    globalIgnores(["**/dist/**", "**/.turbo/**", "**/generated/**", "**/coverage/**", "**/.vitest/**", ...ignores]),
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: { parserOptions: { projectService: true, tsconfigRootDir } },
      rules: {
        "@typescript-eslint/consistent-type-imports": "error",
        "@typescript-eslint/no-floating-promises": "error",
      },
    },
    { files: ["**/*.js", "**/*.mjs", "**/*.cjs"], extends: [tseslint.configs.disableTypeChecked] },
  );
}
```

- [ ] **Step 7: Install and approve build scripts**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install`

Expected: success, writing `pnpm-lock.yaml`.
- If pnpm reports `ERR_PNPM_IGNORED_BUILDS`, run `pnpm approve-builds @prisma/engines prisma esbuild '!cpu-features' '!ssh2' '!protobufjs'` and install again.
- If pnpm adds a `minimumReleaseAgeExclude:` list to `pnpm-workspace.yaml` (it does this for packages published in the last 24 hours), keep it.

- [ ] **Step 8: Generate and edit the dependency-cruiser config**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm exec depcruise --init oneshot`

This writes `.dependency-cruiser.cjs`. Make four edits to it:
1. In the `not-to-dev-dep` rule, set `from: { path: '^(apps|packages)/[^/]+/(src|app)/' }`.
2. In the `no-circular` rule, set `severity: 'error'`.
3. In `options`, set `exclude: { path: '(^|/)src/generated/|(^|/)\\.next/|next-env\\.d\\.ts$' }` and `tsPreCompilationDeps: true`.
4. Add this rule as the first entry of `forbidden`:
```js
    {
      name: 'db-internals-stay-in-db',
      comment:
        'Other packages reach @travel-crm/db only through its public entry points (index.ts, platform.ts), ' +
        'so the raw Prisma client and the generated code never leak out of the package.',
      severity: 'error',
      from: { path: '^(apps|packages)/', pathNot: '^packages/db/' },
      to: { path: '^packages/db/src/', pathNot: '^packages/db/src/(index|platform)\\.ts$' },
    },
```

- [ ] **Step 9: Verify the tooling runs**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run depcruise && pnpm --filter @travel-crm/eslint-config exec node -e "import('./index.js').then((m) => console.log(typeof m.base))" && pnpm exec tsc --version`

Expected:
- depcruise reports `no dependency violations found`.
- The import prints `function`. If it crashes with "does not support TS 7.0", the eslint-config package is missing its own `typescript` devDependency.
- tsc prints `Version 6.0.3`.

Linting real TypeScript is first exercised in Task 2, which adds the first package with code.

- [ ] **Step 10: Write `CLAUDE.md`**

```markdown
# travel-crm

Subscription CRM and operations platform for Indian travel agencies. Each agency is an **organization**.
The design is in `docs/superpowers/specs/`, the build plans in `docs/superpowers/plans/`, and decisions in `docs/adr/`.

## Commands (always under Node 24)

Start every shell command with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&`.

| Command | What it does |
|---|---|
| `pnpm install` | install dependencies |
| `pnpm db:up` / `pnpm db:down` | start / stop local Postgres (Docker) |
| `pnpm db:migrate` | apply migrations to local Postgres |
| `pnpm check` | everything CI runs: typecheck, lint, tests, import rules |
| `pnpm --filter @travel-crm/db test` | one package's tests (needs Docker running) |

## How we write code

- **Test first.** Write the failing test, watch it fail, then make it pass. "Done" means `pnpm check` is green.
- **Readable over clever.** Small single-purpose files (~200 lines is a smell), clear names, no abbreviations in public names.
  Each source file starts with a one-line comment saying what it is for. Comments explain *why*.
- **Strict TypeScript.** No `any`, no `!` non-null assertions, no ignored build errors.
- **Pinned versions.** Shared tool versions live in the `catalog:` in `pnpm-workspace.yaml`. Prisma is pinned to 7.10.0;
  npm's `latest` for `prisma` is an 8.0 release candidate. Never install "latest" without checking.
- **Commits.** Small, with messages like `feat(db): …`. Never add a `Co-Authored-By` trailer. Never commit `.env` files or secrets.

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
```

- [ ] **Step 11: Write `README.md` and the ADRs**

`README.md`:
```markdown
# travel-crm

The platform that runs Indian travel agencies: leads, WhatsApp, quotes, departures, suppliers and GST accounts.

## Run it locally

You need Node 24 (`nvm install 24`), pnpm 12 and Docker.

    nvm use
    pnpm install
    cp .env.example .env
    pnpm db:up        # Postgres 18 on localhost:55432
    pnpm db:migrate
    pnpm check        # typecheck, lint, tests, import rules

## Where things are

- `docs/superpowers/specs/`: what we are building and why
- `docs/superpowers/plans/`: step-by-step build plans
- `docs/adr/`: decisions and their reasons
- `packages/db/`: database schema, migrations and organization isolation ([README](packages/db/README.md))
- `CLAUDE.md`: the conventions every contributor follows
```

`docs/adr/README.md`:
```markdown
# Architecture decision records

Each record states a decision, the context, and the consequences, so it can be revisited knowingly.
The first and largest set of decisions is the Foundation spec: `docs/superpowers/specs/2026-10-13-foundation-design.md`.

| # | Decision |
|---|---|
| [0001](0001-toolchain.md) | Toolchain versions: Node 24, pnpm 12, TypeScript 6.0.3, Prisma 7.10 |
| [0002](0002-row-level-security.md) | How organization isolation is implemented in Postgres |
```

`docs/adr/0001-toolchain.md`:
```markdown
# 0001: Toolchain versions

Date: 2026-10-14 · Status: accepted

## Decision

Node 24 LTS, pnpm 12.11.2, Turborepo 2.11.8, **TypeScript 6.0.3**, **Prisma 7.10.0**, Vitest 5, ESLint 10 with typescript-eslint 8.71, Postgres 18.

## Context

- **TypeScript 7.0 (the native compiler) is out but not used yet.** typescript-eslint 8.71 refuses it ("does not support TS 7.0"),
  and TS 7 has no JavaScript compiler API yet. Running TS 7 for type-checking alongside TS 6 for linting works but is
  harder to understand. TypeScript 6.0.3 is the newest single version that every tool accepts. Revisit when typescript-eslint supports TS 7.
- **Prisma is pinned exactly** because npm's `latest` tag for `prisma` points at an 8.0 release candidate.
- **Prisma 7 does not load `.env` itself.** `prisma.config.ts` loads the root `.env` with dotenv, and reads the URL from
  `process.env` so `prisma generate` works without a database (CI).
- **`prisma generate` is never implicit in Prisma 7.** Turbo runs it before typecheck, lint and test.
- **pnpm 12 blocks install scripts** unless approved in `allowBuilds` (pnpm-workspace.yaml).

## Consequences

One compiler, one lint toolchain, reproducible installs. Upgrading TypeScript or Prisma is a deliberate change with its own ADR.
```

`docs/adr/0002-row-level-security.md`: written in Task 3, when the decision is implemented. Don't create it yet.

- [ ] **Step 12: Commit**

```bash
cd /Users/ak/personal/travel-crm
git add .nvmrc .gitignore package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json .dependency-cruiser.cjs CLAUDE.md README.md docs/adr packages/tsconfig packages/eslint-config
git commit -m "chore: set up pnpm + Turborepo workspace with shared TypeScript and ESLint config"
```

---

### Task 2: Database package, roles and test harness

**Files:**
- Create: `docker-compose.yml`, `.env.example`
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/eslint.config.js`, `packages/db/vitest.config.ts`, `packages/db/prisma.config.ts`
- Create: `packages/db/sql/bootstrap.sql`
- Create: `packages/db/prisma/schema/base.prisma`, `packages/db/prisma/schema/organization.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_init/migration.sql` (generated, then appended)
- Create: `packages/db/src/client.ts`, `packages/db/src/platform.ts`, `packages/db/src/index.ts`
- Create: `packages/db/test/global-setup.ts`, `packages/db/test/helpers.ts`, `packages/db/test/database-setup.test.ts`

**Interfaces:**
- Consumes: Task 1's tsconfig, eslint config and catalog.
- Produces:
  - `createPrismaClient(connectionString: string, options?: { max?: number }): PrismaClient` in `src/client.ts`. Internal; not exported from `index.ts`.
  - `createPlatformClient(url: string): PlatformClient` and `type PlatformClient`, from `@travel-crm/db/platform`.
  - `createTestOrganization(platform: PlatformClient, name?: string): Promise<string>` in `test/helpers.ts`. Returns the new organization's id.
  - Vitest context `inject("dbUrls")`: `{ superuser, migrator, runtime, platform }` connection strings.
  - SQL function `app_enable_org_rls(target regclass)`.
  - Table `organization (id, name, code, created_at, updated_at)` with CHECK `organization_code_format`.

- [ ] **Step 1: Write the local database files**

`docker-compose.yml`:
```yaml
# Local Postgres for development. Tests do not use this; they start their own throwaway Postgres.
name: travel-crm
services:
  postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: travel_crm
    ports:
      - "55432:5432"
    volumes:
      # Postgres 18 images keep data under /var/lib/postgresql/18/docker, so mount the parent.
      - postgres-data:/var/lib/postgresql
      - ./packages/db/sql/bootstrap.sql:/docker-entrypoint-initdb.d/10-bootstrap.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d travel_crm"]
      interval: 2s
      timeout: 3s
      retries: 30
volumes:
  postgres-data:
```

`.env.example`:
```
# Local Postgres from docker-compose.yml. Dev-only passwords, set in packages/db/sql/bootstrap.sql.
DATABASE_MIGRATOR_URL=postgresql://app_migrator:migrator@localhost:55432/travel_crm
DATABASE_URL=postgresql://app_runtime:runtime@localhost:55432/travel_crm
DATABASE_PLATFORM_URL=postgresql://app_platform:platform@localhost:55432/travel_crm
```

`packages/db/sql/bootstrap.sql`:
```sql
-- Creates the three database roles the app uses. Run once per database, as a superuser.
-- Local Docker and the test suite run this file as-is. These passwords are for local use only:
-- in a hosted database, create the same roles with strong passwords and the same grants.
--
-- app_migrator  owns the tables and runs migrations (CREATEDB lets `prisma migrate dev` make a shadow database)
-- app_runtime   used by the api and worker; row-level security always applies to it
-- app_platform  used only by the platform console; the platform_access policy lets it see every organization
CREATE ROLE app_migrator LOGIN PASSWORD 'migrator' NOBYPASSRLS CREATEDB;
CREATE ROLE app_runtime  LOGIN PASSWORD 'runtime'  NOBYPASSRLS;
CREATE ROLE app_platform LOGIN PASSWORD 'platform' NOBYPASSRLS;

-- The migrator owns the database, and so (Postgres 15+) the public schema. Nobody else can create tables in it.
DO $$ BEGIN EXECUTE format('ALTER DATABASE %I OWNER TO app_migrator', current_database()); END $$;

GRANT USAGE ON SCHEMA public TO app_runtime, app_platform;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime, app_platform;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime, app_platform;
```

- [ ] **Step 2: Write the package files**

`packages/db/package.json`:
```json
{
  "name": "@travel-crm/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./platform": "./src/platform.ts"
  },
  "scripts": {
    "generate": "prisma generate",
    "db:migrate:dev": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:status": "prisma migrate status",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@prisma/adapter-pg": "catalog:",
    "@prisma/client": "catalog:",
    "pg": "8.23.1"
  },
  "devDependencies": {
    "@testcontainers/postgresql": "12.2.1",
    "@travel-crm/eslint-config": "workspace:*",
    "@travel-crm/tsconfig": "workspace:*",
    "@types/node": "catalog:",
    "@types/pg": "8.23.1",
    "dotenv": "18.0.7",
    "eslint": "catalog:",
    "prisma": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`packages/db/tsconfig.json`:
```json
{
  "extends": "@travel-crm/tsconfig/base.json",
  "include": ["src", "test", "prisma.config.ts", "vitest.config.ts"]
}
```

`packages/db/eslint.config.js`:
```js
// ESLint for @travel-crm/db: the shared strict config.
import { base } from "@travel-crm/eslint-config";

export default base({ tsconfigRootDir: import.meta.dirname });
```

`packages/db/vitest.config.ts`:
```ts
// Tests run against a real Postgres started once per run by test/global-setup.ts.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "db",
    include: ["test/**/*.test.ts"],
    globalSetup: ["./test/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
```

`packages/db/prisma.config.ts`:
```ts
// Prisma CLI settings. Prisma 7 no longer reads .env by itself, so load the repo-root .env here.
import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// dotenv never overrides variables that are already set, so the test suite's own URL wins.
config({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

// Read from process.env (not Prisma's env()) so `prisma generate` works where no database URL exists, e.g. CI.
const url = process.env.DATABASE_MIGRATOR_URL;

export default defineConfig({
  schema: "prisma/schema",
  migrations: { path: "prisma/migrations" },
  datasource: url ? { url } : {},
});
```

Then install: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install`

- [ ] **Step 3: Write the Prisma schema**

`packages/db/prisma/schema/base.prisma`:
```prisma
// Prisma 7 generator: TypeScript output inside the package, ES modules.
generator client {
  provider     = "prisma-client"
  output       = "../../src/generated/prisma"
  moduleFormat = "esm"
}

// The URL comes from prisma.config.ts, never from this file.
datasource db {
  provider = "postgresql"
}
```

`packages/db/prisma/schema/organization.prisma`:
```prisma
/// A travel agency using the product. This table has no organization_id and no row-level security:
/// it is read during sign-in, before an organization is known (spec section 4).
model Organization {
  id        String   @id @default(uuid(7)) @db.Uuid
  name      String
  /// Short sign-in code such as SHARMA: 3-12 capital letters or digits (CHECK organization_code_format).
  code      String   @unique
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@map("organization")
}
```

- [ ] **Step 4: Start local Postgres and create the first migration**

```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
cp .env.example .env
pnpm db:up
pnpm --filter @travel-crm/db exec prisma migrate dev --create-only --name init
```
Expected: `prisma/migrations/<timestamp>_init/migration.sql` containing `CREATE TABLE "organization"` and a unique index on `code`.

Append this to the end of that `migration.sql`:
```sql

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization codes: 3-12 capital letters or digits, e.g. SHARMA.
ALTER TABLE "organization"
  ADD CONSTRAINT organization_code_format CHECK (code ~ '^[A-Z0-9]{3,12}$');

-- Migration history is for the migrator only. (Absent in Prisma's shadow database, hence the guard.)
DO $$
BEGIN
  IF to_regclass('"_prisma_migrations"') IS NOT NULL THEN
    REVOKE ALL ON TABLE "_prisma_migrations" FROM app_runtime, app_platform;
  END IF;
END $$;

-- Turns on organization isolation for one table. Call it in the migration that creates any table
-- with an organization_id column:  SELECT app_enable_org_rls('table_name');
--   org_isolation    the api and worker see and write only rows of the organization set by db.forOrg()
--   platform_access  the platform console and migrations see every row
-- FORCE makes the rules apply to the table owner too (the migrator), hence its explicit policy.
CREATE FUNCTION app_enable_org_rls(target regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
  EXECUTE format(
    'CREATE POLICY org_isolation ON %s TO app_runtime '
    'USING (organization_id = NULLIF(current_setting(''app.org_id'', true), '''')::uuid) '
    'WITH CHECK (organization_id = NULLIF(current_setting(''app.org_id'', true), '''')::uuid)',
    target);
  EXECUTE format(
    'CREATE POLICY platform_access ON %s TO app_platform, app_migrator USING (true) WITH CHECK (true)',
    target);
END;
$$;
```

Apply and generate:
```bash
pnpm --filter @travel-crm/db exec prisma migrate dev
pnpm --filter @travel-crm/db generate
```
Expected: "Already in sync" or "applied"; then "Generated Prisma Client" into `src/generated/prisma`.

- [ ] **Step 5: Write the client factory and platform entry point**

`packages/db/src/client.ts`:
```ts
// Creates a PrismaClient on the node-postgres driver. Internal: other packages go through index.ts or platform.ts.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export interface ClientOptions {
  /** Largest number of open connections in this client's pool. */
  max?: number;
}

export function createPrismaClient(connectionString: string, options: ClientOptions = {}): PrismaClient {
  const adapter = new PrismaPg({ connectionString, max: options.max ?? 10 });
  return new PrismaClient({ adapter });
}
```

`packages/db/src/platform.ts`:
```ts
// Entry point for the platform console only: a client that sees every organization (platform_access policy).
import { createPrismaClient } from "./client.js";
import type { PrismaClient } from "./generated/prisma/client.js";

export type PlatformClient = PrismaClient;

/** Connect as the app_platform role. Never use this for requests made by an organization's staff. */
export function createPlatformClient(url: string): PlatformClient {
  return createPrismaClient(url);
}
```

`packages/db/src/index.ts`:
```ts
// Public API of @travel-crm/db. Anything not exported here is internal to the package.
export type { Organization } from "./generated/prisma/client.js";
```

- [ ] **Step 6: Write the test harness**

`packages/db/test/global-setup.ts`:
```ts
// Starts a throwaway Postgres 18 once per test run, creates the roles, applies the migrations,
// checks the Prisma schema matches them, and hands connection URLs to the tests via inject("dbUrls").
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import type { TestProject } from "vitest/node";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(import.meta.dirname, "..");
const prismaBin = path.join(packageRoot, "node_modules/.bin/prisma");

export interface DbUrls {
  superuser: string;
  migrator: string;
  runtime: string;
  platform: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    dbUrls: DbUrls;
  }
}

let container: StartedPostgreSqlContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("app")
    .withUsername("postgres")
    .withPassword("postgres")
    .start();

  const host = container.getHost();
  const port = String(container.getPort());
  const urlFor = (user: string, password: string): string => `postgresql://${user}:${password}@${host}:${port}/app`;
  const urls: DbUrls = {
    superuser: container.getConnectionUri(),
    migrator: urlFor("app_migrator", "migrator"),
    runtime: urlFor("app_runtime", "runtime"),
    platform: urlFor("app_platform", "platform"),
  };

  const superuser = new pg.Client({ connectionString: urls.superuser });
  await superuser.connect();
  try {
    await superuser.query(await readFile(path.join(packageRoot, "sql/bootstrap.sql"), "utf8"));
  } finally {
    await superuser.end();
  }

  const env = { ...process.env, DATABASE_MIGRATOR_URL: urls.migrator, PRISMA_HIDE_UPDATE_MESSAGE: "1" };
  await execFileAsync(prismaBin, ["migrate", "deploy"], { cwd: packageRoot, env });

  try {
    await execFileAsync(
      prismaBin,
      ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema", "--exit-code"],
      { cwd: packageRoot, env },
    );
  } catch (error) {
    throw new Error(
      "The Prisma schema and the migrations disagree. Create the missing migration with " +
        "`pnpm --filter @travel-crm/db exec prisma migrate dev --create-only --name <change>`.",
      { cause: error },
    );
  }

  project.provide("dbUrls", urls);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
```

`packages/db/test/helpers.ts`:
```ts
// Small helpers shared by the database tests.
import { randomUUID } from "node:crypto";
import type { PlatformClient } from "../src/platform.js";

/** Creates an organization with a unique valid code (12 characters) and returns its id. */
export async function createTestOrganization(platform: PlatformClient, name = "Test agency"): Promise<string> {
  const code = `T${randomUUID().replaceAll("-", "").slice(0, 11).toUpperCase()}`;
  const organization = await platform.organization.create({ data: { name, code } });
  return organization.id;
}
```

- [ ] **Step 7: Write the failing tests**

`packages/db/test/database-setup.test.ts`:
```ts
// The database roles and the organization table behave as the spec requires (spec section 4).
import pg from "pg";
import { describe, expect, inject, it } from "vitest";
import { createPlatformClient } from "../src/platform.js";

async function queryAs<Row extends pg.QueryResultRow>(url: string, sql: string, params: unknown[] = []): Promise<Row[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<Row>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

describe("database setup", () => {
  const urls = inject("dbUrls");

  it("creates the three application roles, none of which can bypass row-level security", async () => {
    const roles = await queryAs<{ rolname: string; rolbypassrls: boolean }>(
      urls.superuser,
      "SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname",
      [["app_migrator", "app_platform", "app_runtime"]],
    );
    expect(roles).toEqual([
      { rolname: "app_migrator", rolbypassrls: false },
      { rolname: "app_platform", rolbypassrls: false },
      { rolname: "app_runtime", rolbypassrls: false },
    ]);
  });

  it("does not let the runtime role read migration history or create tables", async () => {
    await expect(queryAs(urls.runtime, 'SELECT * FROM "_prisma_migrations"')).rejects.toThrow(/permission denied/);
    await expect(queryAs(urls.runtime, "CREATE TABLE sneaky (id int)")).rejects.toThrow(/permission denied/);
  });

  it("only accepts organization codes of 3-12 capital letters or digits", async () => {
    const platform = createPlatformClient(urls.platform);
    try {
      await expect(platform.organization.create({ data: { name: "Valid", code: "SHARMA1" } })).resolves.toMatchObject({
        code: "SHARMA1",
      });
      for (const badCode of ["SH", "sharma", "SHARMA-HOLIDAYS", "THIRTEENCHARS"]) {
        await expect(platform.organization.create({ data: { name: "Invalid", code: badCode } })).rejects.toThrow(
          /organization_code_format|check constraint/,
        );
      }
    } finally {
      await platform.$disconnect();
    }
  });
});
```

- [ ] **Step 8: Run the tests**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test`

Expected: 3 tests pass. The first run pulls `postgres:18-alpine` and can take a minute.
- If the drift check fails, the schema and the migration disagree. Fix the migration; do not loosen the check.
- To see the test fail first, temporarily remove the `ALTER TABLE "organization" ADD CONSTRAINT` block and run. The code test fails. Restore the block.

- [ ] **Step 9: Typecheck, lint, import rules**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`

Expected: all turbo tasks succeed; depcruise reports no violations.

- [ ] **Step 10: Commit**

```bash
cd /Users/ak/personal/travel-crm
git add docker-compose.yml .env.example packages/db pnpm-lock.yaml
git commit -m "feat(db): add database package with roles, organization table and Postgres test harness"
```

---

### Task 3: `db.forOrg()` and the first organization-owned table

**Files:**
- Create: `packages/db/prisma/schema/org-counter.prisma`
- Modify: `packages/db/prisma/schema/organization.prisma` (add the `counters` relation field)
- Create: `packages/db/prisma/migrations/<timestamp>_org_counter/migration.sql` (generated, then appended)
- Create: `packages/db/src/for-org.ts`, `packages/db/src/database.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/db/test/for-org.test.ts`
- Create: `docs/adr/0002-row-level-security.md`; modify `docs/adr/README.md` (row already listed in Task 1)

**Interfaces:**
- Consumes: from Task 2, `createPrismaClient`, `createPlatformClient`, `createTestOrganization` and `inject("dbUrls")`.
- Produces:
  - `type OrgTx = Prisma.TransactionClient`.
  - `class InvalidOrganizationIdError extends Error`.
  - `forOrg<T>(client: PrismaClient, orgId: string, fn: (tx: OrgTx) => Promise<T>): Promise<T>` in `src/for-org.ts`. Internal; tests use it directly.
  - `interface Database { forOrg<T>(orgId: string, fn: (tx: OrgTx) => Promise<T>): Promise<T>; disconnect(): Promise<void> }`.
  - `createDatabase(url: string, options?: { maxConnections?: number }): Database`.
  - Model `OrgCounter`, table `org_counter (organization_id, key, value)`, primary key `(organization_id, key)`, with RLS.

- [ ] **Step 1: Add the `org_counter` table to the schema**

`packages/db/prisma/schema/org-counter.prisma`:
```prisma
/// Per-organization counters behind readable numbers such as BK-2026-0042 (see src/counters.ts).
/// Organization-owned: row-level security applies (migration calls app_enable_org_rls).
model OrgCounter {
  /// Filled from db.forOrg()'s organization when omitted. Copy this line exactly into every organization-owned model.
  organizationId String       @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  /// Document prefix and year, e.g. "BK-2026".
  key            String
  /// The last number handed out.
  value          Int
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)

  @@id([organizationId, key])
  @@map("org_counter")
}
```

In `organization.prisma`, add this field to `Organization` after `updatedAt`:
```prisma
  counters  OrgCounter[]
```

- [ ] **Step 2: Create the migration and append the RLS call**

```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
pnpm db:up
pnpm --filter @travel-crm/db exec prisma migrate dev --create-only --name org_counter
```
Append to the end of the new `migration.sql`:
```sql

-- Organization isolation (see the app_enable_org_rls function in the init migration).
SELECT app_enable_org_rls('org_counter');
```
Then: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db exec prisma migrate dev && pnpm --filter @travel-crm/db generate`

- [ ] **Step 3: Write the failing tests**

`packages/db/test/for-org.test.ts`:
```ts
// db.forOrg() limits every query to one organization, and Postgres enforces it (spec section 4).
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import { createDatabase, type Database } from "../src/database.js";
import { forOrg, InvalidOrganizationIdError } from "../src/for-org.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

describe("db.forOrg", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime);
    orgA = await createTestOrganization(platform, "Sharma Holidays");
    orgB = await createTestOrganization(platform, "Goa Escapes");
    await db.forOrg(orgA, (tx) => tx.orgCounter.create({ data: { key: "TEST-A", value: 1 } }));
    await db.forOrg(orgB, (tx) => tx.orgCounter.create({ data: { key: "TEST-B", value: 1 } }));
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("shows only the current organization's rows", async () => {
    const keys = await db.forOrg(orgA, async (tx) => (await tx.orgCounter.findMany()).map((row) => row.key));
    expect(keys).toEqual(["TEST-A"]);
  });

  it("fills organization_id from the transaction's organization", async () => {
    const row = await db.forOrg(orgA, (tx) => tx.orgCounter.create({ data: { key: "TEST-A2", value: 5 } }));
    expect(row.organizationId).toBe(orgA);
  });

  it("refuses to write a row for another organization", async () => {
    await expect(
      db.forOrg(orgA, (tx) => tx.orgCounter.create({ data: { organizationId: orgB, key: "SNEAKY", value: 1 } })),
    ).rejects.toThrow(/row-level security/);
  });

  it("refuses to move a row into another organization", async () => {
    await expect(
      db.forOrg(orgA, (tx) => tx.orgCounter.updateMany({ where: { key: "TEST-A" }, data: { organizationId: orgB } })),
    ).rejects.toThrow(/row-level security/);
  });

  it("sees nothing when no organization is set", async () => {
    const runtime = createPrismaClient(urls.runtime, { max: 1 });
    try {
      expect(await runtime.orgCounter.count()).toBe(0);
    } finally {
      await runtime.$disconnect();
    }
  });

  it("does not leak the organization to the next query on the same connection", async () => {
    // One connection, so the second query reuses the connection the transaction used.
    // Postgres reads the cleared setting back as '' (not NULL); NULLIF in the policy turns that into "no rows".
    const runtime = createPrismaClient(urls.runtime, { max: 1 });
    try {
      expect(await forOrg(runtime, orgA, (tx) => tx.orgCounter.count())).toBeGreaterThan(0);
      expect(await runtime.orgCounter.count()).toBe(0);
    } finally {
      await runtime.$disconnect();
    }
  });

  it("rejects an organization id that is not a UUID before touching the database", async () => {
    for (const badId of ["", "abc", "00000000-0000-0000-0000-00000000000z", "1; DROP TABLE organization"]) {
      await expect(db.forOrg(badId, (tx) => tx.orgCounter.count())).rejects.toBeInstanceOf(InvalidOrganizationIdError);
    }
  });

  it("lets the platform client see every organization's rows", async () => {
    const rows = await platform.orgCounter.findMany({ where: { organizationId: { in: [orgA, orgB] } } });
    expect(new Set(rows.map((row) => row.organizationId))).toEqual(new Set([orgA, orgB]));
  });
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test -- for-org`

Expected: FAIL. Vitest cannot resolve `../src/database.js` / `../src/for-org.js`.

- [ ] **Step 5: Implement `forOrg` and `createDatabase`**

`packages/db/src/for-org.ts`:
```ts
// Runs work inside one transaction scoped to one organization. Postgres row-level security does the scoping.
import type { Prisma, PrismaClient } from "./generated/prisma/client.js";

/** A transaction bound to one organization: every query sees and writes only that organization's rows. */
export type OrgTx = Prisma.TransactionClient;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Thrown before any SQL runs when the organization id is not a UUID. */
export class InvalidOrganizationIdError extends Error {
  constructor(value: string) {
    super(`Not a valid organization id: ${JSON.stringify(value.slice(0, 64))}`);
    this.name = "InvalidOrganizationIdError";
  }
}

export async function forOrg<T>(client: PrismaClient, orgId: string, fn: (tx: OrgTx) => Promise<T>): Promise<T> {
  if (!UUID_PATTERN.test(orgId)) {
    throw new InvalidOrganizationIdError(orgId);
  }
  return client.$transaction(async (tx) => {
    // is_local = true: the setting ends with this transaction, so a pooled connection never carries it over.
    await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
    return fn(tx);
  });
}
```

`packages/db/src/database.ts`:
```ts
// The application's handle on the database: organization data is reachable only through forOrg().
import { createPrismaClient } from "./client.js";
import { forOrg, type OrgTx } from "./for-org.js";

export interface Database {
  /** Runs fn in one transaction that can see and change only orgId's rows. The only way to reach organization data. */
  forOrg<T>(orgId: string, fn: (tx: OrgTx) => Promise<T>): Promise<T>;
  /** Closes the connection pool. */
  disconnect(): Promise<void>;
}

export interface DatabaseOptions {
  /** Largest number of open connections. Keep it small behind a transaction-mode pooler. */
  maxConnections?: number;
}

/** Connects as the app_runtime role, the role every api request and job uses. */
export function createDatabase(url: string, options: DatabaseOptions = {}): Database {
  const client = createPrismaClient(url, { max: options.maxConnections ?? 10 });
  return {
    forOrg: (orgId, fn) => forOrg(client, orgId, fn),
    disconnect: () => client.$disconnect(),
  };
}
```

`packages/db/src/index.ts`:
```ts
// Public API of @travel-crm/db. Anything not exported here is internal to the package.
export { createDatabase, type Database, type DatabaseOptions } from "./database.js";
export { InvalidOrganizationIdError, type OrgTx } from "./for-org.js";
export type { Organization, OrgCounter } from "./generated/prisma/client.js";
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test`

Expected: all tests in `database-setup.test.ts` and `for-org.test.ts` pass.

- [ ] **Step 7: Write ADR 0002**

`docs/adr/0002-row-level-security.md`:
```markdown
# 0002: How organization isolation is implemented

Date: 2026-10-14 · Status: accepted · Implements spec section 4

## Decision

- Every organization-owned table has `organization_id uuid NOT NULL`, defaulting to the transaction's organization.
- `db.forOrg(orgId, fn)` opens a transaction and runs `set_config('app.org_id', orgId, true)` first.
  The setting is transaction-local, so it is safe behind a transaction-mode connection pooler.
- The SQL function `app_enable_org_rls(table)` enables and **forces** row-level security and creates two policies:
  `org_isolation` (role `app_runtime`: only rows of `app.org_id`) and `platform_access` (roles `app_platform` and
  `app_migrator`: all rows). Every migration that creates an organization-owned table calls it.
- The policies compare against `NULLIF(current_setting('app.org_id', true), '')::uuid`.

## Context

- **No BYPASSRLS.** Hosted Postgres services may not allow granting `BYPASSRLS`. Per-role policies give the
  platform console and migrations the same reach on any Postgres.
- **FORCE applies RLS to the table owner too.** Without FORCE the migrator (owner) silently bypasses RLS. With FORCE
  and no policy it sees nothing, hence `app_migrator` in `platform_access`.
- **`''` versus NULL.** After a transaction that set `app.org_id` ends, the same connection reads the setting back as
  `''`, not NULL. Casting `''` to uuid would error; `NULLIF` turns it into "no rows" instead.
- **Invalid ids are rejected in TypeScript.** `forOrg` throws `InvalidOrganizationIdError` before any SQL.

## Consequences

- A forgotten filter returns nothing instead of leaking.
- The test suite proves isolation for every table with `organization_id`, and fails if a table lacks the policies
  or an isolation fixture.
- The organization table itself has no RLS: it is read during sign-in, before an organization is known.
```

- [ ] **Step 8: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`. Expected: green.

```bash
cd /Users/ak/personal/travel-crm
git add packages/db docs/adr
git commit -m "feat(db): add db.forOrg() with row-level security and the org_counter table"
```

---

### Task 4: Readable document numbers per organization

**Files:**
- Create: `packages/db/src/counters.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/db/test/counters.test.ts`

**Interfaces:**
- Consumes: from Task 3, `OrgTx`, `createDatabase`, `forOrg`, and the `org_counter` table; from Task 2, the helpers.
- Produces:
  - `nextDocumentNumber(tx: OrgTx, options: DocumentNumberOptions): Promise<string>`.
  - `interface DocumentNumberOptions { prefix: string; year: number }`. `prefix` is 2–5 capital letters; `year` is 2000–9999.
  - Output format: `${prefix}-${year}-${sequence padded to at least 4 digits}`, for example `BK-2026-0042` or `BK-2026-10000`.

- [ ] **Step 1: Write the failing tests**

`packages/db/test/counters.test.ts`:
```ts
// Readable numbers like BK-2026-0042: per organization, per prefix, per year, never repeated (spec section 4).
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import { nextDocumentNumber } from "../src/counters.js";
import { createDatabase, type Database } from "../src/database.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

describe("nextDocumentNumber", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime);
    orgA = await createTestOrganization(platform);
    orgB = await createTestOrganization(platform);
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("counts up from 0001", async () => {
    const numbers: string[] = [];
    for (let i = 0; i < 3; i++) {
      numbers.push(await db.forOrg(orgA, (tx) => nextDocumentNumber(tx, { prefix: "BK", year: 2026 })));
    }
    expect(numbers).toEqual(["BK-2026-0001", "BK-2026-0002", "BK-2026-0003"]);
  });

  it("keeps separate counters per prefix, per year and per organization", async () => {
    expect(await db.forOrg(orgA, (tx) => nextDocumentNumber(tx, { prefix: "QT", year: 2026 }))).toBe("QT-2026-0001");
    expect(await db.forOrg(orgA, (tx) => nextDocumentNumber(tx, { prefix: "BK", year: 2027 }))).toBe("BK-2027-0001");
    expect(await db.forOrg(orgB, (tx) => nextDocumentNumber(tx, { prefix: "BK", year: 2026 }))).toBe("BK-2026-0001");
  });

  it("never hands out the same number twice when called concurrently", async () => {
    const orgC = await createTestOrganization(platform);
    const numbers = await Promise.all(
      Array.from({ length: 25 }, () => db.forOrg(orgC, (tx) => nextDocumentNumber(tx, { prefix: "RC", year: 2026 }))),
    );
    const expected = Array.from({ length: 25 }, (_, i) => `RC-2026-${String(i + 1).padStart(4, "0")}`);
    expect([...numbers].sort()).toEqual(expected);
  });

  it("keeps counting past 9999 without cutting digits", async () => {
    const orgD = await createTestOrganization(platform);
    await platform.orgCounter.create({ data: { organizationId: orgD, key: "BK-2026", value: 9999 } });
    expect(await db.forOrg(orgD, (tx) => nextDocumentNumber(tx, { prefix: "BK", year: 2026 }))).toBe("BK-2026-10000");
  });

  it("rejects malformed prefixes and years", async () => {
    const bad = [
      { prefix: "bk", year: 2026 },
      { prefix: "B", year: 2026 },
      { prefix: "BOOKING", year: 2026 },
      { prefix: "BK", year: 1999 },
      { prefix: "BK", year: 2026.5 },
    ];
    for (const options of bad) {
      await expect(db.forOrg(orgA, (tx) => nextDocumentNumber(tx, options))).rejects.toBeInstanceOf(RangeError);
    }
  });

  it("fails outside an organization transaction instead of numbering for nobody", async () => {
    const runtime = createPrismaClient(urls.runtime, { max: 1 });
    try {
      await expect(runtime.$transaction((tx) => nextDocumentNumber(tx, { prefix: "BK", year: 2026 }))).rejects.toThrow(
        /null value|organization_id/,
      );
    } finally {
      await runtime.$disconnect();
    }
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test -- counters`

Expected: FAIL. Cannot resolve `../src/counters.js`.

- [ ] **Step 3: Implement**

`packages/db/src/counters.ts`:
```ts
// Readable document numbers (BK-2026-0042): one counter per organization, prefix and year.
import type { OrgTx } from "./for-org.js";

export interface DocumentNumberOptions {
  /** 2-5 capital letters naming the document type, e.g. "BK" for bookings, "QT" for quotes. */
  prefix: string;
  /** The year the number belongs to, in the organization's time zone (the caller decides). */
  year: number;
}

const PREFIX_PATTERN = /^[A-Z]{2,5}$/;

/**
 * Hands out the next number for a document type. Call inside db.forOrg(): the counter row is locked until the
 * transaction ends, so concurrent callers queue up and never receive the same number.
 */
export async function nextDocumentNumber(tx: OrgTx, { prefix, year }: DocumentNumberOptions): Promise<string> {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new RangeError(`Document prefix must be 2-5 capital letters, got ${JSON.stringify(prefix)}`);
  }
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new RangeError(`Document year must be a whole year between 2000 and 9999, got ${String(year)}`);
  }

  const key = `${prefix}-${String(year)}`;
  // organization_id is omitted on purpose: it defaults to the transaction's organization.
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO org_counter (key, value) VALUES (${key}, 1)
    ON CONFLICT (organization_id, key) DO UPDATE SET value = org_counter.value + 1
    RETURNING value`;

  const value = rows[0]?.value;
  if (value === undefined) {
    throw new Error(`Counter ${key} returned no value`);
  }
  return `${key}-${String(value).padStart(4, "0")}`;
}
```

Add to `packages/db/src/index.ts`:
```ts
export { nextDocumentNumber, type DocumentNumberOptions } from "./counters.js";
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test`

Expected: all tests pass.

- [ ] **Step 5: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`. Expected: green.

```bash
cd /Users/ak/personal/travel-crm
git add packages/db
git commit -m "feat(db): add per-organization document numbers (BK-2026-0042)"
```

---

### Task 5: Isolation suite and RLS schema check

**Files:**
- Create: `packages/db/test/org-table-fixtures.ts`, `packages/db/test/isolation.test.ts`, `packages/db/test/schema-check.test.ts`
- Create: `packages/db/README.md`

**Interfaces:**
- Consumes: Tasks 2–4. `Prisma` (namespace) from `../src/generated/prisma/client.js`, for `Prisma.raw`.
- Produces:
  - `orgTableFixtures: Record<string, (tx: OrgTx) => Promise<unknown>>`, keyed by table name. Every later plan adds one entry per new organization-owned table.
  - `signInTables: readonly string[]`, the tables that carry `organization_id` but stay outside RLS. Empty now; plan 2 adds Better Auth's `member` and `invitation`.

- [ ] **Step 1: Write the fixtures registry**

`packages/db/test/org-table-fixtures.ts`:
```ts
// One row-creating function per organization-owned table. isolation.test.ts runs its checks on each, and fails if
// a table with an organization_id column is missing here. Add an entry whenever you add such a table.
import type { OrgTx } from "../src/for-org.js";

export const orgTableFixtures: Record<string, (tx: OrgTx) => Promise<unknown>> = {
  org_counter: (tx) => tx.orgCounter.create({ data: { key: "ISO-2000", value: 1 } }),
};

/**
 * Tables that carry organization_id but stay outside row-level security because sign-in reads them before the
 * organization is known (spec section 4). Only the identity module may touch them.
 */
export const signInTables: readonly string[] = [];
```

- [ ] **Step 2: Write the isolation suite**

`packages/db/test/isolation.test.ts`:
```ts
// Proves, for every organization-owned table, that another organization can't read, change, delete or receive its rows.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import { createDatabase, type Database } from "../src/database.js";
import { Prisma } from "../src/generated/prisma/client.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";
import { orgTableFixtures, signInTables } from "./org-table-fixtures.js";

const quoteIdentifier = (name: string): string => `"${name.replaceAll('"', '""')}"`;

async function tablesWithOrganizationId(platform: PlatformClient): Promise<string[]> {
  const rows = await platform.$queryRaw<{ table_name: string }[]>`
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND c.column_name = 'organization_id' AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name`;
  return rows.map((row) => row.table_name).filter((name) => !signInTables.includes(name));
}

describe("organization isolation", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime);
    orgA = await createTestOrganization(platform, "Isolation A");
    orgB = await createTestOrganization(platform, "Isolation B");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("has an isolation fixture for every table with an organization_id column", async () => {
    expect(await tablesWithOrganizationId(platform)).toEqual(Object.keys(orgTableFixtures).sort());
  });

  describe.each(Object.keys(orgTableFixtures))("table %s", (tableName) => {
    const table = Prisma.raw(quoteIdentifier(tableName));
    const countRows = (orgId: string): Promise<number | undefined> =>
      db.forOrg(orgId, async (tx) => (await tx.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM ${table}`)[0]?.n);

    beforeAll(async () => {
      const createRow = orgTableFixtures[tableName];
      if (!createRow) throw new Error(`No fixture for ${tableName}`);
      await db.forOrg(orgA, createRow);
    });

    it("is invisible to another organization", async () => {
      expect(await countRows(orgB)).toBe(0);
    });

    it("cannot be updated by another organization", async () => {
      expect(await db.forOrg(orgB, (tx) => tx.$executeRaw`UPDATE ${table} SET organization_id = organization_id`)).toBe(0);
    });

    it("cannot be deleted by another organization", async () => {
      expect(await db.forOrg(orgB, (tx) => tx.$executeRaw`DELETE FROM ${table}`)).toBe(0);
      expect(await countRows(orgA)).toBeGreaterThan(0);
    });

    it("cannot be moved into another organization", async () => {
      await expect(
        db.forOrg(orgA, (tx) => tx.$executeRaw`UPDATE ${table} SET organization_id = ${orgB}::uuid`),
      ).rejects.toThrow(/row-level security/);
    });

    it("is invisible when no organization is set", async () => {
      const runtime = createPrismaClient(urls.runtime, { max: 1 });
      try {
        const rows = await runtime.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM ${table}`;
        expect(rows[0]?.n).toBe(0);
      } finally {
        await runtime.$disconnect();
      }
    });
  });
});
```

- [ ] **Step 3: Write the schema check**

`packages/db/test/schema-check.test.ts`:
```ts
// Fails when a table with organization_id is missing forced row-level security or either policy,
// so a new table can't quietly skip protection. Includes a probe proving the check itself works.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { signInTables } from "./org-table-fixtures.js";

type Queryable = Pick<Prisma.TransactionClient, "$queryRaw">;

interface TableProtection {
  table_name: string;
  rls: boolean;
  forced: boolean;
  policies: string[];
}

async function protectionOfOrgTables(client: Queryable): Promise<TableProtection[]> {
  return client.$queryRaw<TableProtection[]>`
    SELECT c.relname AS table_name,
           c.relrowsecurity AS rls,
           c.relforcerowsecurity AS forced,
           COALESCE(array_agg(p.policyname::text ORDER BY p.policyname) FILTER (WHERE p.policyname IS NOT NULL), '{}') AS policies
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
    LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = c.relname
    WHERE c.relkind = 'r'
    GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
    ORDER BY c.relname`;
}

function unprotected(tables: TableProtection[]): string[] {
  return tables
    .filter((t) => !signInTables.includes(t.table_name))
    .filter((t) => !t.rls || !t.forced || !t.policies.includes("org_isolation") || !t.policies.includes("platform_access"))
    .map((t) => t.table_name);
}

class Rollback extends Error {}

describe("row-level security schema check", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;

  beforeAll(() => {
    platform = createPlatformClient(urls.platform);
  });

  afterAll(async () => {
    await platform.$disconnect();
  });

  it("protects every table that has an organization_id column", async () => {
    const tables = await protectionOfOrgTables(platform);
    expect(tables.length).toBeGreaterThan(0);
    expect(unprotected(tables)).toEqual([]);
  });

  it("limits org_isolation to the runtime role", async () => {
    const rows = await platform.$queryRaw<{ roles: string[] }[]>`
      SELECT DISTINCT roles::text[] AS roles FROM pg_policies WHERE schemaname = 'public' AND policyname = 'org_isolation'`;
    expect(rows).toEqual([{ roles: ["app_runtime"] }]);
  });

  it("catches a table that forgot its policies", async () => {
    const migrator = createPrismaClient(urls.migrator, { max: 1 });
    try {
      await expect(
        migrator.$transaction(async (tx) => {
          await tx.$executeRaw`CREATE TABLE unprotected_probe (organization_id uuid NOT NULL)`;
          expect(unprotected(await protectionOfOrgTables(tx))).toContain("unprotected_probe");
          throw new Rollback("undo the probe table");
        }),
      ).rejects.toBeInstanceOf(Rollback);
    } finally {
      await migrator.$disconnect();
    }
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test`

Expected: all tests pass, including 5 per-table tests for `org_counter`.

Prove the suite catches mistakes, then undo each change:
- Temporarily delete the `org_counter` entry from `orgTableFixtures`. The fixture test fails. Restore it.
- Temporarily change the probe table in `schema-check.test.ts` to call `app_enable_org_rls`. "catches a table that forgot its policies" fails. Restore it.

- [ ] **Step 5: Write `packages/db/README.md`**

```markdown
# @travel-crm/db

The database layer: Prisma schema, migrations, and the rules that keep each organization's data apart.

## Using it

    import { createDatabase, nextDocumentNumber } from "@travel-crm/db";

    const db = createDatabase(process.env.DATABASE_URL);   // app_runtime role
    const number = await db.forOrg(orgId, (tx) => nextDocumentNumber(tx, { prefix: "BK", year: 2026 }));

Organization data is reachable only inside `db.forOrg()`. Postgres row-level security limits every query in that
transaction to `orgId`'s rows; outside it, queries see nothing. Only the platform console imports
`@travel-crm/db/platform`, which sees every organization.

## Adding a table that belongs to an organization

1. Add the model in `prisma/schema/<module>.prisma` with this exact line, plus a relation to `Organization`:

       organizationId String @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid

2. Create the migration: `pnpm --filter @travel-crm/db exec prisma migrate dev --create-only --name <change>`
3. Append to the new `migration.sql`: `SELECT app_enable_org_rls('<table_name>');`
4. Apply and regenerate: `pnpm --filter @travel-crm/db exec prisma migrate dev && pnpm --filter @travel-crm/db generate`
5. Add a row-creating entry for the table to `test/org-table-fixtures.ts`.
6. `pnpm check`. The isolation suite now covers the new table.

Steps 3 and 5 are enforced: the tests fail if either is missing.

## Roles

| Role | Used by | Sees |
|---|---|---|
| `app_migrator` | migrations | everything (owns the tables) |
| `app_runtime` | api and worker | only the organization set by `forOrg` |
| `app_platform` | platform console | every organization |

`sql/bootstrap.sql` creates them locally and in tests. Why it works this way: [ADR 0002](../../docs/adr/0002-row-level-security.md).
```

- [ ] **Step 6: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`. Expected: green.

```bash
cd /Users/ak/personal/travel-crm
git add packages/db
git commit -m "test(db): prove organization isolation for every organization-owned table"
```

---

### Task 6: CI workflow and a clean-checkout run

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `README.md` (only if a command in "Run it locally" turns out wrong)

**Interfaces:**
- Consumes: the root `check` script.
- Produces: the CI workflow later plans extend (Playwright and Docker image jobs arrive in plan 5).

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:
```yaml
# Runs everything `pnpm check` runs, on every pull request and on main.
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      PRISMA_HIDE_UPDATE_MESSAGE: "1"
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
```

- [ ] **Step 2: Lint the workflow**

Run: `docker run --rm -v "/Users/ak/personal/travel-crm:/repo" -w /repo rhysd/actionlint:latest -color`

Expected: no output, exit 0.

- [ ] **Step 3: Prove a fresh clone works, the way CI will run it**

```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
rm -rf /private/tmp/claude-501/-Users-ak-personal-yatrahikes-crm/20d5e186-01fd-4585-b5e1-2faab53ae574/scratchpad/travel-crm-clean && git clone -q /Users/ak/personal/travel-crm /private/tmp/claude-501/-Users-ak-personal-yatrahikes-crm/20d5e186-01fd-4585-b5e1-2faab53ae574/scratchpad/travel-crm-clean
cd /private/tmp/claude-501/-Users-ak-personal-yatrahikes-crm/20d5e186-01fd-4585-b5e1-2faab53ae574/scratchpad/travel-crm-clean && git checkout -q foundation/01-data
pnpm install --frozen-lockfile && pnpm check
```
Expected: install succeeds without prompts, and `pnpm check` is green. This proves the lockfile, the approved builds and the generated client all work from nothing. Then `rm -rf /private/tmp/claude-501/-Users-ak-personal-yatrahikes-crm/20d5e186-01fd-4585-b5e1-2faab53ae574/scratchpad/travel-crm-clean`.

- [ ] **Step 4: Prove the local developer flow from the README**

```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
pnpm db:down && docker volume rm travel-crm_postgres-data
pnpm db:up && pnpm db:migrate && pnpm --filter @travel-crm/db db:status
```
Expected: `db:status` reports the database schema is up to date. If a README command was wrong, fix the README.

- [ ] **Step 5: Commit**

```bash
cd /Users/ak/personal/travel-crm
git add .github/workflows/ci.yml README.md
git commit -m "ci: run typecheck, lint, tests and import rules on every pull request"
```

---

## After the last task

The controller (not an implementer):
1. Requests a whole-branch review.
2. Merges `foundation/01-data` into `main` with `git merge --no-ff foundation/01-data -m "Merge foundation/01-data: repo and data isolation"`.
3. Moves on to plan 2.
