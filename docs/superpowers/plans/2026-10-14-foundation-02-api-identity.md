# Foundation 02: API and Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People sign in to the api by email or by organization code and username, owners manage staff (with or without email) and roles, and every tRPC request runs the spec's checks in order, all proven end to end through the HTTP app.

**Architecture:**
- `apps/api` (`@travel-crm/api-server`) is one Hono app: `/health`, Better Auth at `/api/auth/*`, the organization-code sign-in route, and tRPC at `/api/trpc`.
- `packages/api` (`@travel-crm/api`) holds the tRPC routers and the procedure builders that run request checks 1 and 4, with places for checks 2 and 3 (plan 4).
- `packages/domain` (`@travel-crm/domain/identity`, `@travel-crm/domain/kernel`) holds Better Auth's configuration, the permission catalog, starter roles, and the staff and role rules.
- `packages/contracts` (`@travel-crm/contracts/identity`) holds a Zod schema for every input and output.
- `packages/db` gains Better Auth's tables, our `role` and `role_permission` tables under row-level security, soft delete, and two narrow entry points: `@travel-crm/db/identity` (for the identity module only) and `@travel-crm/db/testing` (for other packages' tests).

**Tech Stack:**
- Plan 1's stack: Node 24, pnpm 12.11.2, Turborepo 2.11.8, TypeScript 6.0.3, Prisma 7.10.0, Postgres 18, Vitest 5.0.4, Testcontainers 12.2.1, ESLint 10, dependency-cruiser 18.6.0.
- New: better-auth 1.7.7, hono 4.13.13, @hono/node-server 2.1.5, @hono/trpc-server 0.4.2, @trpc/server 11.19.0, zod 4.6.7, tsx 4.23.15, and @better-auth/utils 0.4.2 in tests.

**Spec:** `docs/superpowers/specs/2026-10-13-foundation-design.md`, sections 3, 5 and 6, and the identity parts of section 9 (typed errors and sign-in rate limiting, 9.7). This is plan 2 of 5 for the Foundation:

1. Repo and data isolation (done; merged to `main`)
2. API and identity (this plan)
3. Shared services
4. Platform and subscriptions
5. Web app and release

**How this plan was checked.**
- Every file in it was written and run in a scratch clone of `main` at `b40c737` (plan 1 plus its fix wave). There, `pnpm check` was green from a clean clone. The code blocks below are those files after Prettier and ESLint.
- **Tasks 1-3 were executed from this plan's first version and are kept exactly as written.** Task 1's review then widened the raw-SQL guard on the branch.
- **Task 3b is new:** it carries the requirements from plan 1's final review that Tasks 1-3 predate.
- Task 3b and Tasks 4-12 were replayed task by task on top of the branch as executed. After every task, `pnpm check` was green, the test counts matched the ones stated, and the commit hooks changed nothing.

**Plan 1 carry-overs handled here** (from plan 1's final review; plan 1's fix wave is already on `main`):
- **Raw SQL guard.** Outside `packages/db`, ESLint refuses `$executeRawUnsafe`/`$queryRawUnsafe`, `set_config`/`app.org_id`, `SET ROLE`, `SET SESSION AUTHORIZATION`, `RESET ALL`/`RESET ROLE` and `CREATE TEMP`, each proven on a sample. This is Task 1, as widened in its review. `OrgTx` also stops exposing the `*Unsafe` methods (Task 3).
- **Keys on organization tables.**
  - A foreign key between two organization tables pairs `organization_id` (`role_permission → role`).
  - Every unique constraint includes `organization_id`, except a primary key on `id`.
  - The test suite checks both, with probes (foreign keys in Task 2; unique constraints, and `role_permission`'s key, in Task 3b).
- **Soft delete and partial unique indexes** through Prisma's `partialIndexes` preview, which the drift check accepts (Tasks 2 and 3).
- **`signInTables` is guarded:** every entry must exist, carry `organization_id`, and be `member` or `invitation` (Task 3b).
- **The platform client is locked down.** An import rule lets only the platform module (none yet) and tests use `@travel-crm/db/platform`. The api's environment has no `DATABASE_PLATFORM_URL` (Tasks 3 and 9).
- **`forOrg` options:** `{ timeout, maxWait }` pass through to Prisma's transaction. A `forOrg` inside another throws `NestedForOrgError` rather than relying on "never nest" being remembered (Task 3b).
- **The runtime role's `UPDATE` on `organization`** is narrowed to the columns the api owns, never `code` (Task 2).
- **`REVOKE TEMPORARY`** in a migration, for databases bootstrapped before plan 1's fix (Task 2).
- **Ids stay UUIDs** (the policies cast to uuid): Better Auth runs with `generateId: false`, and Prisma's `uuid(7)` makes every id (Tasks 2 and 6).
- **The api connects as `app_runtime`,** which plan 1's `forOrg` now insists on (`WrongDatabaseRoleError`).

## Global Constraints

- **Node 24 for every command, from the repo root.** Every shell call starts in another directory, so prefix each shell command with `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null &&` (`nvm use` reads `.nvmrc`). Node 22 remains the machine default; do not change it.
- **Docker must be running.** The db, domain and api-server tests each start a throwaway Postgres 18 with Testcontainers.
- **Pinned versions.** Use these exact versions, and never let a command pick "latest":
  - Plan 1's: `prisma`/`@prisma/client`/`@prisma/adapter-pg` 7.10.0, `typescript` 6.0.3, `vitest` 5.0.4, `eslint` 10.12.0, `pg` 8.23.1, `@testcontainers/postgresql` 12.2.1, and the rest of the catalog in `pnpm-workspace.yaml`.
  - New: `better-auth` 1.7.7, `hono` 4.13.13, `@hono/node-server` 2.1.5, `@hono/trpc-server` 0.4.2, `@trpc/server` 11.19.0, `zod` 4.6.7 (added to the catalog), `tsx` 4.23.15, `@better-auth/utils` 0.4.2 (tests only; it is the version better-auth 1.7.7 itself uses).
  - The Better Auth CLI is `npx auth@1.7.7` (the npm package `auth`; `@better-auth/cli` is stale). It is a reference only: the schema in this plan is already written. Never add it as a dependency; it would pull in a second copy of better-auth.
  - If `pnpm install` refuses a package because it was published in the last 24 hours, add `"<name>@<version>"` to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`, as plan 1 did.
- **Package names.** `apps/api` is `@travel-crm/api-server`; `packages/api` is `@travel-crm/api`. Domain modules are imported by subpath: `@travel-crm/domain/identity`, `@travel-crm/domain/kernel`; contracts likewise: `@travel-crm/contracts/identity`.
- **Naming.** Plan 1's rules hold: the tenant is an **organization** (`organization_id`, `organizationId`, `app.org_id`, `forOrg`); tables and columns snake_case through `@@map`/`@map`; models PascalCase. Permissions are `module:action` (`staff:manage`). Role keys are lowercase with hyphens (`org-owner`, `sales`).
- **Readable code.** Files stay small and single-purpose; a file over ~200 lines needs a reason. Every source file opens with a one-line comment saying what it is for. Comments explain *why*, not *what*. No abbreviations in public names.
- **Data rules.**
  - Organization data is reached only through `db.forOrg()`. Every table with an `organization_id` column gets `SELECT app_enable_org_rls('<table>');` in the migration that creates it, plus an entry in `packages/db/test/org-table-fixtures.ts`.
  - Better Auth's sign-in tables (`user`, `session`, `account`, `verification`, `two_factor`, `organization`, `member`, `invitation`) have no row-level security. Only `packages/domain/src/identity` reaches them, through `@travel-crm/db/identity`. Queries of `member` filter by `organizationId` themselves.
  - Outside `packages/db`, never write SQL containing `set_config` or `app.org_id`, `SET`/`RESET` statements or `CREATE TEMP`, and never call `$executeRawUnsafe`/`$queryRawUnsafe`.
  - Keys on organization tables include `organization_id`: composite foreign keys `(organization_id, x_id) → x (organization_id, id)`, and `organization_id` in every unique constraint except a primary key on `id`.
  - Never call `forOrg()` inside another `forOrg()`; pass the outer `tx` down.
  - Tests use small connection pools (`maxConnections: 2` or `3`); the test Postgres allows 300 connections across all test files.
- **Better Auth facts this plan relies on** (all checked):
  - `app.request()` runs on `http://localhost`, so tests use that as the api's address and send `origin: http://localhost` on POSTs.
  - Better Auth turns its origin check off when `NODE_ENV` is `test`, so `createAuth` pins it on (Task 6).
  - Set-Cookie headers that delete a cookie come before the new ones; tests keep cookies in a small jar where the last value wins and an empty value or `Max-Age=0` deletes.
- **Commits.** Conventional Commits (`feat(db): …`, `feat(domain): …`, `docs: …`). The git hooks run Prettier, ESLint and commitlint on every commit: fix what they report and never use `--no-verify`. **Never add a `Co-Authored-By` trailer.** No secrets or `.env` files in git.
- **Git.** Work on branch `foundation/02-api-identity`, created from `main` in Task 1. Don't push; there is no remote.

## Review Focus

These failure modes are implied by the spec but easy to miss. Each is pinned by tests in the tasks named.

1. **An Admin out-ranking or taking over the Owner.** A member with `staff:manage` but not `roles:manage` must not be able to create an Owner, give anyone a role that allows more than they hold, or change, reset or remove an Owner; resetting the Owner's password would hand them the Owner's account. Expected: 403 with `OWNER_ONLY` or `EXCEEDS_YOUR_PERMISSIONS`, and the Owner's password still works. Pinned in Task 5 (rules), Task 8 (service) and Task 11 ("cannot take over the Owner's account by resetting its password").
2. **A removed member whose session cookie is still cached.** For up to 5 minutes the cached cookie still passes Better Auth's session check. Expected: their next organization request is refused (403 `NOT_A_MEMBER`), sensitive procedures answer 401, they cannot sign in again, and their email can join another organization. Pinned in Task 8, Task 10 ("refuses a removed member at once…") and Task 11 ("removes someone at once…").
3. **Staff without email.** Their placeholder address must never be shown: not in `staff.list`, not in `me.get`, not in the authenticator app's label. An admin must not be able to type a `.invalid` address. They sign in with organization code and username typed in any case. Expected: `email: null`, and the label `<CODE> <username>`. Pinned in Task 4, Task 6, Task 10 ("once required, holds members without it at setup…") and Task 11.
4. **Requiring two-factor.** An owner who turns the requirement on without using two-factor would lock themselves out, and members caught by it must still be able to set it up. Expected: refused with `ENABLE_TWO_FACTOR_FIRST`; members without two-factor are held at `SET_UP_TWO_FACTOR`, but `me.get` and `/api/auth/two-factor/*` stay open; organization-code sign-in asks for the code too. Pinned in Task 8 and Task 10.
5. **Better Auth's own endpoints as a side door.** `/api/auth/organization/*` would let a client change members and roles past our rules; `/api/auth/sign-up/email` would let strangers in; a sign-in posted from another website is cross-site request forgery. Expected: 404, no user created, and 403. Pinned in Task 9 ("closes Better Auth's organization endpoints to clients", "has no self sign-up", "refuses a sign-in posted from another website").

## File Structure

```
travel-crm/
├── .dependency-cruiser.cjs           + import rules for db entry points and domain modules
├── .env.example                      + the api's variables
├── apps/api/                         @travel-crm/api-server: the Hono server
│   ├── src/environment.ts            settings from environment variables, checked
│   ├── src/org-sign-in.ts            POST /api/auth/sign-in/org
│   ├── src/app.ts                    the Hono app: health, Better Auth, tRPC
│   ├── src/server.ts                 Node entry point (dev script)
│   └── test/                         end-to-end tests through app.request(); support/ holds the helpers
├── packages/api/                     @travel-crm/api: tRPC
│   ├── src/context.ts, trpc.ts, errors.ts
│   ├── src/procedures.ts             protectedProcedure, orgProcedure, freshProcedure, platformProcedure
│   └── src/routers/                  me, staff, roles, settings, platform, app-router
├── packages/contracts/               @travel-crm/contracts: Zod schemas
│   └── src/identity/                 fields, sign-in, staff, roles, me, settings
├── packages/domain/                  @travel-crm/domain: business rules
│   ├── src/kernel/                   DomainError
│   └── src/identity/                 Better Auth (auth/), permissions, roles, staff, access, rules
├── packages/db/
│   ├── prisma/schema/                + identity-auth.prisma, identity-roles.prisma
│   ├── src/soft-delete.ts            the soft-delete extension
│   ├── src/identity.ts               @travel-crm/db/identity
│   ├── src/errors.ts                 isUniqueViolation
│   └── test/testing.ts               @travel-crm/db/testing
├── packages/eslint-config/           + the raw-SQL guard and its test
└── docs/adr/                         + 0004 soft delete, 0005 roles, 0006 identity and sessions, 0007 removing staff
```

Calls only go down: `apps/api` → `packages/api` → `packages/domain` → `packages/db`. `packages/contracts` is a leaf that `api`, `domain` and `apps/api` use.

---


### Task 1: Branch and the raw-SQL guard

Code inside `db.forOrg()` gets a transaction that can run raw SQL. One `set_config('app.org_id', …)` would switch it to another organization. This task makes ESLint refuse that SQL, and Prisma's `*Unsafe` raw methods, everywhere except `packages/db`.

**Files:**
- Modify: `packages/eslint-config/index.js`, `packages/eslint-config/package.json`, `packages/db/eslint.config.js`
- Create: `packages/eslint-config/test/raw-database-access-guard.test.js`

**Interfaces:**
- Consumes: plan 1's `base({ tsconfigRootDir, ignores? })` from `@travel-crm/eslint-config`.
- Produces:
  - `rawDatabaseAccessGuard`, an ESLint flat-config object exported from `@travel-crm/eslint-config` and included in `base()`. Its rules: `no-restricted-properties` on `$executeRawUnsafe` and `$queryRawUnsafe`, and `no-restricted-syntax` on any string or template text matching `/set_config|app\.org_id/i`.
  - `packages/db/eslint.config.js` turns both rules off, because `db` implements `forOrg()`.
  - A `test` script in `@travel-crm/eslint-config`.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
git switch main && git log -1 --oneline
git switch -c foundation/02-api-identity
```
Expected: `main` is at plan 1's merge commit (`b40c737 chore: merge foundation/01-data …`) or later.

- [ ] **Step 2: Give the ESLint config package a test script**

`packages/eslint-config/package.json`:
```json
{
  "name": "@travel-crm/eslint-config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./index.js"
  },
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@eslint/js": "10.0.1",
    "typescript-eslint": "8.71.2"
  },
  "devDependencies": {
    "eslint": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install`

- [ ] **Step 3: Write the failing test**

`packages/eslint-config/test/raw-database-access-guard.test.js`:
```js
// Proves the raw-database guard fires on code that could switch organization inside db.forOrg(), and stays quiet otherwise.
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { rawDatabaseAccessGuard } from "../index.js";

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [{ files: ["**/*.ts"], languageOptions: { parser: tseslint.parser } }, rawDatabaseAccessGuard],
});

/** The ids of the rules that report on a TypeScript snippet. */
async function rulesReportedFor(source) {
  const [result] = await eslint.lintText(source, { filePath: "sample.ts" });
  return result.messages.map((message) => message.ruleId);
}

describe("raw database access guard", () => {
  it("reports SQL that sets the organization, in a tagged template", async () => {
    const source = "await tx.$executeRaw`SELECT set_config('app.org_id', ${otherOrganization}, true)`;";
    expect(await rulesReportedFor(source)).toContain("no-restricted-syntax");
  });

  it("reports the organization setting in a plain string, whatever the case", async () => {
    expect(await rulesReportedFor(`const sql = "SET APP.ORG_ID = 'x'";`)).toEqual(["no-restricted-syntax"]);
    expect(await rulesReportedFor(`tx.$executeRaw(Prisma.raw("select set_config('x', 'y', true)"));`)).toEqual([
      "no-restricted-syntax",
    ]);
  });

  it("reports Prisma's raw-string methods", async () => {
    expect(await rulesReportedFor("await tx.$executeRawUnsafe(sql);")).toEqual(["no-restricted-properties"]);
    expect(await rulesReportedFor("await tx.$queryRawUnsafe(sql);")).toEqual(["no-restricted-properties"]);
  });

  it("allows ordinary parameterised raw SQL", async () => {
    expect(await rulesReportedFor("await tx.$queryRaw`SELECT count(*) FROM role WHERE key = ${key}`;")).toEqual([]);
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/eslint-config test`

Expected: FAIL. `../index.js` does not provide an export named `rawDatabaseAccessGuard`.

- [ ] **Step 5: Add the guard to the shared config**

`packages/eslint-config/index.js`:
```js
// Shared ESLint flat config: strict, type-aware TypeScript rules for every package.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const organizationSwitchMessage =
  "Only packages/db may set the organization (set_config / app.org_id). Inside db.forOrg() the organization is " +
  "fixed for the whole transaction; changing it would expose another organization's rows.";

/**
 * Blocks the two ways code outside packages/db could get round db.forOrg(): SQL that changes the organization setting,
 * and Prisma's *Unsafe raw methods, which take SQL as a plain string instead of parameters.
 * packages/db implements forOrg() and turns these rules off in its own config.
 */
export const rawDatabaseAccessGuard = {
  rules: {
    "no-restricted-properties": [
      "error",
      { property: "$executeRawUnsafe", message: "Use the $executeRaw tagged template: it sends values as parameters." },
      { property: "$queryRawUnsafe", message: "Use the $queryRaw tagged template: it sends values as parameters." },
    ],
    "no-restricted-syntax": [
      "error",
      { selector: "TemplateElement[value.raw=/set_config|app\\.org_id/i]", message: organizationSwitchMessage },
      { selector: "Literal[value=/set_config|app\\.org_id/i]", message: organizationSwitchMessage },
    ],
  },
};

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
    rawDatabaseAccessGuard,
    { files: ["**/*.js", "**/*.mjs", "**/*.cjs"], extends: [tseslint.configs.disableTypeChecked] },
  );
}
```

- [ ] **Step 6: Run the test to see it pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/eslint-config test`

Expected: 4 tests pass.

- [ ] **Step 7: Let `packages/db` write that SQL, and prove the guard fires there otherwise**

`packages/db/eslint.config.js`:
```js
// ESLint for @travel-crm/db: the shared strict config. This package implements db.forOrg(), so it alone may write the
// SQL that sets the organization and use Prisma's raw-string methods (see rawDatabaseAccessGuard).
import { base } from "@travel-crm/eslint-config";
import { defineConfig } from "eslint/config";

export default defineConfig(base({ tsconfigRootDir: import.meta.dirname }), {
  rules: { "no-restricted-properties": "off", "no-restricted-syntax": "off" },
});
```

First prove the guard is active in `base()`: lint `for-org.ts` with a temporary config that lacks the override.
```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
pnpm --filter @travel-crm/db generate
cd packages/db
printf '%s\n' 'import { base } from "@travel-crm/eslint-config";' 'export default base({ tsconfigRootDir: import.meta.dirname });' > eslint.config.probe.js
pnpm exec eslint -c eslint.config.probe.js src/for-org.ts; echo "exit=$?"
rm eslint.config.probe.js
```
Expected: one `no-restricted-syntax` error on the `set_config('app.org_id', …)` line of `src/for-org.ts`, and `exit=1`. The probe file is deleted afterwards.

- [ ] **Step 8: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`. Expected: green.

```bash
cd /Users/ak/personal/travel-crm
git add packages/eslint-config packages/db/eslint.config.js pnpm-lock.yaml
git commit -m "feat(eslint-config): block SQL that switches organization outside packages/db"
```

---

### Task 2: Better Auth's tables and our role tables

Better Auth needs its tables in our Postgres: `user`, `session`, `account`, `verification`, `member`, `invitation` and `two_factor`. They are written by hand from the CLI's output, in our naming: snake_case columns, uuid ids made by Prisma. `role` and `role_permission` are ours. They are organization-owned and under row-level security, because the spec's open question Q2 is answered "our own tables" (ADR 0005, Task 5).

**Files:**
- Modify: `packages/db/prisma/schema/base.prisma`, `packages/db/prisma/schema/organization.prisma`
- Create: `packages/db/prisma/schema/identity-auth.prisma`, `packages/db/prisma/schema/identity-roles.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_identity/migration.sql` (generated, then appended)
- Modify: `packages/db/test/org-table-fixtures.ts`
- Create: `packages/db/test/identity-tables.test.ts`, `packages/db/test/foreign-keys.test.ts`

**Interfaces:**
- Consumes: from plan 1, `app_enable_org_rls`, `createDatabase`, `createPrismaClient`, `createPlatformClient`, `createTestOrganization` (`test/helpers.ts`), `inject("dbUrls")`, `orgTableFixtures` and `signInTables`.
- Produces:
  - Prisma models and their client delegates: `User` (`user`), `Session`, `Account`, `Verification`, `Member` (`member`), `Invitation`, `TwoFactor` (`twoFactor`), `Role` (`role`), `RolePermission` (`rolePermission`).
  - `Organization` gains `logo`, `metadata` and `requireTwoFactor`.
  - New columns: `user.former_email`, `user.must_change_password`, `member.deleted_at`, `member.deleted_by`.
  - `role (organization_id, id, key, name, is_owner, created_at, updated_at, deleted_at, deleted_by)` with compound unique inputs `organizationId_id` and `organizationId_key`. The second is partial: unique among roles that are not deleted.
  - `role_permission (organization_id, role_id, permission, scope)`, primary key `(role_id, permission)`, with a foreign key `(organization_id, role_id)` → `role (organization_id, id)`.
  - CHECK constraints `role_key_format` (`^[a-z][a-z0-9-]{1,47}$`) and `role_permission_scope_value` (`own`, `all` or null).
  - `app_runtime` may UPDATE only `organization.require_two_factor` and `organization.updated_at`.
  - `signInTables` is `["invitation", "member"]`.

- [ ] **Step 1: Write the failing tests**

Replace `packages/db/test/org-table-fixtures.ts`:
```ts
// One row-creating function per organization-owned table. isolation.test.ts runs its checks on each, and fails if
// a table with an organization_id column is missing here. Add an entry whenever you add such a table.
import type { OrgTx } from "../src/for-org.js";

export const orgTableFixtures: Record<string, (tx: OrgTx) => Promise<unknown>> = {
  org_counter: (tx) => tx.orgCounter.create({ data: { key: "ISO-2000", value: 1 } }),
  role: (tx) => tx.role.create({ data: { key: "isolation-role", name: "Isolation role" } }),
  role_permission: async (tx) => {
    const role = await tx.role.create({ data: { key: "isolation-grant-role", name: "Isolation grant role" } });
    return tx.rolePermission.create({ data: { roleId: role.id, permission: "leads:view", scope: "all" } });
  },
};

/**
 * Tables that carry organization_id but stay outside row-level security because sign-in reads them before the
 * organization is known (spec section 4): Better Auth's member and invitation. Only the identity module may touch
 * them. identity-tables.test.ts pins this list, so adding to it is a visible decision.
 */
export const signInTables: readonly string[] = ["invitation", "member"];
```

`packages/db/test/identity-tables.test.ts`:
```ts
// Rules the identity tables enforce themselves: role key and scope formats, key reuse after a soft delete,
// one organization per user, the sign-in table list, and which organization columns the api may change.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import { createDatabase, type Database } from "../src/database.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";
import { signInTables } from "./org-table-fixtures.js";

describe("identity tables", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Identity tables");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("skips row-level security only for Better Auth's member and invitation tables", () => {
    expect(signInTables).toEqual(["invitation", "member"]);
  });

  it("only accepts role keys of lowercase letters, digits and hyphens that start with a letter", async () => {
    await expect(
      db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "senior-sales-2", name: "Senior sales" } })),
    ).resolves.toMatchObject({ key: "senior-sales-2" });
    for (const badKey of ["Sales", "2nd-shift", "sales manager", "s", "a".repeat(49)]) {
      await expect(
        db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: badKey, name: "Bad" } })),
      ).rejects.toThrow(/role_key_format/);
    }
  });

  it("only accepts own, all or no scope on a permission", async () => {
    const role = await db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "scoped", name: "Scoped" } }));
    await db.forOrg(organizationId, (tx) =>
      tx.rolePermission.createMany({
        data: [
          { roleId: role.id, permission: "leads:view", scope: "own" },
          { roleId: role.id, permission: "quotes:view", scope: "all" },
          { roleId: role.id, permission: "leads:create", scope: null },
        ],
      }),
    );
    await expect(
      db.forOrg(organizationId, (tx) =>
        tx.rolePermission.create({ data: { roleId: role.id, permission: "bookings:view", scope: "team" } }),
      ),
    ).rejects.toThrow(/role_permission_scope_value/);
  });

  it("lets a deleted role's key be used again, but never by two roles that are not deleted", async () => {
    const first = await db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "guides", name: "Guides" } }));
    await expect(
      db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "guides", name: "Guides again" } })),
    ).rejects.toThrow(/Unique constraint/);
    await db.forOrg(organizationId, (tx) =>
      tx.role.update({ where: { id: first.id }, data: { deletedAt: new Date(), deletedBy: first.id } }),
    );
    await expect(
      db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "guides", name: "Guides again" } })),
    ).resolves.toMatchObject({ key: "guides" });
  });

  it("keeps each user in at most one organization", async () => {
    const otherOrganizationId = await createTestOrganization(platform, "Identity tables, second");
    const runtime = createPrismaClient(urls.runtime, { max: 1 });
    try {
      const user = await runtime.user.create({ data: { name: "Ravi", email: `ravi-${organizationId}@example.test` } });
      await runtime.member.create({ data: { userId: user.id, organizationId, role: "sales" } });
      await expect(
        runtime.member.create({ data: { userId: user.id, organizationId: otherOrganizationId, role: "sales" } }),
      ).rejects.toThrow(/Unique constraint/);
    } finally {
      await runtime.$disconnect();
    }
  });

  it("lets the api change require_two_factor, but not an organization's name or sign-in code", async () => {
    const runtime = createPrismaClient(urls.runtime, { max: 1 });
    try {
      await expect(
        runtime.organization.update({ where: { id: organizationId }, data: { requireTwoFactor: true } }),
      ).resolves.toMatchObject({ requireTwoFactor: true });
      await expect(
        runtime.organization.update({ where: { id: organizationId }, data: { name: "Renamed" } }),
      ).rejects.toThrow(/permission denied/);
      await expect(
        runtime.organization.update({ where: { id: organizationId }, data: { code: "HIJACK1" } }),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await runtime.$disconnect();
    }
  });
});
```

`packages/db/test/foreign-keys.test.ts`:
```ts
// Fails when a foreign key between two organization-owned tables leaves out organization_id. Such a key would let a
// row point at another organization's row, because Postgres checks foreign keys without row-level security.
// Includes a probe (run in a rolled-back migrator transaction) proving the check fires.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";

type Queryable = Pick<Prisma.TransactionClient, "$queryRaw">;

/** Foreign keys from one organization table to another that do not pair organization_id with organization_id. */
async function foreignKeysWithoutOrganization(client: Queryable): Promise<string[]> {
  const rows = await client.$queryRaw<{ name: string }[]>`
    SELECT source.relname || '.' || fk.conname AS name
    FROM pg_constraint fk
    JOIN pg_class source ON source.oid = fk.conrelid
    JOIN pg_namespace n ON n.oid = source.relnamespace AND n.nspname = 'public'
    WHERE fk.contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = fk.conrelid AND a.attname = 'organization_id' AND NOT a.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = fk.confrelid AND a.attname = 'organization_id' AND NOT a.attisdropped)
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(fk.conkey, fk.confkey) AS pair(source_column, target_column)
        JOIN pg_attribute s ON s.attrelid = fk.conrelid AND s.attnum = pair.source_column
        JOIN pg_attribute t ON t.attrelid = fk.confrelid AND t.attnum = pair.target_column
        WHERE s.attname = 'organization_id' AND t.attname = 'organization_id')
    ORDER BY name`;
  return rows.map((row) => row.name);
}

class Rollback extends Error {}

describe("foreign keys between organization tables", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;

  beforeAll(() => {
    platform = createPlatformClient(urls.platform);
  });

  afterAll(async () => {
    await platform.$disconnect();
  });

  it("always include organization_id", async () => {
    expect(await foreignKeysWithoutOrganization(platform)).toEqual([]);
  });

  it("catches a foreign key that leaves organization_id out", async () => {
    const migrator = createPrismaClient(urls.migrator, { max: 1 });
    try {
      await expect(
        migrator.$transaction(async (tx) => {
          await tx.$executeRaw`CREATE TABLE fk_probe_parent (id uuid PRIMARY KEY, organization_id uuid NOT NULL,
                                 UNIQUE (organization_id, id))`;
          await tx.$executeRaw`CREATE TABLE fk_probe_child (organization_id uuid NOT NULL,
                                 parent_id uuid REFERENCES fk_probe_parent (id))`;
          expect(await foreignKeysWithoutOrganization(tx)).toEqual(["fk_probe_child.fk_probe_child_parent_id_fkey"]);
          await tx.$executeRaw`ALTER TABLE fk_probe_child DROP CONSTRAINT fk_probe_child_parent_id_fkey,
                                 ADD FOREIGN KEY (organization_id, parent_id) REFERENCES fk_probe_parent (organization_id, id)`;
          expect(await foreignKeysWithoutOrganization(tx)).toEqual([]);
          throw new Rollback("undo the probe tables");
        }),
      ).rejects.toBeInstanceOf(Rollback);
    } finally {
      await migrator.$disconnect();
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test`

Expected: FAIL. `tx.role` is undefined ("Cannot read properties of undefined (reading 'create')"), and the isolation suite's "has an isolation fixture for every table" fails because `role` and `role_permission` don't exist yet.

- [ ] **Step 3: Write the schema**

`packages/db/prisma/schema/base.prisma`. The `partialIndexes` preview feature lets `@@unique` take a `where`; ADR 0004 (Task 3) explains why it is used instead of hand-written SQL:
```prisma
// Prisma 7 generator: TypeScript output inside the package, ES modules.
generator client {
  provider        = "prisma-client"
  output          = "../../src/generated/prisma"
  moduleFormat    = "esm"
  // Lets @@unique take a `where`, for unique values that ignore soft-deleted rows (ADR 0004).
  previewFeatures = ["partialIndexes"]
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
/// Better Auth's organization plugin maps onto it: its `slug` field lives in our `code` column.
model Organization {
  id               String           @id @default(uuid(7)) @db.Uuid
  name             String
  /// Short sign-in code such as SHARMA: 3-12 capital letters or digits (CHECK organization_code_format).
  /// Usernames embed it, so it must not change once the organization has staff.
  code             String           @unique
  createdAt        DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)
  /// Better Auth organization plugin columns. Unused by our code.
  logo             String?
  metadata         String?
  /// When true, every member must turn on two-factor sign-in before using the app (spec 6.2).
  requireTwoFactor Boolean          @default(false) @map("require_two_factor")
  counters         OrgCounter[]
  members          Member[]
  invitations      Invitation[]
  roles            Role[]
  rolePermissions  RolePermission[]

  @@map("organization")
}
```

`packages/db/prisma/schema/identity-auth.prisma`:
```prisma
// Better Auth's tables (packages/domain/src/identity/auth). Written by hand from `npx auth@1.7.7 generate` output:
// snake_case columns, uuid ids made by Prisma (Better Auth runs with generateId: false).
// Sign-in tables: no row-level security, because Better Auth reads them before the organization is known.
// Only the identity module may use them (@travel-crm/db/identity); db.forOrg()'s OrgTx hides them.

/// A person who can sign in. Platform staff have role "admin" and no member row.
model User {
  id                 String    @id @default(uuid(7)) @db.Uuid
  name               String
  /// Unique across the product. Staff without email get a placeholder ending in @no-email.invalid.
  email              String    @unique
  emailVerified      Boolean   @default(false) @map("email_verified")
  image              String?
  createdAt          DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  /// username plugin: "<org code lowercased>:<username lowercased>", e.g. "sharma:ravi". Null when the person
  /// signs in only by email, and after they are removed.
  username           String?   @unique
  /// The username as the person typed it, e.g. "Ravi".
  displayUsername    String?   @map("display_username")
  /// admin plugin: "admin" for platform staff, otherwise null.
  role               String?
  banned             Boolean?  @default(false)
  banReason          String?   @map("ban_reason")
  banExpires         DateTime? @map("ban_expires") @db.Timestamptz(6)
  /// twoFactor plugin: true once the person has verified an authenticator code.
  twoFactorEnabled   Boolean?  @default(false) @map("two_factor_enabled")
  /// The email the person had before they were removed, so another organization can add them (ADR 0007).
  formerEmail        String?   @map("former_email")
  /// True after an admin sets a temporary password: the person must choose their own before using the app.
  mustChangePassword Boolean   @default(false) @map("must_change_password")

  sessions    Session[]
  accounts    Account[]
  member      Member?
  invitations Invitation[]
  twoFactors  TwoFactor[]

  @@map("user")
}

model Session {
  id                   String   @id @default(uuid(7)) @db.Uuid
  expiresAt            DateTime @map("expires_at") @db.Timestamptz(6)
  token                String   @unique
  createdAt            DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  ipAddress            String?  @map("ip_address")
  userAgent            String?  @map("user_agent")
  userId               String   @map("user_id") @db.Uuid
  user                 User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// organization plugin: set from the member row when the session is created (one user, one organization).
  activeOrganizationId String?  @map("active_organization_id") @db.Uuid
  /// admin plugin: the platform admin's user id while they impersonate this user, else null.
  impersonatedBy       String?  @map("impersonated_by") @db.Uuid

  @@index([userId])
  @@map("session")
}

/// Sign-in methods. Password sign-in is the account with providerId "credential"; password holds its hash.
model Account {
  id                    String    @id @default(uuid(7)) @db.Uuid
  accountId             String    @map("account_id")
  providerId            String    @map("provider_id")
  userId                String    @map("user_id") @db.Uuid
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?   @map("access_token")
  refreshToken          String?   @map("refresh_token")
  idToken               String?   @map("id_token")
  accessTokenExpiresAt  DateTime? @map("access_token_expires_at") @db.Timestamptz(6)
  refreshTokenExpiresAt DateTime? @map("refresh_token_expires_at") @db.Timestamptz(6)
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt             DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([userId])
  @@map("account")
}

/// Short-lived values: password-reset tokens, two-factor challenges.
model Verification {
  id         String   @id @default(uuid(7)) @db.Uuid
  identifier String
  value      String
  expiresAt  DateTime @map("expires_at") @db.Timestamptz(6)
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([identifier])
  @@map("verification")
}

/// A user's place in their organization. Soft-deleted when they are removed (spec 6.3).
model Member {
  id             String       @id @default(uuid(7)) @db.Uuid
  organizationId String       @map("organization_id") @db.Uuid
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  /// One user belongs to exactly one organization (spec 4). A removed person who joins again gets a new user.
  userId         String       @unique @map("user_id") @db.Uuid
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// Our role key (role.key in the same organization), e.g. "sales". Never Better Auth's owner/admin/member.
  role           String
  createdAt      DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  deletedAt      DateTime?    @map("deleted_at") @db.Timestamptz(6)
  /// The user id of whoever removed this member.
  deletedBy      String?      @map("deleted_by") @db.Uuid

  @@index([organizationId])
  @@map("member")
}

/// organization plugin. Unused until email invitations arrive (plan 4); kept so Better Auth's schema is complete.
model Invitation {
  id             String       @id @default(uuid(7)) @db.Uuid
  organizationId String       @map("organization_id") @db.Uuid
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  email          String
  role           String?
  status         String       @default("pending")
  expiresAt      DateTime     @map("expires_at") @db.Timestamptz(6)
  createdAt      DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  inviterId      String       @map("inviter_id") @db.Uuid
  user           User         @relation(fields: [inviterId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([email])
  @@map("invitation")
}

/// twoFactor plugin: the encrypted authenticator secret and backup codes of one user.
model TwoFactor {
  id                      String    @id @default(uuid(7)) @db.Uuid
  secret                  String
  backupCodes             String    @map("backup_codes")
  userId                  String    @map("user_id") @db.Uuid
  user                    User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  verified                Boolean?  @default(true)
  failedVerificationCount Int?      @default(0) @map("failed_verification_count")
  lockedUntil             DateTime? @map("locked_until") @db.Timestamptz(6)

  @@index([secret])
  @@index([userId])
  @@map("two_factor")
}
```

`packages/db/prisma/schema/identity-roles.prisma`:
```prisma
// Roles and their permissions (spec 6.5). Our own tables, not Better Auth's access control (ADR 0005).
// Organization-owned: row-level security applies (the migration calls app_enable_org_rls on both).

/// A named set of permissions in one organization, e.g. "Sales". member.role holds its key.
model Role {
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String           @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id             String           @id @default(uuid(7)) @db.Uuid
  /// Stable identifier stored in member.role, e.g. "sales" (CHECK role_key_format). Never changes.
  key            String
  name           String
  /// The Owner role holds every permission, including ones added to the catalog later. It has no
  /// role_permission rows and cannot be edited or deleted.
  isOwner        Boolean          @default(false) @map("is_owner")
  createdAt      DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt      DateTime?        @map("deleted_at") @db.Timestamptz(6)
  /// The user id of whoever deleted the role.
  deletedBy      String?          @map("deleted_by") @db.Uuid
  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  permissions    RolePermission[]

  /// Lets role_permission point at (organization_id, id), so a permission row can't name another organization's role.
  @@unique([organizationId, id])
  /// A key is unique among the organization's roles that are not deleted.
  @@unique([organizationId, key], where: { deletedAt: null })
  @@map("role")
}

/// One permission, such as "leads:create", granted to one role.
model RolePermission {
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String       @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  roleId         String       @map("role_id") @db.Uuid
  /// A key from the permission catalog (packages/domain/src/identity/permissions.ts).
  permission     String
  /// For view permissions: "own" (records assigned to the member) or "all". Null otherwise (CHECK role_permission_scope_value).
  scope          String?
  role           Role         @relation(fields: [organizationId, roleId], references: [organizationId, id], onDelete: Cascade)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)

  @@id([roleId, permission])
  @@map("role_permission")
}
```

Then: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db exec prisma format`. Expected: "Formatted prisma/schema"; the files above are already formatted, so nothing changes.

- [ ] **Step 4: Create the migration and append the hand-written SQL**

```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
pnpm db:up
pnpm --filter @travel-crm/db exec prisma migrate dev --create-only --name identity
```
Expected: `prisma/migrations/<timestamp>_identity/migration.sql` containing, among the generated SQL:
- `ALTER TABLE "organization" ADD COLUMN "logo" TEXT, … "require_two_factor" BOOLEAN NOT NULL DEFAULT false;`
- `CREATE TABLE` for `user`, `session`, `account`, `verification`, `member`, `invitation`, `two_factor`, `role` and `role_permission`;
- `CREATE UNIQUE INDEX "member_user_id_key" ON "member"("user_id");`
- `CREATE UNIQUE INDEX "role_organization_id_key_key" ON "role"("organization_id", "key") WHERE ("deleted_at" IS NULL);`
- `FOREIGN KEY ("organization_id", "role_id") REFERENCES "role"("organization_id", "id")`.

If the partial index has no `WHERE` clause, the `previewFeatures` line is missing from `base.prisma`.

Append this to the end of that `migration.sql`:
```sql

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation for our role tables (see app_enable_org_rls in the init migration).
-- Better Auth's member and invitation tables also carry organization_id but stay outside row-level security:
-- sign-in reads them before an organization is known (spec section 4).
SELECT app_enable_org_rls('role');
SELECT app_enable_org_rls('role_permission');

-- Role keys are stored in member.role: lowercase letters, digits and hyphens, starting with a letter.
ALTER TABLE "role" ADD CONSTRAINT role_key_format CHECK (key ~ '^[a-z][a-z0-9-]{1,47}$');

-- A view permission is limited to the member's own records or covers all of them (spec 6.5).
ALTER TABLE "role_permission"
  ADD CONSTRAINT role_permission_scope_value CHECK (scope IS NULL OR scope IN ('own', 'all'));

-- The api may change only the organization settings it owns. Everything else, including the sign-in code that
-- usernames embed, is changed by the platform console. Prisma sets updated_at on every update.
REVOKE UPDATE ON TABLE "organization" FROM app_runtime;
GRANT UPDATE (require_two_factor, updated_at) ON TABLE "organization" TO app_runtime;

-- Same as sql/bootstrap.sql, for databases bootstrapped before it revoked TEMPORARY: temp tables outlive a
-- transaction on a pooled connection, so nobody may create them.
DO $$ BEGIN EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database()); END $$;
```

Apply it and regenerate the client:
```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
pnpm --filter @travel-crm/db exec prisma migrate dev
pnpm --filter @travel-crm/db generate
```
Expected: the migration is applied, then "Generated Prisma Client".

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test`

Expected: all pass, including:
- the drift check in the global setup;
- 5 isolation tests each for `role` and `role_permission`;
- the probe test "catches a foreign key that leaves organization_id out", which builds such a key inside a rolled-back transaction, so the check is proven to fire.

If the drift check reports a difference, the schema and the migration disagree. Fix the migration; never loosen the check.

- [ ] **Step 6: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`. Expected: green.

```bash
cd /Users/ak/personal/travel-crm
git add packages/db
git commit -m "feat(db): add Better Auth and role tables with row-level security on roles"
```

---

### Task 3: Soft delete, the identity and testing entry points, and import rules

Spec section 5: deletes become updates, reads hide deleted rows, and `withDeleted()` brings them back. This task adds that as a Prisma client extension on every client `@travel-crm/db` makes. It also narrows `OrgTx`, so modules can't reach the sign-in tables or Prisma's raw-string methods. And it opens two deliberate doors, each guarded by an import rule:
- `@travel-crm/db/identity`, for Better Auth and the identity module;
- `@travel-crm/db/testing`, so other packages' tests reuse plan 1's Postgres setup.

**Files:**
- Create: `packages/db/src/soft-delete.ts`, `packages/db/src/identity.ts`, `packages/db/src/errors.ts`, `packages/db/test/testing.ts`
- Modify: `packages/db/src/client.ts`, `packages/db/src/for-org.ts`, `packages/db/src/platform.ts`, `packages/db/src/index.ts`, `packages/db/package.json`, `packages/db/test/schema-check.test.ts` (one type), `.dependency-cruiser.cjs`, `packages/db/README.md`, `docs/adr/README.md`
- Create: `packages/db/test/soft-delete.test.ts`, `packages/db/test/identity-database.test.ts`, `packages/db/test/errors.test.ts`, `docs/adr/0004-soft-delete.md`

**Interfaces:**
- Consumes: Task 2's models; plan 1's `forOrg`, `createDatabase`, `DatabaseOptions`, `createPlatformClient`, `createTestOrganization`, and `test/global-setup.ts` (which declares `inject("dbUrls")`).
- Produces:
  - `createPrismaClient(connectionString, options?)` now returns the extended client, and `type DatabaseClient = ReturnType<typeof createPrismaClient>`. `PlatformClient` is `DatabaseClient`.
  - `type IdentityTx`: a transaction with every model, but without `$executeRawUnsafe`/`$queryRawUnsafe`.
  - `type OrgTx = Omit<IdentityTx, "user" | "session" | "account" | "verification" | "twoFactor" | "organization" | "member" | "invitation">`.
  - `forOrg<T>(client: DatabaseClient, orgId: string, fn: (tx: IdentityTx) => Promise<T>): Promise<T>`. `Database.forOrg` still hands `fn` an `OrgTx`.
  - `softDeleteModels: readonly string[]` (`"Role"`, `"Member"`).
  - `withDeleted<T>(fn: () => Promise<T>): Promise<T>`.
  - `softDeleted(deletedBy: string): { deletedAt: Date; deletedBy: string }`.
  - `class HardDeleteError extends Error`, and `isUniqueViolation(error: unknown): boolean`.
  - `@travel-crm/db` also exports `isUniqueViolation`, `HardDeleteError`, `softDeleted`, `withDeleted`, and the types `Role` and `RolePermission`.
  - `@travel-crm/db/identity`:
    - `createIdentityDatabase(url: string, options?: DatabaseOptions): IdentityDatabase`;
    - `interface IdentityDatabase { readonly client: IdentityClient; forOrg<T>(orgId, fn: (tx: IdentityTx) => Promise<T>): Promise<T>; disconnect(): Promise<void> }`;
    - `type IdentityClient = DatabaseClient`, `type IdentityTx`, and `isUniqueViolation`.
  - `@travel-crm/db/testing` exports `createTestOrganization(platform, name?)` and `type DbUrls`; importing it brings in the `inject("dbUrls")` typing.
  - `@travel-crm/db/testing/global-setup` is plan 1's Vitest global setup.
  - Import rules: `db-internals-stay-in-db` (updated), `identity-database-only-in-identity`, `platform-database-only-in-platform` and `db-testing-only-in-tests`.

- [ ] **Step 1: Write the failing tests**

`packages/db/test/testing.ts` (the helpers other packages' tests import):
```ts
// Test helpers for other packages: `import { createTestOrganization } from "@travel-crm/db/testing"`.
// Their vitest.config.ts runs "@travel-crm/db/testing/global-setup", which starts Postgres and provides inject("dbUrls").
export type { DbUrls } from "./global-setup.js";
export { createTestOrganization } from "./helpers.js";
```

`packages/db/test/soft-delete.test.ts`:
```ts
// Soft delete (spec section 5): deleted rows disappear from reads and updates, hard deletes are refused,
// and withDeleted() brings deleted rows back into view for Trash screens and restoring.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { createIdentityDatabase, type IdentityDatabase } from "../src/identity.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { HardDeleteError, softDeleted, withDeleted } from "../src/soft-delete.js";
import { createTestOrganization } from "./helpers.js";

describe("soft delete", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let identityDatabase: IdentityDatabase;
  let organizationId: string;
  let deletedRoleId: string;
  const deletedBy = "0199c3a2-0000-7000-8000-000000000001";

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    identityDatabase = createIdentityDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Soft delete");
    deletedRoleId = await db.forOrg(organizationId, async (tx) => {
      await tx.role.create({ data: { key: "kept", name: "Kept" } });
      const role = await tx.role.create({ data: { key: "binned", name: "Binned" } });
      await tx.role.update({ where: { id: role.id }, data: softDeleted(deletedBy) });
      return role.id;
    });
  });

  afterAll(async () => {
    await identityDatabase.disconnect();
    await db.disconnect();
    await platform.$disconnect();
  });

  it("records when and by whom a row was deleted", async () => {
    const role = await withDeleted(() =>
      db.forOrg(organizationId, (tx) => tx.role.findUnique({ where: { id: deletedRoleId } })),
    );
    expect(role?.deletedBy).toBe(deletedBy);
    expect(role?.deletedAt).toBeInstanceOf(Date);
  });

  it("hides deleted rows from finds and counts", async () => {
    const keys = await db.forOrg(organizationId, async (tx) => (await tx.role.findMany()).map((role) => role.key));
    expect(keys).toEqual(["kept"]);
    expect(await db.forOrg(organizationId, (tx) => tx.role.findUnique({ where: { id: deletedRoleId } }))).toBeNull();
    expect(await db.forOrg(organizationId, (tx) => tx.role.count({ where: { key: "binned" } }))).toBe(0);
  });

  it("does not update deleted rows", async () => {
    await expect(
      db.forOrg(organizationId, (tx) => tx.role.update({ where: { id: deletedRoleId }, data: { name: "Changed" } })),
    ).rejects.toThrow(/not found|No record/i);
    expect(await db.forOrg(organizationId, (tx) => tx.role.updateMany({ data: { name: "Renamed" } }))).toEqual({
      count: 1,
    });
  });

  it("refuses hard deletes before touching the database, leaving the transaction usable", async () => {
    const stillThere = await db.forOrg(organizationId, async (tx) => {
      await expect(tx.role.deleteMany()).rejects.toBeInstanceOf(HardDeleteError);
      await expect(tx.role.delete({ where: { id: deletedRoleId } })).rejects.toBeInstanceOf(HardDeleteError);
      return tx.role.count();
    });
    expect(stillThere).toBe(1);
  });

  it("shows deleted rows inside withDeleted(), inside or around forOrg()", async () => {
    const inside = await db.forOrg(organizationId, (tx) =>
      withDeleted(() => tx.role.findMany({ where: { deletedAt: { not: null } } })),
    );
    expect(inside.map((role) => role.id)).toEqual([deletedRoleId]);
    const around = await withDeleted(() => db.forOrg(organizationId, (tx) => tx.role.count()));
    expect(around).toBe(2);
  });

  it("restores a row inside withDeleted()", async () => {
    await db.forOrg(organizationId, (tx) =>
      withDeleted(() => tx.role.update({ where: { id: deletedRoleId }, data: { deletedAt: null, deletedBy: null } })),
    );
    expect(await db.forOrg(organizationId, (tx) => tx.role.count())).toBe(2);
  });

  it("applies to members, which the identity module reaches without forOrg()", async () => {
    const { client } = identityDatabase;
    const user = await client.user.create({
      data: { name: "Removed", email: `removed-${organizationId}@example.test` },
    });
    await client.member.create({ data: { userId: user.id, organizationId, role: "kept" } });
    await client.member.update({ where: { userId: user.id }, data: softDeleted(deletedBy) });
    expect(await client.member.findUnique({ where: { userId: user.id } })).toBeNull();
    await expect(client.member.deleteMany({ where: { userId: user.id } })).rejects.toBeInstanceOf(HardDeleteError);
    // Relations loaded with include are not filtered: query the soft-delete model itself.
    const withMember = await client.user.findUnique({ where: { id: user.id }, include: { member: true } });
    expect(withMember?.member?.deletedBy).toBe(deletedBy);
  });
});
```

`packages/db/test/identity-database.test.ts`:
```ts
// @travel-crm/db/identity: organization transactions that also reach the sign-in tables, and a client for Better Auth
// that sets no organization. OrgTx, which every other module gets, hides the sign-in tables and raw-string SQL.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { OrgTx } from "../src/for-org.js";
import { createIdentityDatabase, type IdentityDatabase } from "../src/identity.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

describe("identity database", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let identityDatabase: IdentityDatabase;
  let organizationId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    identityDatabase = createIdentityDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Identity database");
  });

  afterAll(async () => {
    await identityDatabase.disconnect();
    await platform.$disconnect();
  });

  it("reaches the sign-in tables and the organization's own rows in one transaction", async () => {
    const result = await identityDatabase.forOrg(organizationId, async (tx) => {
      const role = await tx.role.create({ data: { key: "guide", name: "Guide" } });
      const user = await tx.user.create({ data: { name: "Meera", email: `meera-${organizationId}@example.test` } });
      const member = await tx.member.create({ data: { userId: user.id, organizationId, role: role.key } });
      return { roleOrganization: role.organizationId, memberRole: member.role };
    });
    expect(result).toEqual({ roleOrganization: organizationId, memberRole: "guide" });
  });

  it("sees no organization-owned rows through the client, which sets no organization", async () => {
    expect(await identityDatabase.client.role.count()).toBe(0);
    expect(await identityDatabase.client.member.count({ where: { organizationId } })).toBe(1);
  });

  it("hides the sign-in tables and raw-string SQL from OrgTx", () => {
    // Compile-time checks: `pnpm typecheck` fails if OrgTx exposes any of these again.
    const hidden = (tx: OrgTx): unknown[] => [
      // @ts-expect-error member has no row-level security; only the identity module may query it
      tx.member,
      // @ts-expect-error user is a sign-in table
      tx.user,
      // @ts-expect-error organization is a sign-in table
      tx.organization,
      // @ts-expect-error raw-string SQL could switch the organization
      tx.$executeRawUnsafe,
      // @ts-expect-error raw-string SQL could switch the organization
      tx.$queryRawUnsafe,
    ];
    expect(typeof hidden).toBe("function");
  });
});
```

`packages/db/test/errors.test.ts`:
```ts
// isUniqueViolation lets other packages turn a taken email or key into a friendly error without importing Prisma.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { isUniqueViolation } from "../src/errors.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

describe("isUniqueViolation", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Unique violations");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("recognises a taken unique value, and nothing else", async () => {
    await db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "twice", name: "Twice" } }));
    const duplicate = await db
      .forOrg(organizationId, (tx) => tx.role.create({ data: { key: "twice", name: "Twice" } }))
      .catch((error: unknown) => error);
    expect(isUniqueViolation(duplicate)).toBe(true);
    const badKey = await db
      .forOrg(organizationId, (tx) => tx.role.create({ data: { key: "Not Valid", name: "Bad" } }))
      .catch((error: unknown) => error);
    expect(isUniqueViolation(badKey)).toBe(false);
    expect(isUniqueViolation(new Error("P2002"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test`

Expected: FAIL. Vitest cannot resolve `../src/soft-delete.js`, `../src/identity.js` or `../src/errors.js`.

- [ ] **Step 3: Write the soft-delete extension and apply it to every client**

`packages/db/src/soft-delete.ts`:
```ts
// Soft delete (spec section 5): rows of these models are never removed, only marked deleted, and reads skip them.
import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "./generated/prisma/client.js";

/** Models whose tables have deleted_at and deleted_by. Add a model here when you give its table those columns. */
export const softDeleteModels: readonly string[] = [Prisma.ModelName.Role, Prisma.ModelName.Member];

/** Operations that must neither see nor change deleted rows. Creates are unaffected; deletes are refused. */
const operationsThatSkipDeletedRows = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
]);

const includeDeletedRows = new AsyncLocalStorage<true>();

/**
 * Runs fn with deleted rows visible to reads and updates, for Trash screens and restoring:
 * `await withDeleted(() => tx.role.findMany({ where: { deletedAt: { not: null } } }))`.
 */
export async function withDeleted<T>(fn: () => Promise<T>): Promise<T> {
  // Awaiting inside run() matters: Prisma queries start when awaited, and the flag only exists inside run().
  return includeDeletedRows.run(true, async () => await fn());
}

/** The fields that soft-delete a row: `tx.role.update({ where: { id }, data: softDeleted(userId) })`. */
export function softDeleted(deletedBy: string): { deletedAt: Date; deletedBy: string } {
  return { deletedAt: new Date(), deletedBy };
}

/** Thrown instead of deleting a row of a soft-delete model. Nothing is sent to the database. */
export class HardDeleteError extends Error {
  constructor(model: string) {
    super(`${model} rows are never deleted. Set deletedAt and deletedBy instead: data: softDeleted(userId).`);
    this.name = "HardDeleteError";
  }
}

export const softDelete = Prisma.defineExtension({
  name: "soft-delete",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!softDeleteModels.includes(model)) return query(args);
        // A rewritten delete could not record who deleted the row, so deletes are refused rather than rewritten.
        if (operation === "delete" || operation === "deleteMany") throw new HardDeleteError(model);
        if (!operationsThatSkipDeletedRows.has(operation) || includeDeletedRows.getStore()) return query(args);
        const { where } = args as { where?: object };
        return query({ ...args, where: { ...where, deletedAt: null } });
      },
    },
  },
});
```

Replace `packages/db/src/client.ts`:
```ts
// Creates the Prisma client behind every entry point: the node-postgres driver plus the soft-delete extension.
// Internal: other packages go through index.ts, identity.ts or platform.ts.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { softDelete } from "./soft-delete.js";

export interface ClientOptions {
  /** Largest number of open connections in this client's pool. */
  max?: number;
}

export function createPrismaClient(connectionString: string, options: ClientOptions = {}) {
  const adapter = new PrismaPg({ connectionString, max: options.max ?? 10 });
  return new PrismaClient({ adapter }).$extends(softDelete);
}

/** Prisma's client with the soft-delete extension applied. */
export type DatabaseClient = ReturnType<typeof createPrismaClient>;
```

Replace `packages/db/src/platform.ts`:
```ts
// Entry point for the platform console only: a client that sees every organization (platform_access policy).
import { createPrismaClient, type DatabaseClient } from "./client.js";

export type PlatformClient = DatabaseClient;

/** Connect as the app_platform role. Never use this for requests made by an organization's staff. */
export function createPlatformClient(url: string): PlatformClient {
  return createPrismaClient(url);
}
```

- [ ] **Step 4: Narrow `OrgTx`, and add the identity entry point**

Replace `packages/db/src/for-org.ts`. The checks are plan 1's; the types are new:
```ts
// Runs work inside one transaction scoped to one organization. Postgres row-level security does the scoping.
import type { ITXClientDenyList } from "@prisma/client/runtime/client";
import type { DatabaseClient } from "./client.js";

/**
 * Better Auth's tables. They have no row-level security, because sign-in reads them before the organization is known,
 * so OrgTx hides them. Only the identity module reaches them, through @travel-crm/db/identity.
 */
type SignInModel =
  "user" | "session" | "account" | "verification" | "twoFactor" | "organization" | "member" | "invitation";

/** Prisma's methods that take SQL as a plain string. The tagged-template $queryRaw and $executeRaw remain. */
type RawStringMethod = "$executeRawUnsafe" | "$queryRawUnsafe";

/** A transaction bound to one organization that can also reach the sign-in tables. Only the identity module gets one. */
export type IdentityTx = Omit<DatabaseClient, ITXClientDenyList | RawStringMethod>;

/** A transaction bound to one organization: every query sees and writes only that organization's rows. */
export type OrgTx = Omit<IdentityTx, SignInModel>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Thrown before any SQL runs when the organization id is not a UUID. */
export class InvalidOrganizationIdError extends Error {
  constructor(value: string) {
    super(`Not a valid organization id: ${JSON.stringify(value.slice(0, 64))}`);
    this.name = "InvalidOrganizationIdError";
  }
}

/** Thrown when the connection is not the app_runtime role: other roles see every organization's rows. */
export class WrongDatabaseRoleError extends Error {
  constructor(role: string | undefined) {
    super(
      `forOrg() is connected to the database as ${JSON.stringify(role)}, but isolation only holds for app_runtime. ` +
        "DATABASE_URL must connect as the app_runtime role (not app_migrator, app_platform or an admin user).",
    );
    this.name = "WrongDatabaseRoleError";
  }
}

export async function forOrg<T>(client: DatabaseClient, orgId: string, fn: (tx: IdentityTx) => Promise<T>): Promise<T> {
  if (!UUID_PATTERN.test(orgId)) {
    throw new InvalidOrganizationIdError(orgId);
  }
  return client.$transaction(async (tx) => {
    // One round trip checks who we are and sets the organization. is_local = true: the setting ends with this
    // transaction, so a pooled connection never carries it over.
    const [session] = await tx.$queryRaw<{ role: string }[]>`
      SELECT current_user AS role, set_config('app.org_id', ${orgId}, true)`;
    if (session?.role !== "app_runtime") {
      throw new WrongDatabaseRoleError(session?.role);
    }
    return fn(tx);
  });
}
```

`packages/db/src/errors.ts`:
```ts
// Recognising database errors without importing Prisma: other packages may not import @prisma/client.
import { Prisma } from "./generated/prisma/client.js";

/** True when a write failed because a unique value (an email, a username, a role key) is already taken. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
```

`packages/db/src/identity.ts`:
```ts
// Entry point for the identity module only (dependency-cruiser enforces it). It reaches Better Auth's sign-in tables
// (user, session, account, verification, two_factor, organization, member, invitation), which have no row-level
// security because sign-in reads them before the organization is known.
import { createPrismaClient, type DatabaseClient } from "./client.js";
import type { DatabaseOptions } from "./database.js";
import { forOrg, type IdentityTx } from "./for-org.js";

export { isUniqueViolation } from "./errors.js";
export type { IdentityTx } from "./for-org.js";

/**
 * For Better Auth's adapter and for sign-in lookups made before an organization is known. It sets no organization,
 * so organization-owned tables return no rows through it.
 */
export type IdentityClient = DatabaseClient;

export interface IdentityDatabase {
  readonly client: IdentityClient;
  /** Like db.forOrg(), but the transaction can also reach the sign-in tables. Filter them by organization yourself. */
  forOrg<T>(orgId: string, fn: (tx: IdentityTx) => Promise<T>): Promise<T>;
  /** Closes the connection pool. */
  disconnect(): Promise<void>;
}

/** Connects as the app_runtime role, like createDatabase(). */
export function createIdentityDatabase(url: string, options: DatabaseOptions = {}): IdentityDatabase {
  const client = createPrismaClient(url, { max: options.maxConnections ?? 10 });
  return {
    client,
    forOrg: (orgId, fn) => forOrg(client, orgId, fn),
    disconnect: () => client.$disconnect(),
  };
}
```

Replace `packages/db/src/index.ts`:
```ts
// Public API of @travel-crm/db. Anything not exported here is internal to the package.
export { createDatabase, type Database, type DatabaseOptions } from "./database.js";
export { nextDocumentNumber, type DocumentNumberOptions } from "./counters.js";
export { isUniqueViolation } from "./errors.js";
export { InvalidOrganizationIdError, WrongDatabaseRoleError, type OrgTx } from "./for-org.js";
export { HardDeleteError, softDeleted, withDeleted } from "./soft-delete.js";
export type { Organization, OrgCounter, Role, RolePermission } from "./generated/prisma/client.js";
```

Replace `packages/db/package.json` (new `exports` entries; nothing else changes):
```json
{
  "name": "@travel-crm/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./identity": "./src/identity.ts",
    "./platform": "./src/platform.ts",
    "./testing": "./test/testing.ts",
    "./testing/global-setup": "./test/global-setup.ts"
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

Plan 1's schema-check test types its probe callback as Prisma's own transaction client, which the extended client's transactions no longer match. In `packages/db/test/schema-check.test.ts`, add this import after the `createPrismaClient` import:
```ts
import type { IdentityTx } from "../src/for-org.js";
```
and change the `probe` function's signature line to:
```ts
async function probe(migratorUrl: string, run: (tx: IdentityTx) => Promise<void>): Promise<void> {
```
Nothing else in that file changes.

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db typecheck && pnpm --filter @travel-crm/db test`

Expected:
- `typecheck` passes. That proves the `@ts-expect-error` lines in `identity-database.test.ts`: if `OrgTx` exposed `member`, `user`, `organization` or the `*Unsafe` methods, the expect-error lines would themselves be errors.
- All db tests pass: 64 in 10 files.

- [ ] **Step 6: Add the import rules and prove they fire**

In `.dependency-cruiser.cjs`, widen the `db-internals-stay-in-db` rule and add three rules after it.

Find:
```js
    {
      name: "db-internals-stay-in-db",
      comment:
        "Other packages reach @travel-crm/db only through its public entry points (index.ts, platform.ts), " +
        "so the raw Prisma client and the generated code never leak out of the package.",
      severity: "error",
      from: { path: "^(apps|packages)/", pathNot: "^packages/db/" },
      to: { path: "^packages/db/src/", pathNot: "^packages/db/src/(index|platform)\\.ts$" },
    },
```

Replace it with:
```js
    {
      name: "db-internals-stay-in-db",
      comment:
        "Other packages reach @travel-crm/db only through its entry points (index, identity, platform, and the " +
        "test-only testing files), so the raw Prisma client and the generated code never leak out of the package.",
      severity: "error",
      from: { path: "^(apps|packages)/", pathNot: "^packages/db/" },
      to: {
        path: "^packages/db/(src|test)/",
        pathNot: "^packages/db/(src/(index|identity|platform)|test/(testing|global-setup))\\.ts$",
      },
    },
    {
      name: "identity-database-only-in-identity",
      comment:
        "@travel-crm/db/identity reaches Better Auth's sign-in tables, which have no row-level security. " +
        "Only the identity module may use it (spec section 4).",
      severity: "error",
      from: { pathNot: ["^packages/db/", "^packages/domain/(src|test)/identity/"] },
      to: { path: "^packages/db/src/identity\\.ts$" },
    },
    {
      name: "platform-database-only-in-platform",
      comment:
        "@travel-crm/db/platform sees every organization. Only the platform module and tests may use it; " +
        "the api and worker never get DATABASE_PLATFORM_URL.",
      severity: "error",
      from: { pathNot: ["^packages/db/", "^packages/domain/src/platform/", "(^|/)test/"] },
      to: { path: "^packages/db/src/platform\\.ts$" },
    },
    {
      name: "db-testing-only-in-tests",
      comment: "@travel-crm/db/testing starts Postgres containers and creates organizations. Only tests may use it.",
      severity: "error",
      from: { pathNot: ["^packages/db/", "(^|/)test/"] },
      to: { path: "^packages/db/test/" },
    },
```

In the same file's `no-deprecated-core` rule, drop the `async_hooks` entry, because `soft-delete.ts` uses its stable `AsyncLocalStorage`.

Find:
```js
          "^async_hooks$",
```

Replace it with:
```js
          // async_hooks is left out: its AsyncLocalStorage is stable (soft-delete.ts uses it); only createHook is not.
```

Prove the rules fire with probe files that import through relative paths, then delete them:
```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
mkdir -p packages/probe/src packages/probe/test
echo 'import { createIdentityDatabase } from "../../db/src/identity.js"; import { createPlatformClient } from "../../db/src/platform.js"; import { createTestOrganization } from "../../db/test/testing.js"; export const probe = [createIdentityDatabase, createPlatformClient, createTestOrganization];' > packages/probe/src/probe.ts
echo 'import { createPlatformClient } from "../../db/src/platform.js"; import { createTestOrganization } from "../../db/test/testing.js"; export const allowed = [createPlatformClient, createTestOrganization];' > packages/probe/test/allowed.ts
pnpm exec depcruise packages --config .dependency-cruiser.cjs | grep error
rm -rf packages/probe
pnpm run depcruise
```
Expected: three errors, all from `packages/probe/src/probe.ts`: `identity-database-only-in-identity`, `platform-database-only-in-platform` and `db-testing-only-in-tests`. Nothing from `packages/probe/test/allowed.ts`, because tests may use the platform client and the testing helpers. After the probe is deleted, `pnpm run depcruise` reports no violations.

- [ ] **Step 7: Record the decision and document the entry points**

`docs/adr/0004-soft-delete.md`:
```markdown
# 0004: Soft delete

Date: 2026-10-14 · Status: accepted · Implements spec section 5

## Decision

- Soft-deletable tables have `deleted_at` and `deleted_by`. Their models are listed in `softDeleteModels`
  (`packages/db/src/soft-delete.ts`): `Role` and `Member` so far.
- A Prisma client extension, on every client `@travel-crm/db` creates:
  - adds `deletedAt: null` to the `where` of finds, counts, aggregates, group-bys and updates, so deleted rows can't be
    seen or changed;
  - refuses `delete` and `deleteMany` with `HardDeleteError`, before any SQL is sent.
- Deleting is an update: `tx.role.update({ where: { id }, data: softDeleted(userId) })`.
- `withDeleted(() => …)` shows deleted rows to the queries inside it, for Trash screens and restoring.
- Values unique among live rows, such as role keys, use partial unique indexes:
  `@@unique([organizationId, key], where: { deletedAt: null })`, from Prisma's `partialIndexes` preview feature.

## Context

- **Deletes are refused, not rewritten.** The spec says deletes become updates. A rewritten `delete()` could not record
  who deleted the row (`deleted_by`), and a query extension cannot switch to another operation without leaving the
  interactive transaction, and with it `db.forOrg()`'s organization. Refusing deletes and offering
  `softDeleted(userId)` keeps both.
- **`withDeleted()` uses AsyncLocalStorage.** The escape is scoped to one callback, works inside or around
  `db.forOrg()`, and changes no types at call sites.
- **Partial indexes come from Prisma, not hand-written SQL.** Plan 1's drift check (`prisma migrate diff`) would report
  an index Prisma doesn't know about. With the preview feature Prisma writes
  `CREATE UNIQUE INDEX … WHERE ("deleted_at" IS NULL)` itself and the drift check stays strict. If Prisma drops the
  feature, the indexes move to hand-written SQL and the drift check needs an exception.
- **Includes are not filtered.** `include: { member: true }` returns a deleted member. Query the soft-delete model
  itself when that matters.

## Consequences

- A removed person or a deleted role disappears from every read but stays for history and restoring.
- Permanent deletion (spec section 5: platform purge, DPDP erasure) needs raw SQL as the platform role: a deliberate
  step, designed with the platform console.
```

Replace `docs/adr/README.md`:
```markdown
# Architecture decision records

Each record states a decision, the context, and the consequences, so it can be revisited knowingly.
The first and largest set of decisions is the Foundation spec: `docs/superpowers/specs/2026-10-13-foundation-design.md`.

| #                                      | Decision                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------- |
| [0001](0001-toolchain.md)              | Toolchain versions: Node 24, pnpm 12, TypeScript 6.0.3, Prisma 7.10        |
| [0002](0002-row-level-security.md)     | How organization isolation is implemented in Postgres                      |
| [0003](0003-repository-conventions.md) | Repository conventions: Prettier, husky, lint-staged, commitlint, Renovate |
| [0004](0004-soft-delete.md)            | Soft delete: hidden rows, refused hard deletes, partial unique indexes     |
```

Replace `packages/db/README.md`:
```markdown
# @travel-crm/db

The database layer: Prisma schema, migrations, and the rules that keep each organization's data apart.

## Using it

    import { createDatabase, nextDocumentNumber } from "@travel-crm/db";

    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const db = createDatabase(url);   // must connect as the app_runtime role; forOrg() checks
    const number = await db.forOrg(orgId, (tx) => nextDocumentNumber(tx, { prefix: "BK", year: 2026 }));

Organization data is reachable only inside `db.forOrg()`. Postgres row-level security limits every query in that
transaction to `orgId`'s rows; outside it, queries see nothing.

## Entry points

| Import                                | For                      | Gives                                                                         |
| ------------------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| `@travel-crm/db`                      | every module             | `createDatabase`, `OrgTx`, `nextDocumentNumber`, `softDeleted`, `withDeleted` |
| `@travel-crm/db/identity`             | the identity module only | Better Auth's client, and `forOrg` transactions that reach the sign-in tables |
| `@travel-crm/db/platform`             | the platform module only | a client that sees every organization                                         |
| `@travel-crm/db/testing`              | tests only               | `createTestOrganization`, the `DbUrls` type                                   |
| `@travel-crm/db/testing/global-setup` | other packages' Vitest   | the throwaway Postgres; `inject("dbUrls")` in tests                           |

dependency-cruiser enforces the "only" column. Another package's `vitest.config.ts` uses the test database like this:

    globalSetup: [createRequire(import.meta.url).resolve("@travel-crm/db/testing/global-setup")],

## Adding a table that belongs to an organization

1. Add the model in `prisma/schema/<module>.prisma` with this exact line, plus a relation to `Organization`:

       organizationId String @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid

2. Create the migration: `pnpm --filter @travel-crm/db exec prisma migrate dev --create-only --name <change>`
3. Append to the new `migration.sql`: `SELECT app_enable_org_rls('<table_name>');`
4. Apply and regenerate: `pnpm --filter @travel-crm/db exec prisma migrate dev && pnpm --filter @travel-crm/db generate`
5. Add a row-creating entry for the table to `test/org-table-fixtures.ts`.
6. `pnpm check`. The isolation suite now covers the new table.

Steps 3 and 5 are enforced: the tests fail if either is missing. A foreign key to another organization table must
include `organization_id` (`@relation(fields: [organizationId, otherId], references: [organizationId, id])`).

## Soft delete

Rows of soft-delete models are never removed (ADR 0004). To make a model soft-deletable:

1. Give it `deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)` and `deletedBy String? @map("deleted_by") @db.Uuid`.
2. Add its model name to `softDeleteModels` in `src/soft-delete.ts`.
3. Make unique values ignore deleted rows: `@@unique([organizationId, name], where: { deletedAt: null })`.

Delete with `tx.thing.update({ where: { id }, data: softDeleted(userId) })`. Reads and updates skip deleted rows;
`delete()` throws `HardDeleteError`. `withDeleted(() => …)` shows deleted rows for Trash screens and restoring.

## Roles

| Role           | Used by          | Sees                                  |
| -------------- | ---------------- | ------------------------------------- |
| `app_migrator` | migrations       | everything (owns the tables)          |
| `app_runtime`  | api and worker   | only the organization set by `forOrg` |
| `app_platform` | platform console | every organization                    |

`sql/bootstrap.sql` creates them locally and in tests. Why it works this way: [ADR 0002](../../docs/adr/0002-row-level-security.md).
```

- [ ] **Step 8: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`. Expected: green.

```bash
cd /Users/ak/personal/travel-crm
git add packages/db .dependency-cruiser.cjs docs/adr
git commit -m "feat(db): add soft delete, the identity entry point and test helpers for other packages"
```

---
### Task 3b: Keys on organization tables, the `signInTables` guard, and `forOrg` limits

Plan 1's final review added requirements after Tasks 1-3 were written and executed. This task brings the database package up to them:
- **Unique constraints on organization tables include `organization_id`.** A unique value shared across organizations tells one organization that another uses it. `role_permission`'s primary key was `(role_id, permission)`; a new migration makes it `(organization_id, role_id, permission)`.
- **The schema check covers unique constraints as well as foreign keys.** `organization-keys.test.ts` replaces Task 2's `foreign-keys.test.ts`, with a probe for each check. A primary key on `id` alone is exempt, because random UUIDs reveal nothing.
- **`signInTables` is guarded.** Every entry must exist, carry `organization_id`, and be `member` or `invitation`, so a typo or a stale entry can't exempt another table.
- **`forOrg` limits.** `forOrg` takes `{ timeout, maxWait }`, passed to Prisma's transaction. It refuses to run inside another `forOrg`: the inner transaction would use a second connection, blind to the outer one's uncommitted writes, and many at once would deadlock the pool.

The wider raw-SQL guard (session `SET`/`RESET`, `CREATE TEMP`) is already in, from Task 1's review fixes.

**Files:**
- Modify: `packages/db/prisma/schema/identity-roles.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_role_permission_key/migration.sql` (generated)
- Delete: `packages/db/test/foreign-keys.test.ts`
- Create: `packages/db/test/organization-keys.test.ts`, `packages/db/test/for-org-options.test.ts`
- Modify: `packages/db/test/identity-tables.test.ts`, `packages/db/test/org-table-fixtures.ts` (a comment)
- Modify: `packages/db/src/for-org.ts`, `packages/db/src/database.ts`, `packages/db/src/identity.ts`, `packages/db/src/index.ts`, `packages/db/README.md`

**Interfaces:**
- Consumes:
  - from Task 2, the `role_permission` table and `signInTables`;
  - from Task 3, `forOrg`, `createDatabase`, `createIdentityDatabase`, `IdentityTx`, `OrgTx` and `createTestOrganization`.
- Produces:
  - `role_permission`'s primary key is `(organization_id, role_id, permission)`, and Prisma's compound id becomes `organizationId_roleId_permission`. Nothing in this plan uses it by name.
  - Two schema checks, each with a probe:
    - every foreign key between two organization tables pairs `organization_id`;
    - every unique index on an organization table (sign-in tables apart) includes `organization_id`, except a primary key on `id` alone.
  - `interface ForOrgOptions { maxWait?: number; timeout?: number }`, Prisma's transaction limits (defaults 2 s and 5 s).
  - `forOrg<T>(client, orgId, fn, options?: ForOrgOptions)`, `Database.forOrg<T>(orgId, fn, options?)` and `IdentityDatabase.forOrg<T>(orgId, fn, options?)`.
  - `class NestedForOrgError extends Error`: a `forOrg` inside another throws it before any SQL runs.
  - New exports:
    - `@travel-crm/db` exports `NestedForOrgError` and `type ForOrgOptions`;
    - `@travel-crm/db/identity` exports `type ForOrgOptions`.

- [ ] **Step 1: Write the failing tests**

Task 2's foreign-key check moves into a file that also checks unique constraints:
```bash
cd /Users/ak/personal/travel-crm && git rm -q packages/db/test/foreign-keys.test.ts
```

`packages/db/test/organization-keys.test.ts`:
```ts
// Fails when a key on an organization-owned table leaves out organization_id:
// - a foreign key without it lets a row point at another organization's row, because Postgres checks foreign keys
//   without row-level security;
// - a unique constraint without it tells one organization that another already uses a value.
// The primary key on `id` alone is the exception: random UUIDs reveal nothing. Each check has a probe (run in a
// rolled-back migrator transaction) proving it fires.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import type { Prisma } from "../src/generated/prisma/client.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { signInTables } from "./org-table-fixtures.js";

type Queryable = Pick<Prisma.TransactionClient, "$queryRaw">;

/** Foreign keys from one organization table to another that do not pair organization_id with organization_id. */
async function foreignKeysWithoutOrganization(client: Queryable): Promise<string[]> {
  const rows = await client.$queryRaw<{ table_name: string; name: string }[]>`
    SELECT source.relname AS table_name, source.relname || '.' || fk.conname AS name
    FROM pg_constraint fk
    JOIN pg_class source ON source.oid = fk.conrelid
    JOIN pg_namespace n ON n.oid = source.relnamespace AND n.nspname = 'public'
    WHERE fk.contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = fk.conrelid AND a.attname = 'organization_id' AND NOT a.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = fk.confrelid AND a.attname = 'organization_id' AND NOT a.attisdropped)
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(fk.conkey, fk.confkey) AS pair(source_column, target_column)
        JOIN pg_attribute s ON s.attrelid = fk.conrelid AND s.attnum = pair.source_column
        JOIN pg_attribute t ON t.attrelid = fk.confrelid AND t.attnum = pair.target_column
        WHERE s.attname = 'organization_id' AND t.attname = 'organization_id')
    ORDER BY name`;
  return rows.filter((row) => !signInTables.includes(row.table_name)).map((row) => row.name);
}

/** Unique indexes (including primary keys) on organization tables that leave out organization_id. */
async function uniqueKeysWithoutOrganization(client: Queryable): Promise<string[]> {
  const rows = await client.$queryRaw<{ table_name: string; name: string }[]>`
    SELECT t.relname AS table_name, t.relname || '.' || i.relname AS name
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
    WHERE x.indisunique
      AND EXISTS (SELECT 1 FROM pg_attribute a
                  WHERE a.attrelid = t.oid AND a.attname = 'organization_id' AND NOT a.attisdropped)
      AND NOT EXISTS (SELECT 1 FROM pg_attribute a
                      WHERE a.attrelid = t.oid AND a.attnum = ANY (x.indkey::int2[]) AND a.attname = 'organization_id')
      AND NOT (x.indisprimary AND x.indnatts = 1 AND EXISTS (
        SELECT 1 FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attnum = x.indkey[0] AND a.attname = 'id'))
    ORDER BY name`;
  return rows.filter((row) => !signInTables.includes(row.table_name)).map((row) => row.name);
}

class Rollback extends Error {}

/** Runs setup SQL then assertions inside a migrator transaction that is always rolled back. */
async function probe(
  migratorUrl: string,
  run: (tx: Queryable & Pick<Prisma.TransactionClient, "$executeRaw">) => Promise<void>,
) {
  const migrator = createPrismaClient(migratorUrl, { max: 1 });
  try {
    await expect(
      migrator.$transaction(async (tx) => {
        await run(tx);
        throw new Rollback("undo the probe tables");
      }),
    ).rejects.toBeInstanceOf(Rollback);
  } finally {
    await migrator.$disconnect();
  }
}

describe("keys on organization tables", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;

  beforeAll(() => {
    platform = createPlatformClient(urls.platform);
  });

  afterAll(async () => {
    await platform.$disconnect();
  });

  it("pair organization_id in every foreign key to another organization table", async () => {
    expect(await foreignKeysWithoutOrganization(platform)).toEqual([]);
  });

  it("include organization_id in every unique constraint, except a primary key on id", async () => {
    expect(await uniqueKeysWithoutOrganization(platform)).toEqual([]);
  });

  it("catches a foreign key that leaves organization_id out", async () => {
    await probe(urls.migrator, async (tx) => {
      await tx.$executeRaw`CREATE TABLE fk_probe_parent (id uuid PRIMARY KEY, organization_id uuid NOT NULL,
                             UNIQUE (organization_id, id))`;
      await tx.$executeRaw`CREATE TABLE fk_probe_child (organization_id uuid NOT NULL,
                             parent_id uuid REFERENCES fk_probe_parent (id))`;
      expect(await foreignKeysWithoutOrganization(tx)).toEqual(["fk_probe_child.fk_probe_child_parent_id_fkey"]);
      await tx.$executeRaw`ALTER TABLE fk_probe_child DROP CONSTRAINT fk_probe_child_parent_id_fkey,
                             ADD FOREIGN KEY (organization_id, parent_id) REFERENCES fk_probe_parent (organization_id, id)`;
      expect(await foreignKeysWithoutOrganization(tx)).toEqual([]);
    });
  });

  it("catches a unique constraint that leaves organization_id out", async () => {
    await probe(urls.migrator, async (tx) => {
      await tx.$executeRaw`CREATE TABLE unique_probe (id uuid PRIMARY KEY, organization_id uuid NOT NULL, code text)`;
      expect(await uniqueKeysWithoutOrganization(tx)).toEqual([]);
      await tx.$executeRaw`CREATE UNIQUE INDEX unique_probe_code ON unique_probe (code)`;
      expect(await uniqueKeysWithoutOrganization(tx)).toEqual(["unique_probe.unique_probe_code"]);
      await tx.$executeRaw`DROP INDEX unique_probe_code`;
      await tx.$executeRaw`CREATE UNIQUE INDEX unique_probe_code ON unique_probe (organization_id, code)`;
      expect(await uniqueKeysWithoutOrganization(tx)).toEqual([]);
    });
  });
});
```

Replace `packages/db/test/identity-tables.test.ts`. Only its first test changes, into the `signInTables` guard:
```ts
// Rules the identity tables enforce themselves: role key and scope formats, key reuse after a soft delete,
// one organization per user, the sign-in table list, and which organization columns the api may change.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import { createDatabase, type Database } from "../src/database.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";
import { signInTables } from "./org-table-fixtures.js";

describe("identity tables", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Identity tables");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("exempts from row-level security only Better Auth tables that exist and carry organization_id", async () => {
    // The only Better Auth tables with organization_id. A typo or a stale entry must not exempt some other table.
    const betterAuthTablesWithOrganizationId = ["invitation", "member"];
    expect(signInTables.filter((table) => !betterAuthTablesWithOrganizationId.includes(table))).toEqual([]);
    expect(new Set(signInTables).size).toBe(signInTables.length);
    for (const table of signInTables) {
      const [column] = await platform.$queryRaw<{ found: number }[]>`
        SELECT count(*)::int AS found FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table} AND column_name = 'organization_id'`;
      expect(column?.found, `${table} must exist and have an organization_id column`).toBe(1);
    }
  });

  it("only accepts role keys of lowercase letters, digits and hyphens that start with a letter", async () => {
    await expect(
      db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "senior-sales-2", name: "Senior sales" } })),
    ).resolves.toMatchObject({ key: "senior-sales-2" });
    for (const badKey of ["Sales", "2nd-shift", "sales manager", "s", "a".repeat(49)]) {
      await expect(
        db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: badKey, name: "Bad" } })),
      ).rejects.toThrow(/role_key_format/);
    }
  });

  it("only accepts own, all or no scope on a permission", async () => {
    const role = await db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "scoped", name: "Scoped" } }));
    await db.forOrg(organizationId, (tx) =>
      tx.rolePermission.createMany({
        data: [
          { roleId: role.id, permission: "leads:view", scope: "own" },
          { roleId: role.id, permission: "quotes:view", scope: "all" },
          { roleId: role.id, permission: "leads:create", scope: null },
        ],
      }),
    );
    await expect(
      db.forOrg(organizationId, (tx) =>
        tx.rolePermission.create({ data: { roleId: role.id, permission: "bookings:view", scope: "team" } }),
      ),
    ).rejects.toThrow(/role_permission_scope_value/);
  });

  it("lets a deleted role's key be used again, but never by two roles that are not deleted", async () => {
    const first = await db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "guides", name: "Guides" } }));
    await expect(
      db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "guides", name: "Guides again" } })),
    ).rejects.toThrow(/Unique constraint/);
    await db.forOrg(organizationId, (tx) =>
      tx.role.update({ where: { id: first.id }, data: { deletedAt: new Date(), deletedBy: first.id } }),
    );
    await expect(
      db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "guides", name: "Guides again" } })),
    ).resolves.toMatchObject({ key: "guides" });
  });

  it("keeps each user in at most one organization", async () => {
    const otherOrganizationId = await createTestOrganization(platform, "Identity tables, second");
    const runtime = createPrismaClient(urls.runtime, { max: 1 });
    try {
      const user = await runtime.user.create({ data: { name: "Ravi", email: `ravi-${organizationId}@example.test` } });
      await runtime.member.create({ data: { userId: user.id, organizationId, role: "sales" } });
      await expect(
        runtime.member.create({ data: { userId: user.id, organizationId: otherOrganizationId, role: "sales" } }),
      ).rejects.toThrow(/Unique constraint/);
    } finally {
      await runtime.$disconnect();
    }
  });

  it("lets the api change require_two_factor, but not an organization's name or sign-in code", async () => {
    const runtime = createPrismaClient(urls.runtime, { max: 1 });
    try {
      await expect(
        runtime.organization.update({ where: { id: organizationId }, data: { requireTwoFactor: true } }),
      ).resolves.toMatchObject({ requireTwoFactor: true });
      await expect(
        runtime.organization.update({ where: { id: organizationId }, data: { name: "Renamed" } }),
      ).rejects.toThrow(/permission denied/);
      await expect(
        runtime.organization.update({ where: { id: organizationId }, data: { code: "HIJACK1" } }),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await runtime.$disconnect();
    }
  });
});
```

Replace `packages/db/test/org-table-fixtures.ts`. Only the comment on `signInTables` changes:
```ts
// One row-creating function per organization-owned table. isolation.test.ts runs its checks on each, and fails if
// a table with an organization_id column is missing here. Add an entry whenever you add such a table.
import type { OrgTx } from "../src/for-org.js";

export const orgTableFixtures: Record<string, (tx: OrgTx) => Promise<unknown>> = {
  org_counter: (tx) => tx.orgCounter.create({ data: { key: "ISO-2000", value: 1 } }),
  role: (tx) => tx.role.create({ data: { key: "isolation-role", name: "Isolation role" } }),
  role_permission: async (tx) => {
    const role = await tx.role.create({ data: { key: "isolation-grant-role", name: "Isolation grant role" } });
    return tx.rolePermission.create({ data: { roleId: role.id, permission: "leads:view", scope: "all" } });
  },
};

/**
 * Tables that carry organization_id but stay outside row-level security because sign-in reads them before the
 * organization is known (spec section 4): Better Auth's member and invitation. Only the identity module may touch
 * them. identity-tables.test.ts checks each entry exists and is one of those two, so no other table can be exempted.
 */
export const signInTables: readonly string[] = ["invitation", "member"];
```

`packages/db/test/for-org-options.test.ts`:
```ts
// forOrg() limits: a transaction past its timeout is rolled back, and a forOrg() inside another is refused rather than
// left to run on a second connection that can't see the first one's writes.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { NestedForOrgError } from "../src/for-org.js";
import { createIdentityDatabase, type IdentityDatabase } from "../src/identity.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

describe("forOrg options and nesting", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let identityDatabase: IdentityDatabase;
  let organizationId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    identityDatabase = createIdentityDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "forOrg options");
  });

  afterAll(async () => {
    await identityDatabase.disconnect();
    await db.disconnect();
    await platform.$disconnect();
  });

  it("rolls back a transaction that runs past its timeout", async () => {
    await expect(
      db.forOrg(
        organizationId,
        async (tx) => {
          await tx.orgCounter.create({ data: { key: "SLOW-2026", value: 1 } });
          await pause(400);
        },
        { timeout: 100 },
      ),
    ).rejects.toThrow(/timeout|expired|closed/i);
    expect(await db.forOrg(organizationId, (tx) => tx.orgCounter.count({ where: { key: "SLOW-2026" } }))).toBe(0);
  });

  it("refuses a forOrg() inside another, from the same or another database handle", async () => {
    await expect(
      db.forOrg(organizationId, () => db.forOrg(organizationId, (tx) => tx.role.count())),
    ).rejects.toBeInstanceOf(NestedForOrgError);
    await expect(
      identityDatabase.forOrg(organizationId, () => db.forOrg(organizationId, (tx) => tx.role.count())),
    ).rejects.toBeInstanceOf(NestedForOrgError);
  });

  it("allows one forOrg() after another, and many side by side", async () => {
    expect(await db.forOrg(organizationId, (tx) => tx.role.count())).toBe(0);
    expect(await db.forOrg(organizationId, (tx) => tx.role.count())).toBe(0);
    const counts = await Promise.all(
      Array.from({ length: 6 }, () => db.forOrg(organizationId, (tx) => tx.role.count())),
    );
    expect(counts).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db test`

Expected: FAIL.
- "include organization_id in every unique constraint, except a primary key on id" reports `role_permission.role_permission_pkey`.
- The `for-org-options` tests fail: `NestedForOrgError` isn't exported yet, and `forOrg` ignores the timeout.
- Everything else passes.

- [ ] **Step 3: Put `organization_id` into `role_permission`'s key**

Replace `packages/db/prisma/schema/identity-roles.prisma`. Only `RolePermission`'s `@@id` and its comment change:
```prisma
// Roles and their permissions (spec 6.5). Our own tables, not Better Auth's access control (ADR 0005).
// Organization-owned: row-level security applies (the migration calls app_enable_org_rls on both).

/// A named set of permissions in one organization, e.g. "Sales". member.role holds its key.
model Role {
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String           @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  id             String           @id @default(uuid(7)) @db.Uuid
  /// Stable identifier stored in member.role, e.g. "sales" (CHECK role_key_format). Never changes.
  key            String
  name           String
  /// The Owner role holds every permission, including ones added to the catalog later. It has no
  /// role_permission rows and cannot be edited or deleted.
  isOwner        Boolean          @default(false) @map("is_owner")
  createdAt      DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt      DateTime?        @map("deleted_at") @db.Timestamptz(6)
  /// The user id of whoever deleted the role.
  deletedBy      String?          @map("deleted_by") @db.Uuid
  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  permissions    RolePermission[]

  /// Lets role_permission point at (organization_id, id), so a permission row can't name another organization's role.
  @@unique([organizationId, id])
  /// A key is unique among the organization's roles that are not deleted.
  @@unique([organizationId, key], where: { deletedAt: null })
  @@map("role")
}

/// One permission, such as "leads:create", granted to one role.
model RolePermission {
  /// Filled from db.forOrg()'s organization when omitted.
  organizationId String       @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid
  roleId         String       @map("role_id") @db.Uuid
  /// A key from the permission catalog (packages/domain/src/identity/permissions.ts).
  permission     String
  /// For view permissions: "own" (records assigned to the member) or "all". Null otherwise (CHECK role_permission_scope_value).
  scope          String?
  role           Role         @relation(fields: [organizationId, roleId], references: [organizationId, id], onDelete: Cascade)
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)

  /// Unique constraints on organization tables include organization_id (organization-keys.test.ts checks).
  @@id([organizationId, roleId, permission])
  @@map("role_permission")
}
```

```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
pnpm db:up
pnpm --filter @travel-crm/db exec prisma migrate dev --create-only --name role_permission_key
```
Expected: `prisma/migrations/<timestamp>_role_permission_key/migration.sql`, exactly as Prisma writes it, with nothing to append:
```sql
/*
  Warnings:

  - The primary key for the `role_permission` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "role_permission" DROP CONSTRAINT "role_permission_pkey",
ADD CONSTRAINT "role_permission_pkey" PRIMARY KEY ("organization_id", "role_id", "permission");
```

Prisma's warning is about a partial failure. That can't happen here: a migration runs in one transaction, and the two clauses are one statement.

Apply it and regenerate:
```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
pnpm --filter @travel-crm/db exec prisma migrate dev
pnpm --filter @travel-crm/db generate
```

- [ ] **Step 4: Add the transaction options and the nesting guard**

Replace `packages/db/src/for-org.ts`:
```ts
// Runs work inside one transaction scoped to one organization. Postgres row-level security does the scoping.
import { AsyncLocalStorage } from "node:async_hooks";
import type { ITXClientDenyList } from "@prisma/client/runtime/client";
import type { DatabaseClient } from "./client.js";

/**
 * Better Auth's tables. They have no row-level security, because sign-in reads them before the organization is known,
 * so OrgTx hides them. Only the identity module reaches them, through @travel-crm/db/identity.
 */
type SignInModel =
  "user" | "session" | "account" | "verification" | "twoFactor" | "organization" | "member" | "invitation";

/** Prisma's methods that take SQL as a plain string. The tagged-template $queryRaw and $executeRaw remain. */
type RawStringMethod = "$executeRawUnsafe" | "$queryRawUnsafe";

/** A transaction bound to one organization that can also reach the sign-in tables. Only the identity module gets one. */
export type IdentityTx = Omit<DatabaseClient, ITXClientDenyList | RawStringMethod>;

/** A transaction bound to one organization: every query sees and writes only that organization's rows. */
export type OrgTx = Omit<IdentityTx, SignInModel>;

/** Limits for one forOrg() transaction, passed to Prisma. Prisma's defaults: wait 2 s for a connection, run 5 s. */
export interface ForOrgOptions {
  /** Longest wait for a free connection, in milliseconds. */
  maxWait?: number;
  /** Longest the transaction may run, in milliseconds. Past it, the work is rolled back and forOrg() rejects. */
  timeout?: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Set while a forOrg() transaction runs, to catch a forOrg() inside it. */
const insideForOrg = new AsyncLocalStorage<true>();

/** Thrown before any SQL runs when the organization id is not a UUID. */
export class InvalidOrganizationIdError extends Error {
  constructor(value: string) {
    super(`Not a valid organization id: ${JSON.stringify(value.slice(0, 64))}`);
    this.name = "InvalidOrganizationIdError";
  }
}

/** Thrown when the connection is not the app_runtime role: other roles see every organization's rows. */
export class WrongDatabaseRoleError extends Error {
  constructor(role: string | undefined) {
    super(
      `forOrg() is connected to the database as ${JSON.stringify(role)}, but isolation only holds for app_runtime. ` +
        "DATABASE_URL must connect as the app_runtime role (not app_migrator, app_platform or an admin user).",
    );
    this.name = "WrongDatabaseRoleError";
  }
}

/**
 * Thrown when forOrg() is called inside another forOrg(). The inner transaction would run on a second connection,
 * blind to the outer one's uncommitted writes, and enough of them at once would empty the pool and deadlock.
 * Pass the outer transaction's `tx` down instead.
 */
export class NestedForOrgError extends Error {
  constructor() {
    super("forOrg() was called inside another forOrg(). Pass the outer transaction's tx down instead.");
    this.name = "NestedForOrgError";
  }
}

/** Runs fn in one transaction that sees and changes only orgId's rows. Never call it inside another forOrg(). */
export async function forOrg<T>(
  client: DatabaseClient,
  orgId: string,
  fn: (tx: IdentityTx) => Promise<T>,
  options: ForOrgOptions = {},
): Promise<T> {
  if (!UUID_PATTERN.test(orgId)) {
    throw new InvalidOrganizationIdError(orgId);
  }
  if (insideForOrg.getStore()) {
    throw new NestedForOrgError();
  }
  return insideForOrg.run(true, async () =>
    client.$transaction(async (tx) => {
      // One round trip checks who we are and sets the organization. is_local = true: the setting ends with this
      // transaction, so a pooled connection never carries it over.
      const [session] = await tx.$queryRaw<{ role: string }[]>`
        SELECT current_user AS role, set_config('app.org_id', ${orgId}, true)`;
      if (session?.role !== "app_runtime") {
        throw new WrongDatabaseRoleError(session?.role);
      }
      return fn(tx);
    }, options),
  );
}
```

The guard uses AsyncLocalStorage, as `withDeleted()` does. It is scoped to one `forOrg` callback, so calls one after another, and many side by side, still work.

Replace `packages/db/src/database.ts`:
```ts
// The application's handle on the database: organization data is reachable only through forOrg().
import { createPrismaClient } from "./client.js";
import { forOrg, type ForOrgOptions, type OrgTx } from "./for-org.js";

export interface Database {
  /**
   * Runs fn in one transaction that can see and change only orgId's rows. The only way to reach organization data.
   * Never call it inside another forOrg() (it throws NestedForOrgError): pass that transaction's tx down instead.
   */
  forOrg<T>(orgId: string, fn: (tx: OrgTx) => Promise<T>, options?: ForOrgOptions): Promise<T>;
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
    forOrg: (orgId, fn, options) => forOrg(client, orgId, fn, options),
    disconnect: () => client.$disconnect(),
  };
}
```

Replace `packages/db/src/identity.ts`:
```ts
// Entry point for the identity module only (dependency-cruiser enforces it). It reaches Better Auth's sign-in tables
// (user, session, account, verification, two_factor, organization, member, invitation), which have no row-level
// security because sign-in reads them before the organization is known.
import { createPrismaClient, type DatabaseClient } from "./client.js";
import type { DatabaseOptions } from "./database.js";
import { forOrg, type ForOrgOptions, type IdentityTx } from "./for-org.js";

export { isUniqueViolation } from "./errors.js";
export type { ForOrgOptions, IdentityTx } from "./for-org.js";

/**
 * For Better Auth's adapter and for sign-in lookups made before an organization is known. It sets no organization,
 * so organization-owned tables return no rows through it.
 */
export type IdentityClient = DatabaseClient;

export interface IdentityDatabase {
  readonly client: IdentityClient;
  /** Like db.forOrg(), but the transaction can also reach the sign-in tables. Filter them by organization yourself. */
  forOrg<T>(orgId: string, fn: (tx: IdentityTx) => Promise<T>, options?: ForOrgOptions): Promise<T>;
  /** Closes the connection pool. */
  disconnect(): Promise<void>;
}

/** Connects as the app_runtime role, like createDatabase(). */
export function createIdentityDatabase(url: string, options: DatabaseOptions = {}): IdentityDatabase {
  const client = createPrismaClient(url, { max: options.maxConnections ?? 10 });
  return {
    client,
    forOrg: (orgId, fn, options) => forOrg(client, orgId, fn, options),
    disconnect: () => client.$disconnect(),
  };
}
```

Replace `packages/db/src/index.ts`:
```ts
// Public API of @travel-crm/db. Anything not exported here is internal to the package.
export { createDatabase, type Database, type DatabaseOptions } from "./database.js";
export { nextDocumentNumber, type DocumentNumberOptions } from "./counters.js";
export { isUniqueViolation } from "./errors.js";
export {
  InvalidOrganizationIdError,
  NestedForOrgError,
  WrongDatabaseRoleError,
  type ForOrgOptions,
  type OrgTx,
} from "./for-org.js";
export { HardDeleteError, softDeleted, withDeleted } from "./soft-delete.js";
export type { Organization, OrgCounter, Role, RolePermission } from "./generated/prisma/client.js";
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/db typecheck && pnpm --filter @travel-crm/db test`

Expected: 69 tests pass in 11 files. The counters test still hands out 25 numbers concurrently, which shows the nesting guard doesn't trip on calls side by side.

- [ ] **Step 6: Document the rules**

Replace `packages/db/README.md`. It adds the options, the nesting rule and the key rules:
```markdown
# @travel-crm/db

The database layer: Prisma schema, migrations, and the rules that keep each organization's data apart.

## Using it

    import { createDatabase, nextDocumentNumber } from "@travel-crm/db";

    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const db = createDatabase(url);   // must connect as the app_runtime role; forOrg() checks
    const number = await db.forOrg(orgId, (tx) => nextDocumentNumber(tx, { prefix: "BK", year: 2026 }));

Organization data is reachable only inside `db.forOrg()`. Postgres row-level security limits every query in that
transaction to `orgId`'s rows; outside it, queries see nothing.

- `db.forOrg(orgId, fn, { timeout, maxWait })` passes Prisma's transaction limits through (defaults: 5 s to run, 2 s to
  wait for a connection). Work past the timeout is rolled back.
- Never call `forOrg()` inside another `forOrg()`. It throws `NestedForOrgError`, because the inner transaction would run
  on a second connection that can't see the outer one's writes. Pass the outer `tx` down instead.

## Entry points

| Import                                | For                      | Gives                                                                         |
| ------------------------------------- | ------------------------ | ----------------------------------------------------------------------------- |
| `@travel-crm/db`                      | every module             | `createDatabase`, `OrgTx`, `nextDocumentNumber`, `softDeleted`, `withDeleted` |
| `@travel-crm/db/identity`             | the identity module only | Better Auth's client, and `forOrg` transactions that reach the sign-in tables |
| `@travel-crm/db/platform`             | the platform module only | a client that sees every organization                                         |
| `@travel-crm/db/testing`              | tests only               | `createTestOrganization`, the `DbUrls` type                                   |
| `@travel-crm/db/testing/global-setup` | other packages' Vitest   | the throwaway Postgres; `inject("dbUrls")` in tests                           |

dependency-cruiser enforces the "only" column. Another package's `vitest.config.ts` uses the test database like this:

    globalSetup: [createRequire(import.meta.url).resolve("@travel-crm/db/testing/global-setup")],

## Adding a table that belongs to an organization

1. Add the model in `prisma/schema/<module>.prisma` with this exact line, plus a relation to `Organization`:

       organizationId String @default(dbgenerated("(NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid")) @map("organization_id") @db.Uuid

2. Create the migration: `pnpm --filter @travel-crm/db exec prisma migrate dev --create-only --name <change>`
3. Append to the new `migration.sql`: `SELECT app_enable_org_rls('<table_name>');`
4. Apply and regenerate: `pnpm --filter @travel-crm/db exec prisma migrate dev && pnpm --filter @travel-crm/db generate`
5. Add a row-creating entry for the table to `test/org-table-fixtures.ts`.
6. `pnpm check`. The isolation suite now covers the new table.

Steps 3 and 5 are enforced: the tests fail if either is missing. Keys are checked too:

- A foreign key to another organization table includes `organization_id`:
  `@relation(fields: [organizationId, otherId], references: [organizationId, id])`.
- A unique constraint includes `organization_id`, e.g. `@@unique([organizationId, key])`, so one organization can't learn
  that another uses a value. Only a primary key on `id` alone is exempt.

## Soft delete

Rows of soft-delete models are never removed (ADR 0004). To make a model soft-deletable:

1. Give it `deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)` and `deletedBy String? @map("deleted_by") @db.Uuid`.
2. Add its model name to `softDeleteModels` in `src/soft-delete.ts`.
3. Make unique values ignore deleted rows: `@@unique([organizationId, name], where: { deletedAt: null })`.

Delete with `tx.thing.update({ where: { id }, data: softDeleted(userId) })`. Reads and updates skip deleted rows;
`delete()` throws `HardDeleteError`. `withDeleted(() => …)` shows deleted rows for Trash screens and restoring.

## Roles

| Role           | Used by          | Sees                                  |
| -------------- | ---------------- | ------------------------------------- |
| `app_migrator` | migrations       | everything (owns the tables)          |
| `app_runtime`  | api and worker   | only the organization set by `forOrg` |
| `app_platform` | platform console | every organization                    |

`sql/bootstrap.sql` creates them locally and in tests. Why it works this way: [ADR 0002](../../docs/adr/0002-row-level-security.md).
```

- [ ] **Step 7: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`. Expected: green.

```bash
cd /Users/ak/personal/travel-crm
git add packages/db
git commit -m "feat(db): require organization_id in unique keys, guard signInTables, and add forOrg limits"
```

---

### Task 4: Contracts for the identity API

Every API input and output gets a Zod 4 schema in `@travel-crm/contracts/identity`. The shared field rules also normalise what people type: organization codes become capitals, emails lower case. Output schemas refuse placeholder (`.invalid`) email addresses, so a leaked placeholder fails the response instead of reaching a screen.

**Files:**
- Create: `packages/contracts/package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `README.md`
- Create: `packages/contracts/src/identity/fields.ts`, `sign-in.ts`, `roles.ts`, `staff.ts`, `me.ts`, `settings.ts`, `index.ts`
- Create: `packages/contracts/test/fields.test.ts`, `packages/contracts/test/inputs.test.ts`
- Modify: `pnpm-workspace.yaml` (add `zod` to the catalog)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, all from `@travel-crm/contracts/identity`. Each schema `x` also exports its inferred type `X`:
  - `fields.ts`: `organizationCode` (trimmed and upper-cased, 3-12 letters or digits), `staffUsername` (2-32 of `A-Za-z0-9_.-`, kept as typed), `emailAddress` (trimmed and lower-cased; refuses `.invalid`), `shownEmailAddress` (refuses `.invalid`), `personName`, `passwordAttempt` (1-128), `newPassword` (10-128, used as typed), `roleKey` (`^[a-z][a-z0-9-]{1,47}$`), `roleName` (1-40, trimmed), `recordId` (UUID).
  - `sign-in.ts`: `orgSignInInput` (`{ orgCode, username, password }`).
  - `roles.ts`: `permissionScope` (`"own" | "all"`), `permissionKey`, `permissionGrantInput` (`{ permission, scope? }`), `permissionGrant` (`{ permission, scope: … | null }`), `createRoleInput` (`{ name, permissions }`), `updateRoleInput` (`{ key, name?, permissions? }`), `deleteRoleInput` (`{ key }`), `roleSummary` (`{ key, name, isOwner, permissions, memberCount }`) and `permissionCatalogEntry` (`{ permission, module, scoped }`).
  - `staff.ts`:
    - `createStaffInput`: `{ name, email?, username?, roleKey, temporaryPassword }`, needing an email or a username;
    - `updateStaffRoleInput`: `{ memberId, roleKey }`;
    - `resetStaffPasswordInput`: `{ memberId, temporaryPassword }`;
    - `removeStaffInput`: `{ memberId }`;
    - `staffMember`: `{ memberId, userId, name, email | null, username | null, role: { key, name }, twoFactorEnabled, mustChangePassword, joinedAt }`.
  - `me.ts`: `pendingStep` (`"CHANGE_PASSWORD" | "SET_UP_TWO_FACTOR"`), `meOutput` (`{ user, impersonatedBy, isPlatformAdmin, organization | null, member | null, pendingStep | null }`).
  - `settings.ts`: `setTwoFactorRequirementInput` (`{ required }`), `securitySettings` (`{ requireTwoFactor }`).

- [ ] **Step 1: Create the package**

In `pnpm-workspace.yaml`, add `zod` to the catalog.

Find:
```yaml
  "@prisma/adapter-pg": 7.10.0
```

Replace it with:
```yaml
  "@prisma/adapter-pg": 7.10.0
  zod: 4.6.7
```

`packages/contracts/package.json`:
```json
{
  "name": "@travel-crm/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./identity": "./src/identity/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "catalog:"
  },
  "devDependencies": {
    "@travel-crm/eslint-config": "workspace:*",
    "@travel-crm/tsconfig": "workspace:*",
    "@types/node": "catalog:",
    "eslint": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`packages/contracts/tsconfig.json`:
```json
{
  "extends": "@travel-crm/tsconfig/base.json",
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/contracts/eslint.config.js`:
```js
// ESLint for @travel-crm/contracts: the shared strict config.
import { base } from "@travel-crm/eslint-config";

export default base({ tsconfigRootDir: import.meta.dirname });
```

`packages/contracts/vitest.config.ts`:
```ts
// Contract tests are plain unit tests: no database.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "contracts",
    include: ["test/**/*.test.ts"],
  },
});
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install`

- [ ] **Step 2: Write the failing tests**

`packages/contracts/test/fields.test.ts`:
```ts
// The shared field rules accept what people really type and normalise it the way sign-in compares it.
import { describe, expect, it } from "vitest";
import {
  emailAddress,
  newPassword,
  organizationCode,
  roleKey,
  shownEmailAddress,
  staffUsername,
} from "../src/identity/index.js";

describe("identity fields", () => {
  it("reads organization codes in any case and stores them in capitals", () => {
    expect(organizationCode.parse(" sharma ")).toBe("SHARMA");
    expect(organizationCode.parse("Goa24")).toBe("GOA24");
    for (const bad of ["SH", "SHARMA-HOLIDAYS", "THIRTEENCHARS", "शर्मा"]) {
      expect(organizationCode.safeParse(bad).success).toBe(false);
    }
  });

  it("keeps usernames as typed and refuses spaces and non-Latin letters", () => {
    expect(staffUsername.parse(" Ravi.K ")).toBe("Ravi.K");
    for (const bad of ["r", "ravi kumar", "rávi", "a".repeat(33)]) {
      expect(staffUsername.safeParse(bad).success).toBe(false);
    }
  });

  it("lowercases and trims emails, and refuses placeholder addresses", () => {
    expect(emailAddress.parse("  Ravi@Sharma.IN ")).toBe("ravi@sharma.in");
    expect(emailAddress.safeParse("sharma-ravi@no-email.invalid").success).toBe(false);
    expect(emailAddress.safeParse("not-an-email").success).toBe(false);
  });

  it("refuses to show a placeholder email", () => {
    expect(shownEmailAddress.safeParse("ravi@sharma.in").success).toBe(true);
    expect(shownEmailAddress.safeParse("removed-0199@no-email.invalid").success).toBe(false);
  });

  it("needs new passwords of 10 to 128 characters, used exactly as typed", () => {
    expect(newPassword.parse(" spaces count ")).toBe(" spaces count ");
    expect(newPassword.safeParse("short").success).toBe(false);
    expect(newPassword.safeParse("x".repeat(129)).success).toBe(false);
  });

  it("matches the database's role key format", () => {
    expect(roleKey.safeParse("senior-sales-3f9a2c").success).toBe(true);
    for (const bad of ["Sales", "2nd", "s", "sales manager"]) {
      expect(roleKey.safeParse(bad).success).toBe(false);
    }
  });
});
```

`packages/contracts/test/inputs.test.ts`:
```ts
// The identity inputs reject what the API must never receive: staff with no way to sign in, repeated permissions,
// and scopes other than own or all.
import { describe, expect, it } from "vitest";
import { createRoleInput, createStaffInput, orgSignInInput, updateRoleInput } from "../src/identity/index.js";

describe("identity inputs", () => {
  const staff = { name: "Ravi Kumar", roleKey: "sales", temporaryPassword: "temporary-pass-1" };

  it("creates staff with an email, a username or both, but not neither", () => {
    expect(createStaffInput.safeParse({ ...staff, email: "ravi@sharma.in" }).success).toBe(true);
    expect(createStaffInput.safeParse({ ...staff, username: "ravi" }).success).toBe(true);
    expect(createStaffInput.safeParse({ ...staff, email: "ravi@sharma.in", username: "ravi" }).success).toBe(true);
    const neither = createStaffInput.safeParse(staff);
    expect(neither.success).toBe(false);
    expect(neither.error?.issues[0]?.path).toEqual(["username"]);
  });

  it("accepts each permission once, with an own or all scope", () => {
    const viewOwn = { permission: "leads:view", scope: "own" };
    expect(createRoleInput.safeParse({ name: "Sales", permissions: [viewOwn] }).success).toBe(true);
    expect(createRoleInput.safeParse({ name: "Sales", permissions: [viewOwn, viewOwn] }).success).toBe(false);
    expect(
      createRoleInput.safeParse({ name: "Sales", permissions: [{ permission: "leads:view", scope: "team" }] }).success,
    ).toBe(false);
    expect(createRoleInput.safeParse({ name: "Sales", permissions: [{ permission: "Leads View" }] }).success).toBe(
      false,
    );
  });

  it("names roles with 1 to 40 characters, in any script", () => {
    expect(createRoleInput.parse({ name: "  बिक्री टीम ", permissions: [] }).name).toBe("बिक्री टीम");
    expect(createRoleInput.safeParse({ name: "   ", permissions: [] }).success).toBe(false);
    expect(createRoleInput.safeParse({ name: "x".repeat(41), permissions: [] }).success).toBe(false);
  });

  it("updates a role's name, permissions, or both", () => {
    expect(updateRoleInput.parse({ key: "sales" })).toEqual({ key: "sales" });
    expect(updateRoleInput.safeParse({ key: "Sales" }).success).toBe(false);
  });

  it("normalises the organization code typed at sign-in", () => {
    expect(orgSignInInput.parse({ orgCode: "sharma", username: "Ravi", password: "x" })).toEqual({
      orgCode: "SHARMA",
      username: "Ravi",
      password: "x",
    });
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/contracts test`

Expected: FAIL. Vitest cannot resolve `../src/identity/index.js`.

- [ ] **Step 4: Write the schemas**

`packages/contracts/src/identity/fields.ts`:
```ts
// Field rules shared by the identity inputs and outputs: one definition for each kind of value.
import { z } from "zod";

/** An organization's sign-in code, e.g. SHARMA. People may type it in any case; it is compared in capitals. */
export const organizationCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,12}$/, "Use 3-12 letters or digits");

/** A username within an organization, e.g. "Ravi" or "ravi.k". Kept as typed for display, compared without case. */
export const staffUsername = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.-]{2,32}$/, "Use 2-32 letters, digits, dots, dashes or underscores");

/**
 * An email address someone typed, in lower case (Better Auth looks emails up in lower case). Addresses under the
 * reserved .invalid domain are refused: no real mailbox has one, and staff without email get such a placeholder.
 */
export const emailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email())
  .refine((email) => !email.endsWith(".invalid"), "Use a real email address");

/** An email address the API shows. Never a placeholder, so a leaked placeholder fails the response instead. */
export const shownEmailAddress = z.email().refine((email) => !email.endsWith(".invalid"), "Placeholder email shown");

/** A person's name as shown in the app. */
export const personName = z.string().trim().min(1).max(100);

/** A password typed at sign-in or as the current password. Better Auth checks it; only its length is limited here. */
export const passwordAttempt = z.string().min(1).max(128);

/** A new password: 10 to 128 characters, the limits createAuth gives Better Auth. Used exactly as typed. */
export const newPassword = z.string().min(10, "Use at least 10 characters").max(128);

/** A role's stable key, e.g. "sales". Matches the database's role_key_format check. */
export const roleKey = z.string().regex(/^[a-z][a-z0-9-]{1,47}$/);

/** A role's display name, e.g. "Senior sales". */
export const roleName = z.string().trim().min(1).max(40);

/** The id of a row, a UUID v7. */
export const recordId = z.uuid();
```

`packages/contracts/src/identity/sign-in.ts`:
```ts
// Input of the organization-code sign-in route, POST /api/auth/sign-in/org.
import { z } from "zod";
import { organizationCode, passwordAttempt, staffUsername } from "./fields.js";

export const orgSignInInput = z.object({
  orgCode: organizationCode,
  username: staffUsername,
  password: passwordAttempt,
});
export type OrgSignInInput = z.infer<typeof orgSignInInput>;
```

`packages/contracts/src/identity/roles.ts`:
```ts
// Inputs and outputs of the roles API: roles are named sets of permissions in one organization (spec 6.5).
import { z } from "zod";
import { roleKey, roleName } from "./fields.js";

/** For view permissions: only the records assigned to the member, or all of them. */
export const permissionScope = z.enum(["own", "all"]);
export type PermissionScope = z.infer<typeof permissionScope>;

/** A permission key such as "leads:create". The domain checks that it is in the permission catalog. */
export const permissionKey = z.string().regex(/^[a-z_]+:[a-z_]+$/);

/** A permission to grant. View permissions need a scope; the domain rejects a scope on any other permission. */
export const permissionGrantInput = z.object({
  permission: permissionKey,
  scope: permissionScope.optional(),
});
export type PermissionGrantInput = z.infer<typeof permissionGrantInput>;

const permissionGrantList = z
  .array(permissionGrantInput)
  .max(100)
  .refine((grants) => new Set(grants.map((grant) => grant.permission)).size === grants.length, {
    message: "List each permission once",
  });

/** A granted permission as the API returns it. */
export const permissionGrant = z.object({
  permission: z.string(),
  scope: permissionScope.nullable(),
});
export type PermissionGrant = z.infer<typeof permissionGrant>;

export const createRoleInput = z.object({ name: roleName, permissions: permissionGrantList });
export type CreateRoleInput = z.infer<typeof createRoleInput>;

/** Change a role's name, its permissions, or both. Leave a field out to keep it. */
export const updateRoleInput = z.object({
  key: roleKey,
  name: roleName.optional(),
  permissions: permissionGrantList.optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleInput>;

export const deleteRoleInput = z.object({ key: roleKey });
export type DeleteRoleInput = z.infer<typeof deleteRoleInput>;

export const roleSummary = z.object({
  key: z.string(),
  name: z.string(),
  /** The Owner role holds every permission and cannot be changed. */
  isOwner: z.boolean(),
  permissions: z.array(permissionGrant),
  /** Staff currently given this role. A role with staff cannot be deleted. */
  memberCount: z.number().int().nonnegative(),
});
export type RoleSummary = z.infer<typeof roleSummary>;

/** One entry of the permission catalog, for the roles editor. Labels come from the web app's translations. */
export const permissionCatalogEntry = z.object({
  permission: z.string(),
  /** The part before the colon, e.g. "leads". Screens group permissions by it. */
  module: z.string(),
  /** True for view permissions, which take a scope. */
  scoped: z.boolean(),
});
export type PermissionCatalogEntry = z.infer<typeof permissionCatalogEntry>;
```

`packages/contracts/src/identity/staff.ts`:
```ts
// Inputs and outputs of the staff API: creating, changing and removing an organization's staff (spec 6.3).
import { z } from "zod";
import {
  emailAddress,
  newPassword,
  personName,
  recordId,
  roleKey,
  shownEmailAddress,
  staffUsername,
} from "./fields.js";

/**
 * Staff need an email, a username, or both: email to sign in by email, a username to sign in with the
 * organization code. The temporary password must be changed at first sign-in.
 */
export const createStaffInput = z
  .object({
    name: personName,
    email: emailAddress.optional(),
    username: staffUsername.optional(),
    roleKey,
    temporaryPassword: newPassword,
  })
  .refine((input) => input.email !== undefined || input.username !== undefined, {
    message: "Give an email, a username or both",
    path: ["username"],
  });
export type CreateStaffInput = z.infer<typeof createStaffInput>;

export const updateStaffRoleInput = z.object({ memberId: recordId, roleKey });
export type UpdateStaffRoleInput = z.infer<typeof updateStaffRoleInput>;

export const resetStaffPasswordInput = z.object({ memberId: recordId, temporaryPassword: newPassword });
export type ResetStaffPasswordInput = z.infer<typeof resetStaffPasswordInput>;

export const removeStaffInput = z.object({ memberId: recordId });
export type RemoveStaffInput = z.infer<typeof removeStaffInput>;

export const staffMember = z.object({
  memberId: z.uuid(),
  userId: z.uuid(),
  name: z.string(),
  /** Null for staff without email: their placeholder address is never shown. */
  email: shownEmailAddress.nullable(),
  /** As the person typed it, e.g. "Ravi". Null for staff who sign in only by email. */
  username: z.string().nullable(),
  role: z.object({ key: z.string(), name: z.string() }),
  twoFactorEnabled: z.boolean(),
  /** True until the person replaces the temporary password an admin gave them. */
  mustChangePassword: z.boolean(),
  joinedAt: z.iso.datetime(),
});
export type StaffMember = z.infer<typeof staffMember>;
```

`packages/contracts/src/identity/me.ts`:
```ts
// Output of me.get: who is signed in, their organization and permissions, and anything they must do first.
import { z } from "zod";
import { permissionGrant } from "./roles.js";
import { shownEmailAddress } from "./fields.js";

/** What a member must do before the organization app lets them in. The same values are the FORBIDDEN reasons. */
export const pendingStep = z.enum(["CHANGE_PASSWORD", "SET_UP_TWO_FACTOR"]);
export type PendingStep = z.infer<typeof pendingStep>;

export const meOutput = z.object({
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    email: shownEmailAddress.nullable(),
    username: z.string().nullable(),
    twoFactorEnabled: z.boolean(),
  }),
  /** The platform admin's user id while support is impersonating this person. The web app shows a banner. */
  impersonatedBy: z.uuid().nullable(),
  /** Platform staff: user role "admin" and no organization. */
  isPlatformAdmin: z.boolean(),
  organization: z
    .object({ id: z.uuid(), name: z.string(), code: z.string(), requireTwoFactor: z.boolean() })
    .nullable(),
  member: z
    .object({
      memberId: z.uuid(),
      role: z.object({ key: z.string(), name: z.string(), isOwner: z.boolean() }),
      permissions: z.array(permissionGrant),
    })
    .nullable(),
  pendingStep: pendingStep.nullable(),
});
export type MeOutput = z.infer<typeof meOutput>;
```

`packages/contracts/src/identity/settings.ts`:
```ts
// Inputs and outputs of the organization settings the identity module owns: requiring two-factor sign-in.
import { z } from "zod";

export const setTwoFactorRequirementInput = z.object({ required: z.boolean() });
export type SetTwoFactorRequirementInput = z.infer<typeof setTwoFactorRequirementInput>;

export const securitySettings = z.object({ requireTwoFactor: z.boolean() });
export type SecuritySettings = z.infer<typeof securitySettings>;
```

`packages/contracts/src/identity/index.ts`:
```ts
// Public API of @travel-crm/contracts/identity: the Zod schemas for every identity input and output.
export * from "./fields.js";
export * from "./me.js";
export * from "./roles.js";
export * from "./settings.js";
export * from "./sign-in.js";
export * from "./staff.js";
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/contracts test`

Expected: 11 tests pass. Among them, "refuses placeholder addresses" and "refuses to show a placeholder email" (Review Focus 3).

- [ ] **Step 6: Write the README**

`packages/contracts/README.md`:
```markdown
# @travel-crm/contracts

Zod schemas for every API input and output, one subpath per module: `@travel-crm/contracts/identity`.
The API validates inputs and outputs with them, and the web app can reuse them for its forms.

Shared field rules (organization codes, usernames, emails, passwords, role keys) are in `src/identity/fields.ts`.
Output schemas refuse placeholder (`.invalid`) email addresses, so one can never be shown by mistake.
```

- [ ] **Step 7: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`. Expected: green.

```bash
cd /Users/ak/personal/travel-crm
git add packages/contracts pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(contracts): add Zod schemas for the identity API"
```

---

### Task 5: The identity module's catalog, starter roles and rules

The business rules that need no database:
- the permission catalog;
- a `PermissionSet` that compares grants with their scopes;
- the five starter roles;
- the own/all scope helper for request check 5;
- how usernames and placeholder emails are stored;
- role keys;
- the rules that stop anyone granting more than they hold.

The package starts with two modules: `kernel` (`DomainError`) and `identity`. Each module's public API is its `index.ts`, and import rules enforce it.

**Files:**
- Create: `packages/domain/package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`
- Create: `packages/domain/src/kernel/errors.ts`, `packages/domain/src/kernel/index.ts`
- Create: `packages/domain/src/identity/permissions.ts`, `permission-set.ts`, `starter-roles.ts`, `member-access.ts`, `record-scope.ts`, `sign-in-names.ts`, `role-key.ts`, `access-rules.ts`, `index.ts`
- Create: `packages/domain/test/identity/rule-helpers.ts`, `permissions.test.ts`, `starter-roles.test.ts`, `access-rules.test.ts`, `record-scope.test.ts`, `sign-in-names.test.ts`
- Modify: `.dependency-cruiser.cjs`, `docs/adr/README.md`
- Create: `docs/adr/0005-roles-and-permissions.md`

**Interfaces:**
- Consumes: from Task 4, the types `PermissionScope`, `PermissionGrantInput` and `PendingStep` from `@travel-crm/contracts/identity`.
- Produces:
  - `@travel-crm/domain/kernel`: `type DomainErrorCode = "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "LIMIT_REACHED" | "FEATURE_LOCKED" | "VALIDATION"`, and `class DomainError extends Error { readonly code: DomainErrorCode; readonly reason: string; constructor(code, reason, message) }`.
  - From `@travel-crm/domain/identity`, the permission catalog:
    - `permissions` (a readonly tuple), `type Permission`, `type ScopedPermission` (`leads:view`, `quotes:view`, `bookings:view`), `type UnscopedPermission`;
    - `isPermission(value: string): value is Permission`, `isScopedPermission(permission)`, `moduleOf(permission): string`;
    - `permissionCatalog: { permission, module, scoped }[]`.
  - Permission sets:
    - `interface Grant { permission: Permission; scope: PermissionScope | null }`;
    - `class PermissionSet` with `static of(grants)`, `static everything()`, `static fromStored(rows: Iterable<{ permission: string; scope: string | null }>)`, and the methods `has(permission)`, `missing(required): Permission[]`, `scopeOf(scopedPermission): PermissionScope | null`, `covers(other: PermissionSet): boolean` and `toGrants(): Grant[]`.
  - Starter roles: `interface StarterRole { key; name; isOwner; grants: readonly Grant[] }`, `starterRoles: readonly StarterRole[]`, and `OWNER_ROLE_KEY = "org-owner"`.
  - `interface MemberAccess { userId; memberId; organizationId; role: { key; name; isOwner }; permissions: PermissionSet; mustChangePassword; twoFactorEnabled; organizationRequiresTwoFactor }`, and `pendingStep(access): PendingStep | null`.
  - Request check 5: `scopeFilter(access, permission: ScopedPermission, ownerField): Partial<Record<Field, string>>` and `assertRecordInScope(access, permission, ownerUserId: string | null): void` (throws `NOT_FOUND`).
  - Sign-in names: `INTERNAL_USERNAME_PATTERN`, `internalUsername(code, username)` (gives `"sharma:ravi"`), `placeholderEmail(code, username)` (`"sharma-ravi@no-email.invalid"`), `removedPersonEmail(userId)`, `isPlaceholderEmail(email)` and `shownEmail(email): string | null`.
  - `roleKeyFor(name: string, suffix?: string): string`.
  - Rules:
    - `interface RoleFacts { isOwner; permissions: PermissionSet }`;
    - `permissionSetFromInput(grants: readonly PermissionGrantInput[]): PermissionSet`;
    - `assertMayHandleRole(actor: MemberAccess, role: RoleFacts)`;
    - `assertMayManageMember(actor, target: { userId; role: RoleFacts })`;
    - `assertRoleIsEditable(role: { isOwner })`.
  - Refusal reasons: `UNKNOWN_PERMISSION`, `SCOPE_REQUIRED`, `SCOPE_NOT_ALLOWED`, `OWNER_ONLY`, `EXCEEDS_YOUR_PERMISSIONS`, `CANNOT_CHANGE_YOURSELF`, `OWNER_ROLE_IS_FIXED`, `MISSING_PERMISSION`, `NOT_FOUND`.
  - Import rules: `domain-modules-meet-at-their-index`, `domain-modules-from-outside-through-their-index` and `kernel-depends-on-no-module`.

- [ ] **Step 1: Create the package**

`packages/domain/package.json`:
```json
{
  "name": "@travel-crm/domain",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./identity": "./src/identity/index.ts",
    "./kernel": "./src/kernel/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@travel-crm/contracts": "workspace:*"
  },
  "devDependencies": {
    "@travel-crm/eslint-config": "workspace:*",
    "@travel-crm/tsconfig": "workspace:*",
    "@types/node": "catalog:",
    "eslint": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`packages/domain/tsconfig.json`:
```json
{
  "extends": "@travel-crm/tsconfig/base.json",
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/domain/eslint.config.js`:
```js
// ESLint for @travel-crm/domain: the shared strict config.
import { base } from "@travel-crm/eslint-config";

export default base({ tsconfigRootDir: import.meta.dirname });
```

`packages/domain/vitest.config.ts` (Task 6 adds the database):
```ts
// Unit tests for the domain's business rules.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "domain",
    include: ["test/**/*.test.ts"],
  },
});
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install`

- [ ] **Step 2: Write the failing tests**

`packages/domain/test/identity/rule-helpers.ts`:
```ts
// Helpers for unit tests of the identity rules, which need no database.
import { DomainError } from "../../src/kernel/errors.js";
import type { MemberAccess } from "../../src/identity/member-access.js";
import { PermissionSet } from "../../src/identity/permission-set.js";
import { starterRoles } from "../../src/identity/starter-roles.js";

/** A member holding one of the starter roles, e.g. memberWithStarterRole("sales"). */
export function memberWithStarterRole(key: string, overrides: Partial<MemberAccess> = {}): MemberAccess {
  const role = starterRoles.find((starter) => starter.key === key);
  if (!role) throw new Error(`No starter role ${key}`);
  return {
    userId: `user-${key}`,
    memberId: `member-${key}`,
    organizationId: "organization-1",
    role: { key: role.key, name: role.name, isOwner: role.isOwner },
    permissions: role.isOwner ? PermissionSet.everything() : PermissionSet.of(role.grants),
    mustChangePassword: false,
    twoFactorEnabled: false,
    organizationRequiresTwoFactor: false,
    ...overrides,
  };
}

/** Runs a rule and returns the reason it refused, or null when it allowed the action. */
export function refusalOf<Args extends unknown[]>(rule: (...args: Args) => void, ...args: Args): string | null {
  try {
    rule(...args);
    return null;
  } catch (error) {
    if (error instanceof DomainError) return error.reason;
    throw error;
  }
}
```

`packages/domain/test/identity/permissions.test.ts`:
```ts
// The permission catalog and permission sets: what a role can allow, and how scopes compare.
import { describe, expect, it } from "vitest";
import { PermissionSet } from "../../src/identity/permission-set.js";
import { isPermission, moduleOf, permissionCatalog, permissions } from "../../src/identity/permissions.js";

describe("permission catalog", () => {
  it("covers the Foundation and every Phase 1 module", () => {
    for (const permission of ["staff:manage", "roles:manage", "settings:manage", "audit:view", "money:view_margin"]) {
      expect(isPermission(permission)).toBe(true);
    }
    expect(new Set(permissions.map(moduleOf))).toEqual(
      new Set([
        "staff",
        "roles",
        "settings",
        "audit",
        "money",
        "leads",
        "quotes",
        "bookings",
        "departures",
        "suppliers",
        "accounts",
      ]),
    );
  });

  it("names every permission module:action, once", () => {
    expect(new Set(permissions).size).toBe(permissions.length);
    for (const permission of permissions) expect(permission).toMatch(/^[a-z]+:[a-z_]+$/);
  });

  it("marks the views of assignable records as scoped", () => {
    const scoped = permissionCatalog.filter((entry) => entry.scoped).map((entry) => entry.permission);
    expect(scoped).toEqual(["leads:view", "quotes:view", "bookings:view"]);
  });
});

describe("PermissionSet", () => {
  it("holds everything, over all records, for the Owner", () => {
    const owner = PermissionSet.everything();
    expect(owner.missing([...permissions])).toEqual([]);
    expect(owner.scopeOf("leads:view")).toBe("all");
  });

  it("treats a view permission without a scope as own records only", () => {
    expect(PermissionSet.of([{ permission: "leads:view", scope: null }]).scopeOf("leads:view")).toBe("own");
    expect(PermissionSet.of([{ permission: "leads:create", scope: "all" }]).toGrants()).toEqual([
      { permission: "leads:create", scope: null },
    ]);
  });

  it("covers another set only with every permission at the same or a wider scope", () => {
    const allLeads = PermissionSet.of([{ permission: "leads:view", scope: "all" }]);
    const ownLeads = PermissionSet.of([{ permission: "leads:view", scope: "own" }]);
    expect(allLeads.covers(ownLeads)).toBe(true);
    expect(ownLeads.covers(allLeads)).toBe(false);
    expect(ownLeads.covers(PermissionSet.of([{ permission: "leads:create", scope: null }]))).toBe(false);
  });

  it("ignores stored permissions that are no longer in the catalog", () => {
    const stored = PermissionSet.fromStored([
      { permission: "leads:create", scope: null },
      { permission: "visas:apply", scope: null },
    ]);
    expect(stored.toGrants()).toEqual([{ permission: "leads:create", scope: null }]);
  });
});
```

`packages/domain/test/identity/starter-roles.test.ts`:
```ts
// The five starter roles (spec 6.5) and the defaults recorded in ADR 0005.
import { describe, expect, it } from "vitest";
import { PermissionSet } from "../../src/identity/permission-set.js";
import { isPermission } from "../../src/identity/permissions.js";
import { OWNER_ROLE_KEY, starterRoles } from "../../src/identity/starter-roles.js";

const roleNamed = (name: string) => {
  const role = starterRoles.find((starter) => starter.name === name);
  if (!role) throw new Error(`No starter role named ${name}`);
  return PermissionSet.of(role.grants);
};

describe("starter roles", () => {
  it("are Owner, Admin, Sales, Operations and Accounts, and only Owner is the Owner role", () => {
    expect(starterRoles.map((role) => role.name)).toEqual(["Owner", "Admin", "Sales", "Operations", "Accounts"]);
    expect(starterRoles.filter((role) => role.isOwner).map((role) => role.key)).toEqual([OWNER_ROLE_KEY]);
  });

  it("never use Better Auth's built-in role names as keys", () => {
    for (const role of starterRoles) expect(["owner", "admin", "member"]).not.toContain(role.key);
  });

  it("grant only catalog permissions", () => {
    for (const role of starterRoles) {
      for (const grant of role.grants) expect(isPermission(grant.permission)).toBe(true);
    }
  });

  it("let Admin do everything except change roles", () => {
    const admin = roleNamed("Admin");
    expect(admin.has("roles:manage")).toBe(false);
    expect(admin.has("staff:manage")).toBe(true);
    expect(PermissionSet.everything().covers(admin)).toBe(true);
  });

  it("keep Sales to their own records and away from margins, staff and settings", () => {
    const sales = roleNamed("Sales");
    expect(sales.scopeOf("leads:view")).toBe("own");
    expect(sales.scopeOf("bookings:view")).toBe("own");
    expect(sales.missing(["money:view_margin", "staff:manage", "settings:manage"])).toHaveLength(3);
  });

  it("show margins to Accounts, but not to Operations", () => {
    expect(roleNamed("Accounts").has("money:view_margin")).toBe(true);
    expect(roleNamed("Operations").has("money:view_margin")).toBe(false);
  });
});
```

`packages/domain/test/identity/access-rules.test.ts`:
```ts
// Nobody hands out more than they hold, changes their own access, or touches an Owner unless they are one.
import { describe, expect, it } from "vitest";
import {
  assertMayHandleRole,
  assertMayManageMember,
  assertRoleIsEditable,
  permissionSetFromInput,
} from "../../src/identity/access-rules.js";
import { pendingStep } from "../../src/identity/member-access.js";
import { PermissionSet } from "../../src/identity/permission-set.js";
import { memberWithStarterRole, refusalOf } from "./rule-helpers.js";

const ownerRole = { isOwner: true, permissions: PermissionSet.everything() };
const salesRole = {
  isOwner: false,
  permissions: PermissionSet.of([
    { permission: "leads:view", scope: "own" },
    { permission: "leads:create", scope: null },
  ]),
};
const marginRole = {
  isOwner: false,
  permissions: PermissionSet.of([{ permission: "money:view_margin", scope: null }]),
};
const allLeadsRole = { isOwner: false, permissions: PermissionSet.of([{ permission: "leads:view", scope: "all" }]) };

describe("access rules", () => {
  const owner = memberWithStarterRole("org-owner");
  const admin = memberWithStarterRole("org-admin");
  const sales = memberWithStarterRole("sales");

  it("let only an Owner give or change the Owner role", () => {
    expect(refusalOf(assertMayHandleRole, owner, ownerRole)).toBeNull();
    expect(refusalOf(assertMayHandleRole, admin, ownerRole)).toBe("OWNER_ONLY");
  });

  it("let a member give a role only if they hold all it allows, at the same scope", () => {
    expect(refusalOf(assertMayHandleRole, admin, salesRole)).toBeNull();
    expect(refusalOf(assertMayHandleRole, sales, salesRole)).toBeNull();
    expect(refusalOf(assertMayHandleRole, sales, marginRole)).toBe("EXCEEDS_YOUR_PERMISSIONS");
    expect(refusalOf(assertMayHandleRole, sales, allLeadsRole)).toBe("EXCEEDS_YOUR_PERMISSIONS");
  });

  it("stop members changing their own access, Owners included", () => {
    expect(refusalOf(assertMayManageMember, owner, { userId: owner.userId, role: ownerRole })).toBe(
      "CANNOT_CHANGE_YOURSELF",
    );
  });

  it("stop an Admin resetting, moving or removing an Owner", () => {
    expect(refusalOf(assertMayManageMember, admin, { userId: "someone-else", role: ownerRole })).toBe("OWNER_ONLY");
    expect(refusalOf(assertMayManageMember, admin, { userId: "someone-else", role: salesRole })).toBeNull();
  });

  it("keep the Owner role fixed", () => {
    expect(refusalOf(assertRoleIsEditable, { isOwner: true })).toBe("OWNER_ROLE_IS_FIXED");
    expect(refusalOf(assertRoleIsEditable, { isOwner: false })).toBeNull();
  });

  it("read requested grants, refusing unknown permissions and misplaced scopes", () => {
    expect(permissionSetFromInput([{ permission: "leads:view", scope: "all" }]).scopeOf("leads:view")).toBe("all");
    expect(refusalOf(permissionSetFromInput, [{ permission: "visas:apply" }])).toBe("UNKNOWN_PERMISSION");
    expect(refusalOf(permissionSetFromInput, [{ permission: "leads:view" }])).toBe("SCOPE_REQUIRED");
    expect(refusalOf(permissionSetFromInput, [{ permission: "leads:create", scope: "own" }])).toBe("SCOPE_NOT_ALLOWED");
  });

  it("ask for a password change before two-factor setup, and for neither when both are done", () => {
    const changeFirst = memberWithStarterRole("sales", {
      mustChangePassword: true,
      organizationRequiresTwoFactor: true,
    });
    expect(pendingStep(changeFirst)).toBe("CHANGE_PASSWORD");
    expect(pendingStep(memberWithStarterRole("sales", { organizationRequiresTwoFactor: true }))).toBe(
      "SET_UP_TWO_FACTOR",
    );
    const done = memberWithStarterRole("sales", { organizationRequiresTwoFactor: true, twoFactorEnabled: true });
    expect(pendingStep(done)).toBeNull();
  });
});
```

`packages/domain/test/identity/record-scope.test.ts`:
```ts
// Check 5 (spec 6.5): "own" limits a member to records assigned to them; outside it, a record does not exist.
import { describe, expect, it } from "vitest";
import { assertRecordInScope, scopeFilter } from "../../src/identity/record-scope.js";
import { memberWithStarterRole, refusalOf } from "./rule-helpers.js";

describe("record scope", () => {
  const sales = memberWithStarterRole("sales");
  const admin = memberWithStarterRole("org-admin");

  it("filters lists to the member's own records, or not at all", () => {
    expect(scopeFilter(sales, "leads:view", "assignedToId")).toEqual({ assignedToId: sales.userId });
    expect(scopeFilter(admin, "leads:view", "assignedToId")).toEqual({});
  });

  it("refuses to build a filter for a view permission the member lacks", () => {
    expect(refusalOf(scopeFilter, memberWithStarterRole("operations"), "leads:view", "assignedToId")).toBe(
      "MISSING_PERMISSION",
    );
  });

  it("reports someone else's record as not found", () => {
    expect(refusalOf(assertRecordInScope, sales, "leads:view", sales.userId)).toBeNull();
    expect(refusalOf(assertRecordInScope, admin, "leads:view", "someone-else")).toBeNull();
    expect(refusalOf(assertRecordInScope, sales, "leads:view", "someone-else")).toBe("NOT_FOUND");
    expect(refusalOf(assertRecordInScope, sales, "leads:view", null)).toBe("NOT_FOUND");
  });
});
```

`packages/domain/test/identity/sign-in-names.test.ts`:
```ts
// Stored usernames, placeholder emails and role keys: unique, recognisable, and never shown.
import { describe, expect, it } from "vitest";
import { roleKeyFor } from "../../src/identity/role-key.js";
import {
  INTERNAL_USERNAME_PATTERN,
  internalUsername,
  isPlaceholderEmail,
  placeholderEmail,
  removedPersonEmail,
  shownEmail,
} from "../../src/identity/sign-in-names.js";

describe("sign-in names", () => {
  it("store usernames with their organization code, in lower case", () => {
    expect(internalUsername("SHARMA", "Ravi.K")).toBe("sharma:ravi.k");
    expect(INTERNAL_USERNAME_PATTERN.test(internalUsername("SHARMA", "Ravi.K"))).toBe(true);
  });

  it("give staff without email a placeholder that is never shown", () => {
    const email = placeholderEmail("SHARMA", "Ravi");
    expect(email).toBe("sharma-ravi@no-email.invalid");
    expect(isPlaceholderEmail(email)).toBe(true);
    expect(shownEmail(email)).toBeNull();
    expect(shownEmail("ravi@sharma.in")).toBe("ravi@sharma.in");
    expect(isPlaceholderEmail(removedPersonEmail("0199c3a2-0000-7000-8000-000000000001"))).toBe(true);
  });
});

describe("role keys", () => {
  it("are readable for Latin names and valid for any name", () => {
    expect(roleKeyFor("Senior Sales", "3f9a2c")).toBe("senior-sales-3f9a2c");
    expect(roleKeyFor("Café crew", "3f9a2c")).toBe("cafe-crew-3f9a2c");
    expect(roleKeyFor("बिक्री टीम", "3f9a2c")).toBe("role-3f9a2c");
    expect(roleKeyFor("2nd shift", "3f9a2c")).toBe("role-2nd-shift-3f9a2c");
    expect(roleKeyFor("x".repeat(40), "3f9a2c")).toBe(`${"x".repeat(32)}-3f9a2c`);
  });

  it("match the database's role_key_format check", () => {
    for (const name of ["Senior Sales", "बिक्री", "!!!", "2nd shift", "Owner", "a".repeat(40)]) {
      expect(roleKeyFor(name)).toMatch(/^[a-z][a-z0-9-]{1,47}$/);
    }
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain test`

Expected: FAIL. Vitest cannot resolve the `../../src/identity/…` and `../../src/kernel/…` modules.

- [ ] **Step 4: Write the kernel's error type**

`packages/domain/src/kernel/errors.ts`:
```ts
// Typed errors the domain throws (spec 9.7). The API turns each code into an HTTP and tRPC status.

export type DomainErrorCode =
  "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "LIMIT_REACHED" | "FEATURE_LOCKED" | "VALIDATION";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  /** A machine-readable detail such as "LAST_OWNER", from which the web app picks a translated message. */
  readonly reason: string;

  constructor(code: DomainErrorCode, reason: string, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.reason = reason;
  }
}
```

`packages/domain/src/kernel/index.ts`:
```ts
// Public API of the shared kernel: building blocks every domain module uses.
export { DomainError, type DomainErrorCode } from "./errors.js";
```

- [ ] **Step 5: Write the permission catalog, permission sets and starter roles**

`packages/domain/src/identity/permissions.ts`:
```ts
// The permission catalog (spec 6.5): everything a role can allow, as "module:action".
// Add permissions here as modules arrive. The Owner role holds new ones automatically; other roles must be given them.

/** View permissions carry a scope: the member's own records, or all of them (spec 6.5). */
const scopedPermissions = ["leads:view", "quotes:view", "bookings:view"] as const;

export const permissions = [
  // Foundation
  "staff:manage",
  "roles:manage",
  "settings:manage",
  "audit:view",
  "money:view_margin",
  // Business modules, listed now so the starter roles are complete from the first organization
  ...scopedPermissions,
  "leads:create",
  "leads:edit",
  "quotes:create",
  "quotes:edit",
  "bookings:create",
  "bookings:edit",
  "departures:view",
  "departures:create",
  "departures:edit",
  "suppliers:view",
  "suppliers:create",
  "suppliers:edit",
  "accounts:view",
  "accounts:create",
  "accounts:edit",
] as const;

export type Permission = (typeof permissions)[number];
export type ScopedPermission = (typeof scopedPermissions)[number];
export type UnscopedPermission = Exclude<Permission, ScopedPermission>;

const catalog: ReadonlySet<string> = new Set(permissions);
const scoped: ReadonlySet<string> = new Set(scopedPermissions);

export function isPermission(value: string): value is Permission {
  return catalog.has(value);
}

export function isScopedPermission(permission: Permission): permission is ScopedPermission {
  return scoped.has(permission);
}

/** The module a permission belongs to: "leads:create" → "leads". Plan entitlements (spec 7.2) are per module. */
export function moduleOf(permission: Permission): string {
  return permission.slice(0, permission.indexOf(":"));
}

/** The catalog as the roles editor shows it. */
export const permissionCatalog = permissions.map((permission) => ({
  permission,
  module: moduleOf(permission),
  scoped: isScopedPermission(permission),
}));
```

`packages/domain/src/identity/permission-set.ts`:
```ts
// A role's permissions as a set, with the scope of each view permission. The Owner's set holds everything.
import type { PermissionScope } from "@travel-crm/contracts/identity";
import {
  isPermission,
  isScopedPermission,
  permissions,
  type Permission,
  type ScopedPermission,
} from "./permissions.js";

/** One permission and, for view permissions, its scope. */
export interface Grant {
  permission: Permission;
  scope: PermissionScope | null;
}

export class PermissionSet {
  private readonly scopes: ReadonlyMap<Permission, PermissionScope | null>;

  private constructor(grants: Iterable<Grant>) {
    this.scopes = new Map([...grants].map((grant) => [grant.permission, normalScope(grant)]));
  }

  static of(grants: Iterable<Grant>): PermissionSet {
    return new PermissionSet(grants);
  }

  /** Every permission in the catalog, view permissions over all records: the Owner role. */
  static everything(): PermissionSet {
    return new PermissionSet(permissions.map((permission) => ({ permission, scope: "all" })));
  }

  /** Rows read from role_permission. Permissions no longer in the catalog are ignored. */
  static fromStored(rows: Iterable<{ permission: string; scope: string | null }>): PermissionSet {
    const grants: Grant[] = [];
    for (const row of rows) {
      if (isPermission(row.permission)) {
        grants.push({
          permission: row.permission,
          scope: row.scope === "all" ? "all" : row.scope === "own" ? "own" : null,
        });
      }
    }
    return new PermissionSet(grants);
  }

  has(permission: Permission): boolean {
    return this.scopes.has(permission);
  }

  /** The permissions in `required` that this set lacks. */
  missing(required: readonly Permission[]): Permission[] {
    return required.filter((permission) => !this.has(permission));
  }

  /** The scope of a view permission, or null when it is not held. */
  scopeOf(permission: ScopedPermission): PermissionScope | null {
    return this.scopes.get(permission) ?? null;
  }

  /** True when this set holds every permission in `other`, each with at least the same scope. */
  covers(other: PermissionSet): boolean {
    for (const [permission, scope] of other.scopes) {
      if (!this.scopes.has(permission)) return false;
      if (scope === "all" && this.scopes.get(permission) !== "all") return false;
    }
    return true;
  }

  /** The grants in catalog order, as the API returns them. */
  toGrants(): Grant[] {
    return permissions
      .filter((permission) => this.scopes.has(permission))
      .map((permission) => ({ permission, scope: this.scopes.get(permission) ?? null }));
  }
}

/** View permissions always have a scope (missing means the narrower "own"); other permissions never do. */
function normalScope(grant: Grant): PermissionScope | null {
  if (!isScopedPermission(grant.permission)) return null;
  return grant.scope ?? "own";
}
```

`packages/domain/src/identity/starter-roles.ts`:
```ts
// The five roles every new organization starts with (spec 6.5). Owners can edit all but Owner, and add more.
// These defaults are recorded in docs/adr/0005-roles-and-permissions.md for the product owner to review.
import { PermissionSet, type Grant } from "./permission-set.js";
import type { ScopedPermission, UnscopedPermission } from "./permissions.js";

export interface StarterRole {
  key: string;
  name: string;
  isOwner: boolean;
  grants: readonly Grant[];
}

/** The Owner role's key. Keys never use Better Auth's built-in role names (owner, admin, member). */
export const OWNER_ROLE_KEY = "org-owner";

const allRecords = (permission: ScopedPermission): Grant => ({ permission, scope: "all" });
const ownRecords = (permission: ScopedPermission): Grant => ({ permission, scope: "own" });
const allow = (permission: UnscopedPermission): Grant => ({ permission, scope: null });

export const starterRoles: readonly StarterRole[] = [
  // Holds every permission, including ones added to the catalog later; it has no stored grants.
  { key: OWNER_ROLE_KEY, name: "Owner", isOwner: true, grants: [] },
  {
    // Runs the agency day to day: everything except changing roles and permissions.
    key: "org-admin",
    name: "Admin",
    isOwner: false,
    grants: PermissionSet.everything()
      .toGrants()
      .filter((grant) => grant.permission !== "roles:manage"),
  },
  {
    // Works their own leads through to bookings. No margins, no staff or settings.
    key: "sales",
    name: "Sales",
    isOwner: false,
    grants: [
      ownRecords("leads:view"),
      allow("leads:create"),
      allow("leads:edit"),
      ownRecords("quotes:view"),
      allow("quotes:create"),
      allow("quotes:edit"),
      ownRecords("bookings:view"),
      allow("bookings:create"),
      allow("departures:view"),
      allow("suppliers:view"),
    ],
  },
  {
    // Delivers confirmed trips: every booking, departures and suppliers. No leads, no margins.
    key: "operations",
    name: "Operations",
    isOwner: false,
    grants: [
      allRecords("quotes:view"),
      allRecords("bookings:view"),
      allow("bookings:edit"),
      allow("departures:view"),
      allow("departures:create"),
      allow("departures:edit"),
      allow("suppliers:view"),
      allow("suppliers:create"),
      allow("suppliers:edit"),
    ],
  },
  {
    // Invoices, receipts and supplier payments, so they see costs and margins.
    key: "accounts",
    name: "Accounts",
    isOwner: false,
    grants: [
      allow("accounts:view"),
      allow("accounts:create"),
      allow("accounts:edit"),
      allow("money:view_margin"),
      allRecords("quotes:view"),
      allRecords("bookings:view"),
      allow("suppliers:view"),
    ],
  },
];
```

- [ ] **Step 6: Write member access, record scope, sign-in names and role keys**

`packages/domain/src/identity/member-access.ts`:
```ts
// Who is acting in an organization: their membership, role and permissions, read from the database on every request.
import type { PendingStep } from "@travel-crm/contracts/identity";
import type { PermissionSet } from "./permission-set.js";

export interface MemberAccess {
  readonly userId: string;
  readonly memberId: string;
  readonly organizationId: string;
  readonly role: { readonly key: string; readonly name: string; readonly isOwner: boolean };
  readonly permissions: PermissionSet;
  /** Set until the member replaces a temporary password an admin gave them. */
  readonly mustChangePassword: boolean;
  readonly twoFactorEnabled: boolean;
  /** The organization requires every member to sign in with two-factor (organization.require_two_factor). */
  readonly organizationRequiresTwoFactor: boolean;
}

/**
 * What the member must do before the organization app lets them in, or null when nothing. The setup endpoints they
 * need (Better Auth's /change-password and /two-factor/*, and me.get) stay open.
 */
export function pendingStep(access: MemberAccess): PendingStep | null {
  if (access.mustChangePassword) return "CHANGE_PASSWORD";
  if (access.organizationRequiresTwoFactor && !access.twoFactorEnabled) return "SET_UP_TWO_FACTOR";
  return null;
}
```

`packages/domain/src/identity/record-scope.ts`:
```ts
// Check 5 of spec 6.5: a view permission's scope limits a member to the records assigned to them, or lets them see all.
import { DomainError } from "../kernel/index.js";
import type { MemberAccess } from "./member-access.js";
import type { ScopedPermission } from "./permissions.js";

/**
 * A where-clause fragment that limits a list to the records the member may see:
 * `tx.lead.findMany({ where: { ...scopeFilter(access, "leads:view", "assignedToId") } })`.
 */
export function scopeFilter<Field extends string>(
  access: MemberAccess,
  permission: ScopedPermission,
  ownerField: Field,
): Partial<Record<Field, string>> {
  const scope = access.permissions.scopeOf(permission);
  if (scope === null) {
    throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", `Requires ${permission}`);
  }
  return scope === "all" ? {} : ({ [ownerField]: access.userId } as Partial<Record<Field, string>>);
}

/** Treats a record outside the member's scope as missing (spec 6.5: check 5 fails with "not found"). */
export function assertRecordInScope(
  access: MemberAccess,
  permission: ScopedPermission,
  ownerUserId: string | null,
): void {
  const scope = access.permissions.scopeOf(permission);
  if (scope === "all") return;
  if (scope === "own" && ownerUserId === access.userId) return;
  throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
}
```

`packages/domain/src/identity/sign-in-names.ts`:
```ts
// How sign-in names are stored. Usernames carry their organization code, so one Better Auth username table serves
// every organization; staff without email get a placeholder address, because Better Auth requires an email.

/** RFC 2606 reserves .invalid: no real mailbox can have one of these addresses. */
const PLACEHOLDER_DOMAIN = "no-email.invalid";

/** Better Auth's username validator: "<org code>:<username>", both lowercase. */
export const INTERNAL_USERNAME_PATTERN = /^[a-z0-9]{3,12}:[a-z0-9_.-]{2,32}$/;

/** The username Better Auth stores, e.g. "sharma:ravi". Unique across the product because org codes are. */
export function internalUsername(organizationCode: string, username: string): string {
  return `${organizationCode}:${username}`.toLowerCase();
}

/** The address of a person without email, e.g. "sharma-ravi@no-email.invalid". Never shown, never emailed. */
export function placeholderEmail(organizationCode: string, username: string): string {
  // Org codes are letters and digits only, so the first "-" separates code from username and the address is unique.
  return `${organizationCode}-${username}@${PLACEHOLDER_DOMAIN}`.toLowerCase();
}

/** The address a removed person's user row gets, which frees their real one (ADR 0007). */
export function removedPersonEmail(userId: string): string {
  return `removed-${userId}@${PLACEHOLDER_DOMAIN}`;
}

export function isPlaceholderEmail(email: string): boolean {
  return email.endsWith(`@${PLACEHOLDER_DOMAIN}`);
}

/** The email to show for a user: null for placeholders. */
export function shownEmail(email: string): string | null {
  return isPlaceholderEmail(email) ? null : email;
}
```

`packages/domain/src/identity/role-key.ts`:
```ts
// Keys for roles an owner creates: readable where the name allows, unique by a random suffix.
import { randomBytes } from "node:crypto";

/**
 * "Senior sales" → "senior-sales-3f9a2c". Names with no Latin letters or digits, such as "बिक्री", become
 * "role-3f9a2c". The suffix keeps custom keys apart from each other and from the starter roles' keys.
 */
export function roleKeyFor(name: string, suffix = randomBytes(3).toString("hex")): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/, "");
  const start = /^[a-z]/.test(slug) ? slug : slug === "" ? "role" : `role-${slug}`;
  return `${start}-${suffix}`;
}
```

- [ ] **Step 7: Write the access rules and the module's public API**

`packages/domain/src/identity/access-rules.ts`:
```ts
// Rules for changing who can do what (spec 6.3, 6.5). Nobody can hand out more than they hold, nobody can change
// their own access, and only an Owner can make or change an Owner, so every organization keeps one.
import type { PermissionGrantInput } from "@travel-crm/contracts/identity";
import { DomainError } from "../kernel/index.js";
import type { MemberAccess } from "./member-access.js";
import { PermissionSet, type Grant } from "./permission-set.js";
import { isPermission, isScopedPermission } from "./permissions.js";

/** What the rules need to know about a role. */
export interface RoleFacts {
  readonly isOwner: boolean;
  readonly permissions: PermissionSet;
}

/** Turns requested grants into a PermissionSet, refusing unknown permissions and scopes that don't fit. */
export function permissionSetFromInput(grants: readonly PermissionGrantInput[]): PermissionSet {
  const checked: Grant[] = grants.map(({ permission, scope }) => {
    if (!isPermission(permission)) {
      throw new DomainError("VALIDATION", "UNKNOWN_PERMISSION", `Unknown permission ${permission}`);
    }
    if (isScopedPermission(permission) && scope === undefined) {
      throw new DomainError("VALIDATION", "SCOPE_REQUIRED", `${permission} needs a scope: own or all`);
    }
    if (!isScopedPermission(permission) && scope !== undefined) {
      throw new DomainError("VALIDATION", "SCOPE_NOT_ALLOWED", `${permission} does not take a scope`);
    }
    return { permission, scope: scope ?? null };
  });
  return PermissionSet.of(checked);
}

/**
 * The actor may give, edit or take away a role only if they hold everything it allows. Only an Owner may touch the
 * Owner role. Owners hold everything, so this never limits them.
 */
export function assertMayHandleRole(actor: MemberAccess, role: RoleFacts): void {
  if (role.isOwner && !actor.role.isOwner) {
    throw new DomainError("FORBIDDEN", "OWNER_ONLY", "Only an Owner can give or change the Owner role");
  }
  if (!actor.permissions.covers(role.permissions)) {
    throw new DomainError("FORBIDDEN", "EXCEEDS_YOUR_PERMISSIONS", "That role allows more than you can");
  }
}

/**
 * The actor may change another member's role, reset their password or remove them only if they could have given
 * that member's role. Nobody changes their own access: an Owner who wants to step down asks another Owner.
 */
export function assertMayManageMember(actor: MemberAccess, target: { userId: string; role: RoleFacts }): void {
  if (target.userId === actor.userId) {
    throw new DomainError("FORBIDDEN", "CANNOT_CHANGE_YOURSELF", "You cannot change your own access");
  }
  assertMayHandleRole(actor, target.role);
}

/** The Owner role is fixed: it always holds every permission and is never renamed or deleted. */
export function assertRoleIsEditable(role: { isOwner: boolean }): void {
  if (role.isOwner) {
    throw new DomainError("FORBIDDEN", "OWNER_ROLE_IS_FIXED", "The Owner role cannot be changed");
  }
}
```

`packages/domain/src/identity/index.ts` (Task 6 adds to it):
```ts
// Public API of the identity module: permissions, roles, staff and sign-in. Other modules import only from here.
export {
  assertMayHandleRole,
  assertMayManageMember,
  assertRoleIsEditable,
  permissionSetFromInput,
} from "./access-rules.js";
export type { RoleFacts } from "./access-rules.js";
export { pendingStep, type MemberAccess } from "./member-access.js";
export { PermissionSet, type Grant } from "./permission-set.js";
export {
  isPermission,
  isScopedPermission,
  moduleOf,
  permissionCatalog,
  permissions,
  type Permission,
  type ScopedPermission,
  type UnscopedPermission,
} from "./permissions.js";
export { assertRecordInScope, scopeFilter } from "./record-scope.js";
export { roleKeyFor } from "./role-key.js";
export {
  INTERNAL_USERNAME_PATTERN,
  internalUsername,
  isPlaceholderEmail,
  placeholderEmail,
  removedPersonEmail,
  shownEmail,
} from "./sign-in-names.js";
export { OWNER_ROLE_KEY, starterRoles, type StarterRole } from "./starter-roles.js";
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain test && pnpm --filter @travel-crm/domain typecheck && pnpm --filter @travel-crm/domain lint`

Expected: 27 tests pass, and typecheck and lint are clean. "stop an Admin resetting, moving or removing an Owner" and "let only an Owner give or change the Owner role" pin Review Focus 1.

- [ ] **Step 9: Add the module import rules and prove they fire**

In `.dependency-cruiser.cjs`, add these rules to `forbidden`, directly before the `no-circular` rule:
```js
    {
      name: "domain-modules-meet-at-their-index",
      comment:
        "Each domain module's public API is its index.ts (spec 8). Inside a module, import its own files freely; " +
        "from another module, import only that module's index.ts.",
      severity: "error",
      from: { path: "^packages/domain/src/([^/]+)/" },
      to: {
        path: "^packages/domain/src/",
        pathNot: ["^packages/domain/src/$1/", "^packages/domain/src/[^/]+/index\\.ts$"],
      },
    },
    {
      name: "domain-modules-from-outside-through-their-index",
      comment: "Other packages import a domain module only through its index.ts, as @travel-crm/domain/<module>.",
      severity: "error",
      from: { path: "^(apps|packages)/", pathNot: "^packages/domain/" },
      to: { path: "^packages/domain/src/", pathNot: "^packages/domain/src/[^/]+/index\\.ts$" },
    },
    {
      name: "kernel-depends-on-no-module",
      comment: "The shared kernel is the bottom layer (spec 8): modules use it, it uses no module.",
      severity: "error",
      from: { path: "^packages/domain/src/kernel/" },
      to: { path: "^packages/domain/src/", pathNot: "^packages/domain/src/kernel/" },
    },
```

`$1` in `pathNot` refers to the module folder matched in `from.path`, so a module may import its own files.

Prove them with throwaway probe files:
```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
echo 'import { PermissionSet } from "../identity/permission-set.js"; export const probe = PermissionSet;' > packages/domain/src/kernel/probe.ts
mkdir -p packages/domain/src/crm
echo 'import { roleKeyFor } from "../identity/role-key.js"; import { DomainError } from "../kernel/index.js"; export const probe = [roleKeyFor, DomainError];' > packages/domain/src/crm/probe.ts
pnpm exec depcruise packages --config .dependency-cruiser.cjs | grep "error "
rm -rf packages/domain/src/kernel/probe.ts packages/domain/src/crm
pnpm run depcruise
```
Expected:
- `kernel-depends-on-no-module` and `domain-modules-meet-at-their-index` for `kernel/probe.ts`;
- `domain-modules-meet-at-their-index` for `crm/probe.ts` → `identity/role-key.ts`;
- nothing for `crm/probe.ts` → `kernel/index.ts`, because that import goes through the kernel's index.

After deleting the probes, no violations.

- [ ] **Step 10: Record the decision**

`docs/adr/0005-roles-and-permissions.md`. The starter-role table is the default set for the product owner to review:
```markdown
# 0005: Roles and permissions

Date: 2026-10-14 · Status: accepted, defaults open for the product owner's review · Implements spec section 6.5 and
answers open question Q2

## Decision

- **Our own `role` and `role_permission` tables**, organization-owned and under row-level security. Better Auth's
  organization plugin runs without its access-control options (`ac`, `roles`, `dynamicAccessControl`), and
  `member.role` holds our role key.
- **The permission catalog is code**: `packages/domain/src/identity/permissions.ts`, as `module:action`. View
  permissions of assignable records (`leads:view`, `quotes:view`, `bookings:view`) carry a scope, `own` or `all`.
- **The Owner role holds everything**, computed at run time, so it gets new permissions as the catalog grows. It has
  no stored grants and cannot be renamed, edited or deleted.
- **No escalation.** A member may give, edit or delete a role only if they hold everything it allows, at the same or a
  wider scope; may change, reset or remove only someone whose role they could have given; may never change their own
  access. Only an Owner may give or touch the Owner role. Together these keep at least one Owner in every
  organization.
- **Role keys** are stable. Starter roles have fixed keys; a custom role's key is its name in Latin letters plus a
  random suffix (`senior-sales-3f9a2c`, or `role-3f9a2c` for a name like "बिक्री"). Keys never equal Better Auth's
  built-in role names (`owner`, `admin`, `member`). Names are unique per organization, ignoring case.
- A role with staff cannot be deleted. Deleting is a soft delete (ADR 0004).

## Starter roles (for the product owner to review)

Every new organization gets these five (`packages/domain/src/identity/starter-roles.ts`).

| Role       | Key          | Allows                                                                                                                                  |
| ---------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Owner      | `org-owner`  | Everything, always, including permissions added later                                                                                   |
| Admin      | `org-admin`  | Everything except `roles:manage`: staff, settings, audit log, margins, and every module over all records                                |
| Sales      | `sales`      | Leads (own records): view, create, edit. Quotes (own): view, create, edit. Bookings (own): view, create. Departures and suppliers: view |
| Operations | `operations` | Quotes and bookings (all records): view; bookings: edit. Departures and suppliers: view, create, edit                                   |
| Accounts   | `accounts`   | Accounts: view, create, edit. Margins. Quotes and bookings (all records): view. Suppliers: view                                         |

## Context

- **Why not Better Auth's dynamic access control.** It stores a role's permissions as a JSON string in
  `organization_role`, checked by its own endpoints; it has no notion of `own`/`all` scope; and its tables would sit
  outside row-level security. Its built-in `owner`/`admin` roles also grant powers on Better Auth's organization
  endpoints. We block those endpoints (`/api/auth/organization/*` returns 404) and manage members through our API.
- **Checked on every request.** `orgProcedure` reads the member's role and permissions from the database (inside
  `forOrg`), so a role change applies to the next request, not when the 5-minute session cookie expires.

## Consequences

- Adding a module means adding its permissions to the catalog. Owners get them at once; other roles, including the
  starter roles of existing organizations, must be given them.
- Plan 4's plan entitlements (request check 3) map each permission's module (`moduleOf`) to a plan module, inside
  `requires()`, so no procedure changes.
```

Replace `docs/adr/README.md`:
```markdown
# Architecture decision records

Each record states a decision, the context, and the consequences, so it can be revisited knowingly.
The first and largest set of decisions is the Foundation spec: `docs/superpowers/specs/2026-10-13-foundation-design.md`.

| #                                      | Decision                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| [0001](0001-toolchain.md)              | Toolchain versions: Node 24, pnpm 12, TypeScript 6.0.3, Prisma 7.10              |
| [0002](0002-row-level-security.md)     | How organization isolation is implemented in Postgres                            |
| [0003](0003-repository-conventions.md) | Repository conventions: Prettier, husky, lint-staged, commitlint, Renovate       |
| [0004](0004-soft-delete.md)            | Soft delete: hidden rows, refused hard deletes, partial unique indexes           |
| [0005](0005-roles-and-permissions.md)  | Roles and permissions: our own tables, the catalog, starter roles, no escalation |
```

- [ ] **Step 11: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`. Expected: green.

```bash
cd /Users/ak/personal/travel-crm
git add packages/domain .dependency-cruiser.cjs docs/adr pnpm-lock.yaml
git commit -m "feat(domain): add the permission catalog, starter roles and access rules"
```

---

### Task 6: Better Auth and access in the identity module

Better Auth's configuration lives in the identity module, which spec section 4 makes the only code that touches the sign-in tables. This task also adds:
- `resolveAccess`, the per-request read behind request checks 1 and 4;
- starter-role seeding, which plan 4's onboarding will call;
- creating staff in one transaction of our own;
- `createIdentity`, which builds the module once per process.

**Files:**
- Modify: `packages/domain/package.json` (dependencies), `packages/domain/vitest.config.ts` (the database), `packages/domain/src/identity/index.ts`
- Create: `packages/domain/src/identity/auth/create-auth.ts`, `packages/domain/src/identity/auth/totp-label.ts`
- Create: `packages/domain/src/identity/access.ts`, `seed-starter-roles.ts`, `staff-accounts.ts`, `identity.ts`
- Create: `packages/domain/test/identity/test-identity.ts`, `packages/domain/test/identity/access.test.ts`
- Create: `docs/adr/0006-identity-and-sessions.md`; modify `docs/adr/README.md`

**Interfaces:**
- Consumes:
  - From Task 3, `@travel-crm/db/identity` (`createIdentityDatabase`, `IdentityDatabase`, `IdentityClient`, `IdentityTx`, `isUniqueViolation`), `withDeleted` and `softDeleted` from `@travel-crm/db`, `@travel-crm/db/platform` and `@travel-crm/db/testing` in tests, and `@travel-crm/db/testing/global-setup`.
  - From Task 5, everything in the identity index.
  - From Task 4, `MeOutput`.
- Produces:
  - `interface AuthSettings { appName; secret; baseUrl; trustedOrigins: readonly string[]; secureCookies: boolean; rateLimit: boolean; ipAddressHeaders: readonly string[] }`.
  - `createAuth(client: IdentityClient, settings: AuthSettings)` and `type Auth = ReturnType<typeof createAuth>`.
  - `relabelTotpUri(client, totpUri): Promise<string>`.
  - In `access.ts`: `resolveAccess(database, userId, organizationId): Promise<MemberAccess | null>`, `interface SignedInSession { userId; organizationId: string | null; impersonatedBy: string | null }`, `describeSignedInPerson(database, session): Promise<MeOutput | null>`, and `isPlatformAdmin(database, user: { id; role? }): Promise<boolean>`.
  - `seedStarterRoles(database, organizationId): Promise<void>`. A second call throws `CONFLICT ROLES_ALREADY_SEEDED`.
  - In `staff-accounts.ts`: `type PasswordHasher = (password: string) => Promise<string>`, `interface NewStaffAccount { organizationId; name; email?; username?; roleKey; password; mustChangePassword }`, `interface CreatedStaff { userId; memberId }`, and `createStaffAccount(database, hashPassword, account): Promise<CreatedStaff>`. It throws `VALIDATION EMAIL_OR_USERNAME_REQUIRED`, `NOT_FOUND ROLE_NOT_FOUND` or `CONFLICT EMAIL_OR_USERNAME_TAKEN`.
  - `interface IdentityOptions { databaseUrl; maxConnections?; auth: AuthSettings }`, `interface NewOwner { name; email; username?; password; mustChangePassword }`, and `createIdentity(options): Identity`.
  - `interface Identity` with `auth`, `resolveAccess(userId, organizationId)`, `describeSignedInPerson(session)`, `isPlatformAdmin(user)`, `seedStarterRoles(organizationId)`, `createOrganizationOwner(organizationId, owner: NewOwner): Promise<CreatedStaff>` and `disconnect()`. Tasks 7 and 8 add `roles`, `staff` and `settings`.
  - The identity index also exports `createIdentity`, `Identity`, `IdentityOptions`, `NewOwner`, `Auth`, `AuthSettings`, `SignedInSession` and `CreatedStaff`.

- [ ] **Step 1: Add the dependencies and the test database**

Replace `packages/domain/package.json`:
```json
{
  "name": "@travel-crm/domain",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./identity": "./src/identity/index.ts",
    "./kernel": "./src/kernel/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@travel-crm/contracts": "workspace:*",
    "@travel-crm/db": "workspace:*",
    "better-auth": "1.7.7"
  },
  "devDependencies": {
    "@travel-crm/eslint-config": "workspace:*",
    "@travel-crm/tsconfig": "workspace:*",
    "@types/node": "catalog:",
    "eslint": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

Replace `packages/domain/vitest.config.ts`:
```ts
// Domain tests: business rules, and the identity module against the throwaway Postgres that @travel-crm/db's
// test setup starts (same roles and migrations as the db package's own tests).
import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);

export default defineConfig({
  test: {
    name: "domain",
    include: ["test/**/*.test.ts"],
    // Provides inject("dbUrls") to the tests.
    globalSetup: [require.resolve("@travel-crm/db/testing/global-setup")],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install`

- [ ] **Step 2: Write the failing tests**

`packages/domain/test/identity/test-identity.ts`:
```ts
// Builds the identity module on the test database, and agencies with an Owner, for the identity module's tests.
import { createIdentityDatabase, type IdentityDatabase } from "@travel-crm/db/identity";
import type { PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { inject } from "vitest";
import type { AuthSettings } from "../../src/identity/auth/create-auth.js";
import { createIdentity, type Identity } from "../../src/identity/identity.js";

export const testAuthSettings: AuthSettings = {
  appName: "Test CRM",
  secret: "test-secret-".padEnd(48, "x"),
  baseUrl: "http://localhost",
  trustedOrigins: [],
  secureCookies: false,
  rateLimit: false,
  ipAddressHeaders: ["x-forwarded-for"],
};

/** The identity module, plus direct database access for setting up and checking rows. */
export interface TestIdentity {
  identity: Identity;
  database: IdentityDatabase;
  close(): Promise<void>;
}

export function createTestIdentity(): TestIdentity {
  const { runtime } = inject("dbUrls");
  const identity = createIdentity({ databaseUrl: runtime, maxConnections: 3, auth: testAuthSettings });
  const database = createIdentityDatabase(runtime, { maxConnections: 2 });
  return {
    identity,
    database,
    close: async () => {
      await identity.disconnect();
      await database.disconnect();
    },
  };
}

export interface TestAgency {
  organizationId: string;
  code: string;
  ownerUserId: string;
  ownerMemberId: string;
  ownerEmail: string;
  ownerPassword: string;
}

/** An organization with its starter roles and an Owner who can sign in by email. */
export async function createTestAgency(identity: Identity, platform: PlatformClient): Promise<TestAgency> {
  const organizationId = await createTestOrganization(platform, "Test agency");
  const { code } = await platform.organization.findUniqueOrThrow({ where: { id: organizationId } });
  await identity.seedStarterRoles(organizationId);
  const ownerEmail = `owner-${code.toLowerCase()}@example.test`;
  const ownerPassword = "owner-password-1";
  const owner = await identity.createOrganizationOwner(organizationId, {
    name: "Asha Owner",
    email: ownerEmail,
    password: ownerPassword,
    mustChangePassword: false,
  });
  return { organizationId, code, ownerUserId: owner.userId, ownerMemberId: owner.memberId, ownerEmail, ownerPassword };
}

/** Signs in by email through Better Auth and returns headers carrying the session cookies. */
export async function signInByEmail(identity: Identity, email: string, password: string): Promise<Headers> {
  const response = await identity.auth.api.signInEmail({ body: { email, password }, asResponse: true });
  if (!response.ok) throw new Error(`Sign-in failed with ${String(response.status)}`);
  const cookie = response.headers
    .getSetCookie()
    .map((setCookie) => setCookie.split(";")[0])
    .join("; ");
  return new Headers({ cookie });
}
```

`packages/domain/test/identity/access.test.ts`:
```ts
// The identity module against Postgres: starter roles, the first Owner, sessions that carry the organization,
// and the per-request access read behind request checks 1 and 4 (spec 6.5).
import { softDeleted } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { relabelTotpUri } from "../../src/identity/auth/totp-label.js";
import { permissions } from "../../src/identity/permissions.js";
import { createStaffAccount } from "../../src/identity/staff-accounts.js";
import {
  createTestAgency,
  createTestIdentity,
  signInByEmail,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

const hashPassword = (password: string) => Promise.resolve(`unused:${password}`);

describe("identity access", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;

  beforeAll(async () => {
    platform = createPlatformClient(inject("dbUrls").platform);
    test = createTestIdentity();
    agency = await createTestAgency(test.identity, platform);
  });

  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  it("gives a new organization the five starter roles, once", async () => {
    const roles = await test.database.forOrg(agency.organizationId, (tx) =>
      tx.role.findMany({ orderBy: { name: "asc" } }),
    );
    expect(roles.map((role) => role.name)).toEqual(["Accounts", "Admin", "Operations", "Owner", "Sales"]);
    await expect(test.identity.seedStarterRoles(agency.organizationId)).rejects.toMatchObject({
      code: "CONFLICT",
      reason: "ROLES_ALREADY_SEEDED",
    });
  });

  it("signs the Owner in by email into a session that carries their organization", async () => {
    const headers = await signInByEmail(test.identity, agency.ownerEmail.toUpperCase(), agency.ownerPassword);
    const session = await test.identity.auth.api.getSession({ headers });
    expect(session?.session.activeOrganizationId).toBe(agency.organizationId);
  });

  it("gives the Owner every permission in the catalog", async () => {
    const access = await test.identity.resolveAccess(agency.ownerUserId, agency.organizationId);
    expect(access?.role).toEqual({ key: "org-owner", name: "Owner", isOwner: true });
    expect(access?.permissions.missing([...permissions])).toEqual([]);
  });

  it("gives other members exactly their role's permissions", async () => {
    const sales = await createStaffAccount(test.database, hashPassword, {
      organizationId: agency.organizationId,
      name: "Ravi",
      username: "ravi",
      roleKey: "sales",
      password: "ravi-password-1",
      mustChangePassword: true,
    });
    const access = await test.identity.resolveAccess(sales.userId, agency.organizationId);
    expect(access?.permissions.scopeOf("leads:view")).toBe("own");
    expect(access?.permissions.has("staff:manage")).toBe(false);
    expect(access?.mustChangePassword).toBe(true);
  });

  it("finds no access in another organization, for an unknown user, or after removal", async () => {
    const other = await createTestAgency(test.identity, platform);
    expect(await test.identity.resolveAccess(agency.ownerUserId, other.organizationId)).toBeNull();
    expect(await test.identity.resolveAccess("0199c3a2-0000-7000-8000-000000000009", agency.organizationId)).toBeNull();
    await test.database.client.member.update({
      where: { id: other.ownerMemberId },
      data: softDeleted(other.ownerUserId),
    });
    expect(await test.identity.resolveAccess(other.ownerUserId, other.organizationId)).toBeNull();
  });

  it("refuses an email or username that is already in use", async () => {
    await expect(
      test.identity.createOrganizationOwner(agency.organizationId, {
        name: "Copy",
        email: agency.ownerEmail,
        password: "copy-password-1",
        mustChangePassword: false,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", reason: "EMAIL_OR_USERNAME_TAKEN" });
  });

  it("describes a member without email without showing their placeholder address", async () => {
    const meera = await createStaffAccount(test.database, hashPassword, {
      organizationId: agency.organizationId,
      name: "Meera",
      username: "Meera",
      roleKey: "operations",
      password: "meera-password-1",
      mustChangePassword: true,
    });
    const me = await test.identity.describeSignedInPerson({
      userId: meera.userId,
      organizationId: agency.organizationId,
      impersonatedBy: null,
    });
    expect(me?.user).toMatchObject({ name: "Meera", email: null, username: "Meera" });
    expect(me?.member?.role.key).toBe("operations");
    expect(me?.pendingStep).toBe("CHANGE_PASSWORD");
    expect(me?.isPlatformAdmin).toBe(false);
  });

  it("labels a placeholder account in a two-factor link with the organization code and username", async () => {
    const link = `otpauth://totp/Test%20CRM:${encodeURIComponent(`${agency.code.toLowerCase()}-meera@no-email.invalid`)}?secret=ABC&issuer=Test`;
    const relabelled = await relabelTotpUri(test.database.client, link);
    expect(decodeURIComponent(relabelled)).toContain(`Test CRM:${agency.code} Meera?secret=ABC`);
    const withEmail = "otpauth://totp/Test%20CRM:asha%40example.test?secret=ABC";
    expect(await relabelTotpUri(test.database.client, withEmail)).toBe(withEmail);
  });

  it("treats a user as platform staff only with the admin role and no membership", async () => {
    const admin = await test.database.client.user.create({
      data: { name: "Support", email: `support-${agency.code.toLowerCase()}@example.test`, role: "admin" },
    });
    expect(await test.identity.isPlatformAdmin(admin)).toBe(true);
    expect(await test.identity.isPlatformAdmin({ id: agency.ownerUserId, role: "admin" })).toBe(false);
    expect(await test.identity.isPlatformAdmin({ id: admin.id, role: null })).toBe(false);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain test`

Expected: the 27 Task 5 tests pass. `access.test.ts` fails: Vitest cannot resolve `../../src/identity/identity.js`.

- [ ] **Step 4: Configure Better Auth**

`packages/domain/src/identity/auth/totp-label.ts`:
```ts
// Authenticator apps label a code with the account name in the two-factor setup link. Better Auth uses the email;
// for staff without email that is a placeholder, which is never shown, so we label it "<ORG CODE> <username>".
import type { IdentityClient } from "@travel-crm/db/identity";
import { createAuthMiddleware } from "better-auth/api";
import { isPlaceholderEmail } from "../sign-in-names.js";

/** Replaces a placeholder email in an otpauth:// link's label. Other links come back unchanged. */
export async function relabelTotpUri(client: IdentityClient, totpUri: string): Promise<string> {
  // otpauth://totp/<issuer>:<account>?secret=...
  const label = decodeURIComponent(new URL(totpUri).pathname.slice(1));
  const account = label.slice(label.indexOf(":") + 1);
  if (!isPlaceholderEmail(account)) return totpUri;
  const user = await client.user.findUnique({
    where: { email: account },
    select: { displayUsername: true, member: { select: { organization: { select: { code: true } } } } },
  });
  const name = [user?.member?.organization.code, user?.displayUsername].filter(Boolean).join(" ") || "Staff";
  return totpUri.replace(`:${encodeURIComponent(account)}`, `:${encodeURIComponent(name)}`);
}

/** Better Auth hook: relabels the link returned by the two-factor setup endpoints. */
export function relabelTotpForStaffWithoutEmail(client: IdentityClient) {
  return createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/two-factor/enable" && ctx.path !== "/two-factor/get-totp-uri") return;
    const returned = ctx.context.returned as { totpURI?: unknown } | undefined;
    if (typeof returned?.totpURI !== "string") return;
    return ctx.json({ ...returned, totpURI: await relabelTotpUri(client, returned.totpURI) });
  });
}
```

`packages/domain/src/identity/auth/create-auth.ts`:
```ts
// Better Auth, configured for this product (ADR 0006): sign-in by email or by organization code and username,
// database sessions with a 5-minute cookie cache, two-factor, platform admins and impersonation. No self sign-up.
import type { IdentityClient } from "@travel-crm/db/identity";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins/admin";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import { username } from "better-auth/plugins/username";
import { INTERNAL_USERNAME_PATTERN } from "../sign-in-names.js";
import { relabelTotpForStaffWithoutEmail } from "./totp-label.js";

export interface AuthSettings {
  /** The product name authenticator apps show next to the code. */
  appName: string;
  /** BETTER_AUTH_SECRET: signs and encrypts cookies and two-factor secrets. At least 32 characters. */
  secret: string;
  /** BETTER_AUTH_URL: where browsers reach the api, e.g. https://app.example.in. */
  baseUrl: string;
  /** Other origins allowed to send requests with cookies, e.g. the web app's address in development. */
  trustedOrigins: readonly string[];
  /** HTTPS-only cookies with the __Secure- prefix. Always on in production. */
  secureCookies: boolean;
  /** Sign-in rate limiting (spec 6.2). Turned off only in tests that sign in many times. */
  rateLimit: boolean;
  /** Headers the load balancer puts the client's IP address in. Rate limits are counted per IP. */
  ipAddressHeaders: readonly string[];
}

const DAY = 60 * 60 * 24;

export function createAuth(client: IdentityClient, settings: AuthSettings) {
  return betterAuth({
    appName: settings.appName,
    secret: settings.secret,
    baseURL: settings.baseUrl,
    trustedOrigins: [...settings.trustedOrigins],
    database: prismaAdapter(client, { provider: "postgresql" }),
    advanced: {
      // Prisma makes the ids: uuid v7, from @default(uuid(7)) in the schema.
      database: { generateId: false },
      useSecureCookies: settings.secureCookies,
      ipAddress: { ipAddressHeaders: [...settings.ipAddressHeaders] },
      // Better Auth skips its origin check when NODE_ENV is "test" or TEST is set. Pinned on, so tests prove the same
      // protection production gets and a stray environment variable can't switch it off.
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },
    emailAndPassword: {
      enabled: true,
      // Staff are created by their organization's admins through our API (spec 6.1).
      disableSignUp: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      onPasswordReset: async ({ user }) => {
        await clearMustChangePassword(client, user.id);
      },
    },
    session: {
      expiresIn: 7 * DAY,
      updateAge: DAY,
      // Most requests are checked from this signed, encrypted cookie, so the session row is read at most once every
      // 5 minutes per device. Sensitive procedures skip it (spec 6.4).
      cookieCache: { enabled: true, maxAge: 5 * 60, strategy: "jwe" },
    },
    databaseHooks: {
      session: {
        create: {
          // One user, one organization: put it on the session so requests don't look it up.
          before: async (session) => ({
            data: { ...session, activeOrganizationId: await organizationOf(client, session.userId) },
          }),
        },
      },
      account: {
        update: {
          after: async (account, context) => {
            if (context?.path === "/change-password") await clearMustChangePassword(client, account.userId);
          },
        },
      },
    },
    hooks: { after: relabelTotpForStaffWithoutEmail(client) },
    rateLimit: { enabled: settings.rateLimit, storage: "memory" },
    plugins: [
      username({
        // "<org code>:<username>": 3-12 characters, a colon, 2-32 characters.
        minUsernameLength: 6,
        maxUsernameLength: 45,
        usernameValidator: (value) => INTERNAL_USERNAME_PATTERN.test(value),
      }),
      organization({
        // Better Auth's organization `slug` is our `code` column. Clients can't reach the plugin's endpoints:
        // the api blocks /api/auth/organization/*, and members are managed through our own API.
        schema: { organization: { fields: { slug: "code" } } },
        allowUserToCreateOrganization: false,
      }),
      // Platform staff have user role "admin". Support may impersonate a user for at most an hour (spec 6.1).
      admin({ adminRoles: ["admin"], impersonationSessionDuration: 60 * 60 }),
      twoFactor({ issuer: settings.appName }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** The organization of a user's active membership, or null for platform staff and removed members. */
async function organizationOf(client: IdentityClient, userId: string): Promise<string | null> {
  const member = await client.member.findUnique({ where: { userId }, select: { organizationId: true } });
  return member?.organizationId ?? null;
}

async function clearMustChangePassword(client: IdentityClient, userId: string): Promise<void> {
  await client.user.update({ where: { id: userId }, data: { mustChangePassword: false } });
}
```

- [ ] **Step 5: Write access, seeding and staff accounts**

`packages/domain/src/identity/access.ts`:
```ts
// Who is acting, for request checks 1 and 4 (spec 6.5). Read from the database on every request, so a role change
// or a removal takes effect on the next request rather than when the 5-minute session cookie expires.
import type { MeOutput } from "@travel-crm/contracts/identity";
import { withDeleted } from "@travel-crm/db";
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { pendingStep, type MemberAccess } from "./member-access.js";
import { PermissionSet } from "./permission-set.js";
import { shownEmail } from "./sign-in-names.js";

/** The user's active membership, role and permissions in an organization, or null when they have none there. */
export async function resolveAccess(
  database: IdentityDatabase,
  userId: string,
  organizationId: string,
): Promise<MemberAccess | null> {
  return database.forOrg(organizationId, async (tx) => {
    const member = await tx.member.findUnique({
      where: { userId },
      include: {
        user: { select: { mustChangePassword: true, twoFactorEnabled: true } },
        organization: { select: { requireTwoFactor: true } },
      },
    });
    // The member table has no row-level security, so the organization is checked here.
    if (member?.organizationId !== organizationId) return null;
    const role = await tx.role.findUnique({
      where: { organizationId_key: { organizationId, key: member.role } },
      include: { permissions: true },
    });
    return {
      userId,
      memberId: member.id,
      organizationId,
      role: { key: member.role, name: role?.name ?? member.role, isOwner: role?.isOwner ?? false },
      // A role that no longer exists grants nothing (deleting a role is refused while it has members).
      permissions: role?.isOwner ? PermissionSet.everything() : PermissionSet.fromStored(role?.permissions ?? []),
      mustChangePassword: member.user.mustChangePassword,
      twoFactorEnabled: member.user.twoFactorEnabled ?? false,
      organizationRequiresTwoFactor: member.organization.requireTwoFactor,
    };
  });
}

/** The signed-in session, as far as me.get needs it. */
export interface SignedInSession {
  userId: string;
  organizationId: string | null;
  impersonatedBy: string | null;
}

/** Everything the web app needs about the signed-in person, or null if their user no longer exists. */
export async function describeSignedInPerson(
  database: IdentityDatabase,
  session: SignedInSession,
): Promise<MeOutput | null> {
  const user = await database.client.user.findUnique({ where: { id: session.userId } });
  if (!user) return null;
  const access = session.organizationId ? await resolveAccess(database, user.id, session.organizationId) : null;
  const organization = access
    ? await database.client.organization.findUnique({ where: { id: access.organizationId } })
    : null;
  return {
    user: {
      id: user.id,
      name: user.name,
      email: shownEmail(user.email),
      username: user.displayUsername,
      twoFactorEnabled: user.twoFactorEnabled ?? false,
    },
    impersonatedBy: session.impersonatedBy,
    isPlatformAdmin: await isPlatformAdmin(database, user),
    organization: organization && {
      id: organization.id,
      name: organization.name,
      code: organization.code,
      requireTwoFactor: organization.requireTwoFactor,
    },
    member: access && {
      memberId: access.memberId,
      role: access.role,
      permissions: access.permissions.toGrants(),
    },
    pendingStep: access && pendingStep(access),
  };
}

/** Platform staff (spec 6.1): Better Auth role "admin" and no membership in any organization, ever. */
export async function isPlatformAdmin(
  database: IdentityDatabase,
  user: { id: string; role?: string | null | undefined },
): Promise<boolean> {
  if (user.role !== "admin") return false;
  const membership = await withDeleted(() => database.client.member.findUnique({ where: { userId: user.id } }));
  return membership === null;
}
```

`packages/domain/src/identity/seed-starter-roles.ts`:
```ts
// Gives a new organization its five starter roles. Onboarding (plan 4) calls this right after creating the organization.
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import { starterRoles } from "./starter-roles.js";

export async function seedStarterRoles(database: IdentityDatabase, organizationId: string): Promise<void> {
  await database.forOrg(organizationId, async (tx) => {
    if ((await tx.role.count()) > 0) {
      throw new DomainError("CONFLICT", "ROLES_ALREADY_SEEDED", "This organization already has roles");
    }
    for (const starter of starterRoles) {
      const role = await tx.role.create({ data: { key: starter.key, name: starter.name, isOwner: starter.isOwner } });
      await tx.rolePermission.createMany({
        data: starter.grants.map((grant) => ({ roleId: role.id, permission: grant.permission, scope: grant.scope })),
      });
    }
  });
}
```

`packages/domain/src/identity/staff-accounts.ts`:
```ts
// Creates one staff member's sign-in records in a single transaction: user, password account and membership.
// Better Auth hashes the password, but its sign-up endpoint is off, so we write the rows ourselves (ADR 0006).
import { isUniqueViolation } from "@travel-crm/db/identity";
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import { internalUsername, placeholderEmail } from "./sign-in-names.js";

/** Hashes a password the way Better Auth checks it at sign-in. */
export type PasswordHasher = (password: string) => Promise<string>;

export interface NewStaffAccount {
  organizationId: string;
  name: string;
  /** Lowercase. Leave out for staff without email: they get a placeholder address. */
  email?: string | undefined;
  /** As typed, e.g. "Ravi". Needed for organization-code sign-in, and when there is no email. */
  username?: string | undefined;
  roleKey: string;
  password: string;
  /** True for a temporary password set by an admin. */
  mustChangePassword: boolean;
}

export interface CreatedStaff {
  userId: string;
  memberId: string;
}

export async function createStaffAccount(
  database: IdentityDatabase,
  hashPassword: PasswordHasher,
  account: NewStaffAccount,
): Promise<CreatedStaff> {
  if (account.email === undefined && account.username === undefined) {
    throw new DomainError("VALIDATION", "EMAIL_OR_USERNAME_REQUIRED", "Give an email, a username or both");
  }
  // Hashing is slow on purpose; do it before opening the transaction.
  const passwordHash = await hashPassword(account.password);
  try {
    return await database.forOrg(account.organizationId, async (tx) => {
      const organization = await tx.organization.findUniqueOrThrow({ where: { id: account.organizationId } });
      const role = await tx.role.findUnique({
        where: { organizationId_key: { organizationId: account.organizationId, key: account.roleKey } },
      });
      if (!role) throw new DomainError("NOT_FOUND", "ROLE_NOT_FOUND", `No role ${account.roleKey}`);
      const username = account.username === undefined ? null : internalUsername(organization.code, account.username);
      const user = await tx.user.create({
        data: {
          name: account.name,
          email: account.email ?? placeholderEmail(organization.code, account.username ?? ""),
          username,
          displayUsername: account.username ?? null,
          mustChangePassword: account.mustChangePassword,
        },
      });
      // Better Auth's password sign-in reads the "credential" account whose accountId is the user id.
      await tx.account.create({
        data: { userId: user.id, accountId: user.id, providerId: "credential", password: passwordHash },
      });
      const member = await tx.member.create({
        data: { userId: user.id, organizationId: account.organizationId, role: role.key },
      });
      return { userId: user.id, memberId: member.id };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError("CONFLICT", "EMAIL_OR_USERNAME_TAKEN", "That email or username is already in use");
    }
    throw error;
  }
}
```

- [ ] **Step 6: Build the module and export it**

`packages/domain/src/identity/identity.ts`:
```ts
// Builds the identity module: Better Auth plus the operations the API and onboarding call. One per process.
import type { MeOutput } from "@travel-crm/contracts/identity";
import { createIdentityDatabase } from "@travel-crm/db/identity";
import { describeSignedInPerson, isPlatformAdmin, resolveAccess, type SignedInSession } from "./access.js";
import { createAuth, type Auth, type AuthSettings } from "./auth/create-auth.js";
import type { MemberAccess } from "./member-access.js";
import { seedStarterRoles } from "./seed-starter-roles.js";
import { createStaffAccount, type CreatedStaff, type PasswordHasher } from "./staff-accounts.js";
import { OWNER_ROLE_KEY } from "./starter-roles.js";

export interface IdentityOptions {
  /** DATABASE_URL: must connect as the app_runtime role. */
  databaseUrl: string;
  /** Size of the identity module's connection pool. */
  maxConnections?: number;
  auth: AuthSettings;
}

/** The first Owner of a new organization. */
export interface NewOwner {
  name: string;
  email: string;
  username?: string | undefined;
  password: string;
  mustChangePassword: boolean;
}

export interface Identity {
  /** Better Auth. The api serves auth.handler at /api/auth/* and reads sessions with auth.api.getSession. */
  readonly auth: Auth;
  /** The user's membership, role and permissions in the organization, or null when they are not an active member. */
  resolveAccess(userId: string, organizationId: string): Promise<MemberAccess | null>;
  /** What me.get returns. */
  describeSignedInPerson(session: SignedInSession): Promise<MeOutput | null>;
  /** True for platform staff: user role "admin" and no membership. */
  isPlatformAdmin(user: { id: string; role?: string | null | undefined }): Promise<boolean>;
  /** Creates the five starter roles. Onboarding calls it once per new organization. */
  seedStarterRoles(organizationId: string): Promise<void>;
  /** Adds an organization's first Owner. Onboarding only: it checks no permissions. */
  createOrganizationOwner(organizationId: string, owner: NewOwner): Promise<CreatedStaff>;
  /** Closes the connection pool. */
  disconnect(): Promise<void>;
}

export function createIdentity(options: IdentityOptions): Identity {
  const database = createIdentityDatabase(options.databaseUrl, { maxConnections: options.maxConnections ?? 10 });
  const auth = createAuth(database.client, options.auth);
  const hashPassword: PasswordHasher = async (password) => (await auth.$context).password.hash(password);

  return {
    auth,
    resolveAccess: (userId, organizationId) => resolveAccess(database, userId, organizationId),
    describeSignedInPerson: (session) => describeSignedInPerson(database, session),
    isPlatformAdmin: (user) => isPlatformAdmin(database, user),
    seedStarterRoles: (organizationId) => seedStarterRoles(database, organizationId),
    createOrganizationOwner: (organizationId, owner) =>
      createStaffAccount(database, hashPassword, { ...owner, organizationId, roleKey: OWNER_ROLE_KEY }),
    disconnect: () => database.disconnect(),
  };
}
```

Replace `packages/domain/src/identity/index.ts`:
```ts
// Public API of the identity module: permissions, roles, staff and sign-in. Other modules import only from here.
export {
  assertMayHandleRole,
  assertMayManageMember,
  assertRoleIsEditable,
  permissionSetFromInput,
} from "./access-rules.js";
export type { RoleFacts } from "./access-rules.js";
export type { SignedInSession } from "./access.js";
export type { Auth, AuthSettings } from "./auth/create-auth.js";
export { createIdentity, type Identity, type IdentityOptions, type NewOwner } from "./identity.js";
export { pendingStep, type MemberAccess } from "./member-access.js";
export { PermissionSet, type Grant } from "./permission-set.js";
export {
  isPermission,
  isScopedPermission,
  moduleOf,
  permissionCatalog,
  permissions,
  type Permission,
  type ScopedPermission,
  type UnscopedPermission,
} from "./permissions.js";
export { assertRecordInScope, scopeFilter } from "./record-scope.js";
export { roleKeyFor } from "./role-key.js";
export {
  INTERNAL_USERNAME_PATTERN,
  internalUsername,
  isPlaceholderEmail,
  placeholderEmail,
  removedPersonEmail,
  shownEmail,
} from "./sign-in-names.js";
export type { CreatedStaff } from "./staff-accounts.js";
export { OWNER_ROLE_KEY, starterRoles, type StarterRole } from "./starter-roles.js";
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain typecheck && pnpm --filter @travel-crm/domain test`

Expected: 36 tests pass. Among them:
- "signs the Owner in by email into a session that carries their organization": the email is typed in capitals and still works.
- "labels a placeholder account in a two-factor link…" (Review Focus 3).
- "finds no access … after removal".

If `typecheck` reports that `context.path` does not exist in `create-auth.ts`, Better Auth's types changed. Check `better-auth` is exactly 1.7.7.

- [ ] **Step 8: Record the decision**

`docs/adr/0006-identity-and-sessions.md`:
```markdown
# 0006: Identity and sessions

Date: 2026-10-14 · Status: accepted · Implements spec sections 6.1 to 6.4

## Decision

- **Better Auth 1.7.7 runs inside the api**, configured in `packages/domain/src/identity/auth/create-auth.ts`. Spec
  section 4 lets only the identity module touch the sign-in tables, so the configuration lives there and reaches the
  database through `@travel-crm/db/identity`, which dependency-cruiser keeps to the identity module.
- **Plugins:** username, organization (its `slug` is our `code`), admin, two-factor (TOTP). Email and password sign-in
  with sign-up switched off and passwords of 10 to 128 characters.
- **Organization-code sign-in.** Better Auth stores the username as `<org code>:<username>`, lowercased
  (`sharma:ravi`), so its global uniqueness is our per-organization uniqueness. `POST /api/auth/sign-in/org` takes
  `{ orgCode, username, password }`, builds that username and hands the request to Better Auth's username sign-in,
  so rate limiting, two-factor, cookies and hooks apply unchanged.
- **Staff without email** get the placeholder `<code>-<username>@no-email.invalid` (Better Auth requires an email).
  It is never shown: API responses show `null`, the response schemas refuse `.invalid` addresses, and the two-factor
  setup link is relabelled `<CODE> <username>` for the authenticator app.
- **Staff are created in one transaction** of our own (user, password account, membership), with Better Auth's
  password hasher. Every new member gets a temporary password and must change it at first sign-in
  (`user.must_change_password`, cleared by Better Auth hooks after `/change-password` or a password reset).
- **Sessions** are database rows plus a 5-minute JWE cookie cache (answering the spec's open item). Each session
  carries its organization (`active_organization_id`), set by a hook when the session is created.
- **Request checks.** `protectedProcedure` trusts the cookie cache. `orgProcedure` also reads the membership, role and
  permissions from the database on every request. `freshProcedure` (money, roles, exports, staff management) and
  `platformProcedure` re-read the session itself, ignoring the cache.
- **Two-factor** is optional per person. An organization with `require_two_factor` refuses members without it
  everywhere except `me.get` and Better Auth's `/two-factor/*` endpoints. Turning the requirement on needs two-factor
  on the person doing it.
- **Platform staff** have user role `admin` and no membership. They may impersonate a user for up to an hour.
- **Hardening:** origin and CSRF checks pinned on; `/api/auth/organization/*` closed; trusted origins, secure cookies
  and the client-IP header come from the environment; production requires HTTPS and rate limiting.

## Context

- **Why not Better Auth's `createUser` and `addMember`.** Two calls, not atomic: a failure between them leaves a user
  with no organization. Our transaction also checks the role and the organization code in the same place.
- **Cookie cache staleness.** A revoked session passes the cache for up to 5 minutes. Because `orgProcedure` reads the
  membership from the database, a removed member is refused on their next request anyway; only `me.get` still
  answers from the cache, with no organization.
- **Better Auth skips its origin check when `NODE_ENV` is `test`.** We pin `disableOriginCheck: false`, so tests prove
  the same CSRF protection production has.
- **Rate limits are kept in memory**, per instance. With several instances behind a load balancer, move them to the
  database or a shared store (Better Auth `rateLimit.storage`) before launch. The client address comes from the
  header named in `AUTH_IP_ADDRESS_HEADERS`; the load balancer must set it, or all clients share one limit.

## Consequences

- One Better Auth upgrade touches one folder. The Better Auth CLI (`npx auth@1.7.7 generate`) is a reference only:
  the schema in `packages/db/prisma/schema/identity-auth.prisma` is maintained by hand in our naming.
- The organization code must never change once an organization has staff: usernames contain it. Only the platform
  console can change it (the api has no UPDATE right on that column).
```

Replace `docs/adr/README.md`:
```markdown
# Architecture decision records

Each record states a decision, the context, and the consequences, so it can be revisited knowingly.
The first and largest set of decisions is the Foundation spec: `docs/superpowers/specs/2026-10-13-foundation-design.md`.

| #                                      | Decision                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| [0001](0001-toolchain.md)              | Toolchain versions: Node 24, pnpm 12, TypeScript 6.0.3, Prisma 7.10                     |
| [0002](0002-row-level-security.md)     | How organization isolation is implemented in Postgres                                   |
| [0003](0003-repository-conventions.md) | Repository conventions: Prettier, husky, lint-staged, commitlint, Renovate              |
| [0004](0004-soft-delete.md)            | Soft delete: hidden rows, refused hard deletes, partial unique indexes                  |
| [0005](0005-roles-and-permissions.md)  | Roles and permissions: our own tables, the catalog, starter roles, no escalation        |
| [0006](0006-identity-and-sessions.md)  | Identity and sessions: Better Auth, organization-code sign-in, cookie cache, two-factor |
```

- [ ] **Step 9: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`. Expected: green.

```bash
cd /Users/ak/personal/travel-crm
git add packages/domain docs/adr pnpm-lock.yaml
git commit -m "feat(domain): configure Better Auth and resolve each member's access from the database"
```

---

### Task 7: Roles

An organization's roles: list them, create them, change their name or permissions, delete unused ones. Every change goes through the Task 5 rules, so nobody can put a permission they lack into a role, or edit a role that allows more than they hold. The Owner role never changes.

**Files:**
- Create: `packages/domain/src/identity/role-lookup.ts`, `packages/domain/src/identity/roles.ts`
- Modify: `packages/domain/src/identity/identity.ts`
- Create: `packages/domain/test/identity/roles.test.ts`

**Interfaces:**
- Consumes:
  - From Task 6: `IdentityDatabase`, `createStaffAccount` (in tests), `createTestIdentity` and `createTestAgency`.
  - From Task 5: `assertMayHandleRole`, `assertRoleIsEditable`, `permissionSetFromInput`, `PermissionSet`, `roleKeyFor` and `MemberAccess`.
  - From Task 4: `CreateRoleInput`, `UpdateRoleInput`, `DeleteRoleInput` and `RoleSummary`.
- Produces:
  - `interface FoundRole extends RoleFacts { id; key; name }` and `findRole(tx: IdentityTx, key: string): Promise<FoundRole>`, which throws `NOT_FOUND ROLE_NOT_FOUND`.
  - `listRoles(database, actor): Promise<RoleSummary[]>`: the Owner first, then by name.
  - `createRole(database, actor, input): Promise<RoleSummary>`.
  - `updateRole(database, actor, input): Promise<RoleSummary>`.
  - `deleteRole(database, actor, input): Promise<void>`, a soft delete.
  - New refusal reasons: `ROLE_NAME_TAKEN` (CONFLICT; names are compared without case) and `ROLE_IN_USE` (CONFLICT).
  - `Identity.roles: { list(actor); create(actor, input); update(actor, input); delete(actor, input) }`.

- [ ] **Step 1: Write the failing tests**

`packages/domain/test/identity/roles.test.ts`:
```ts
// Roles against Postgres: listing, creating, changing and deleting, and the rules that stop anyone granting more
// than they hold or touching the Owner role.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MemberAccess } from "../../src/identity/member-access.js";
import { createStaffAccount } from "../../src/identity/staff-accounts.js";
import { createTestAgency, createTestIdentity, type TestAgency, type TestIdentity } from "./test-identity.js";

const hashPassword = (password: string) => Promise.resolve(`unused:${password}`);

describe("roles", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;
  let owner: MemberAccess;
  let admin: MemberAccess;

  /** The access of a new member with the given role. */
  async function memberWithRole(roleKey: string, username: string): Promise<MemberAccess> {
    const created = await createStaffAccount(test.database, hashPassword, {
      organizationId: agency.organizationId,
      name: username,
      username,
      roleKey,
      password: "member-password-1",
      mustChangePassword: false,
    });
    const access = await test.identity.resolveAccess(created.userId, agency.organizationId);
    if (!access) throw new Error("new member has no access");
    return access;
  }

  beforeAll(async () => {
    platform = createPlatformClient(inject("dbUrls").platform);
    test = createTestIdentity();
    agency = await createTestAgency(test.identity, platform);
    const ownerAccess = await test.identity.resolveAccess(agency.ownerUserId, agency.organizationId);
    if (!ownerAccess) throw new Error("owner has no access");
    owner = ownerAccess;
    admin = await memberWithRole("org-admin", "admin1");
  });

  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  it("lists the roles Owner first, with what each allows and how many staff have it", async () => {
    const roles = await test.identity.roles.list(owner);
    expect(roles.map((role) => role.name)).toEqual(["Owner", "Accounts", "Admin", "Operations", "Sales"]);
    expect(roles.find((role) => role.isOwner)?.memberCount).toBe(1);
    expect(roles.find((role) => role.name === "Admin")?.memberCount).toBe(1);
    expect(roles.find((role) => role.name === "Sales")?.permissions).toContainEqual({
      permission: "leads:view",
      scope: "own",
    });
  });

  it("creates a role with a readable key, whatever script its name is in", async () => {
    const created = await test.identity.roles.create(owner, {
      name: "Senior sales",
      permissions: [{ permission: "leads:view", scope: "all" }, { permission: "money:view_margin" }],
    });
    expect(created.key).toMatch(/^senior-sales-[0-9a-f]{6}$/);
    expect(created.permissions).toEqual([
      { permission: "money:view_margin", scope: null },
      { permission: "leads:view", scope: "all" },
    ]);
    const hindi = await test.identity.roles.create(owner, { name: "बिक्री टीम", permissions: [] });
    expect(hindi.key).toMatch(/^role-[0-9a-f]{6}$/);
  });

  it("refuses a second role with the same name, ignoring case", async () => {
    await expect(test.identity.roles.create(owner, { name: "sales", permissions: [] })).rejects.toMatchObject({
      reason: "ROLE_NAME_TAKEN",
    });
  });

  it("stops a member granting a permission they don't hold", async () => {
    await expect(
      test.identity.roles.create(admin, { name: "Role editors", permissions: [{ permission: "roles:manage" }] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "EXCEEDS_YOUR_PERMISSIONS" });
  });

  it("changes a role's name and permissions, and the change applies on the next request", async () => {
    const guides = await test.identity.roles.create(owner, { name: "Guides", permissions: [] });
    const guide = await memberWithRole(guides.key, "guide1");
    expect(guide.permissions.has("departures:view")).toBe(false);
    const updated = await test.identity.roles.update(owner, {
      key: guides.key,
      name: "Trip guides",
      permissions: [{ permission: "departures:view" }],
    });
    expect(updated).toMatchObject({ name: "Trip guides", memberCount: 1 });
    const after = await test.identity.resolveAccess(guide.userId, agency.organizationId);
    expect(after?.permissions.has("departures:view")).toBe(true);
    expect(after?.role.name).toBe("Trip guides");
  });

  it("keeps the Owner role fixed", async () => {
    await expect(test.identity.roles.update(owner, { key: "org-owner", name: "Boss" })).rejects.toMatchObject({
      reason: "OWNER_ROLE_IS_FIXED",
    });
    await expect(test.identity.roles.delete(owner, { key: "org-owner" })).rejects.toMatchObject({
      reason: "OWNER_ROLE_IS_FIXED",
    });
  });

  it("stops a member editing a role that allows more than they hold", async () => {
    const directors = await test.identity.roles.create(owner, {
      name: "Directors",
      permissions: [{ permission: "roles:manage" }],
    });
    await expect(test.identity.roles.update(admin, { key: directors.key, permissions: [] })).rejects.toMatchObject({
      reason: "EXCEEDS_YOUR_PERMISSIONS",
    });
  });

  it("refuses to delete a role staff still have", async () => {
    await expect(test.identity.roles.delete(owner, { key: "org-admin" })).rejects.toMatchObject({
      code: "CONFLICT",
      reason: "ROLE_IN_USE",
    });
  });

  it("deletes an unused role, which frees its name", async () => {
    const temporary = await test.identity.roles.create(owner, { name: "Interns", permissions: [] });
    await test.identity.roles.delete(owner, { key: temporary.key });
    const names = (await test.identity.roles.list(owner)).map((role) => role.name);
    expect(names).not.toContain("Interns");
    await expect(test.identity.roles.create(owner, { name: "Interns", permissions: [] })).resolves.toMatchObject({
      name: "Interns",
    });
  });

  it("reports an unknown role as not found", async () => {
    await expect(test.identity.roles.update(owner, { key: "no-such-role", name: "X" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      reason: "ROLE_NOT_FOUND",
    });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain test`

Expected: the earlier tests pass. `roles.test.ts` fails because `test.identity.roles` is undefined ("Cannot read properties of undefined (reading 'list')").

- [ ] **Step 3: Write the role lookup and the role functions**

`packages/domain/src/identity/role-lookup.ts` (Task 8's staff functions use it too):
```ts
// Finds a role of the transaction's organization by key, with what it allows.
import type { IdentityTx } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import type { RoleFacts } from "./access-rules.js";
import { PermissionSet } from "./permission-set.js";

export interface FoundRole extends RoleFacts {
  readonly id: string;
  readonly key: string;
  readonly name: string;
}

/** Throws NOT_FOUND when the organization has no such role, or it was deleted. */
export async function findRole(tx: IdentityTx, key: string): Promise<FoundRole> {
  const role = await tx.role.findFirst({ where: { key }, include: { permissions: true } });
  if (!role) throw new DomainError("NOT_FOUND", "ROLE_NOT_FOUND", `No role ${key}`);
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    isOwner: role.isOwner,
    permissions: role.isOwner ? PermissionSet.everything() : PermissionSet.fromStored(role.permissions),
  };
}
```

`packages/domain/src/identity/roles.ts`:
```ts
// An organization's roles (spec 6.5): list, create, change and delete them. The API checks roles:manage (request
// check 4) before calling the changes; these functions enforce the rules in access-rules.ts.
import type { CreateRoleInput, DeleteRoleInput, RoleSummary, UpdateRoleInput } from "@travel-crm/contracts/identity";
import { softDeleted } from "@travel-crm/db";
import type { IdentityDatabase, IdentityTx } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import { assertMayHandleRole, assertRoleIsEditable, permissionSetFromInput } from "./access-rules.js";
import type { MemberAccess } from "./member-access.js";
import { PermissionSet } from "./permission-set.js";
import { roleKeyFor } from "./role-key.js";
import { findRole } from "./role-lookup.js";

/** The organization's roles, Owner first, with what each allows and how many staff have it. */
export async function listRoles(database: IdentityDatabase, actor: MemberAccess): Promise<RoleSummary[]> {
  return database.forOrg(actor.organizationId, async (tx) => {
    const roles = await tx.role.findMany({
      include: { permissions: true },
      orderBy: [{ isOwner: "desc" }, { name: "asc" }],
    });
    const memberCounts = await countMembersByRole(tx, actor.organizationId);
    return roles.map((role) =>
      summarise(
        {
          ...role,
          permissions: role.isOwner ? PermissionSet.everything() : PermissionSet.fromStored(role.permissions),
        },
        memberCounts.get(role.key) ?? 0,
      ),
    );
  });
}

export async function createRole(
  database: IdentityDatabase,
  actor: MemberAccess,
  input: CreateRoleInput,
): Promise<RoleSummary> {
  const permissions = permissionSetFromInput(input.permissions);
  assertMayHandleRole(actor, { isOwner: false, permissions });
  return database.forOrg(actor.organizationId, async (tx) => {
    await assertNameIsFree(tx, input.name);
    const role = await tx.role.create({ data: { key: roleKeyFor(input.name), name: input.name } });
    await replacePermissions(tx, role.id, permissions);
    return summarise({ ...role, permissions }, 0);
  });
}

export async function updateRole(
  database: IdentityDatabase,
  actor: MemberAccess,
  input: UpdateRoleInput,
): Promise<RoleSummary> {
  return database.forOrg(actor.organizationId, async (tx) => {
    const role = await findRole(tx, input.key);
    assertRoleIsEditable(role);
    // Nobody may edit a role that allows more than they hold, even to take permissions away.
    assertMayHandleRole(actor, role);
    let permissions = role.permissions;
    if (input.permissions !== undefined) {
      permissions = permissionSetFromInput(input.permissions);
      assertMayHandleRole(actor, { isOwner: false, permissions });
      await replacePermissions(tx, role.id, permissions);
    }
    let name = role.name;
    if (input.name !== undefined && input.name !== role.name) {
      await assertNameIsFree(tx, input.name, role.id);
      name = (await tx.role.update({ where: { id: role.id }, data: { name: input.name } })).name;
    }
    const memberCounts = await countMembersByRole(tx, actor.organizationId);
    return summarise({ ...role, name, permissions }, memberCounts.get(role.key) ?? 0);
  });
}

/** Soft-deletes a role nobody has. Its key and name become free again. */
export async function deleteRole(
  database: IdentityDatabase,
  actor: MemberAccess,
  input: DeleteRoleInput,
): Promise<void> {
  await database.forOrg(actor.organizationId, async (tx) => {
    const role = await findRole(tx, input.key);
    assertRoleIsEditable(role);
    assertMayHandleRole(actor, role);
    const members = await tx.member.count({ where: { organizationId: actor.organizationId, role: role.key } });
    if (members > 0) {
      throw new DomainError("CONFLICT", "ROLE_IN_USE", "Move the staff who have this role to another role first");
    }
    await tx.role.update({ where: { id: role.id }, data: softDeleted(actor.userId) });
  });
}

/** Role names are unique within an organization, ignoring case, among roles that are not deleted. */
async function assertNameIsFree(tx: IdentityTx, name: string, exceptRoleId?: string): Promise<void> {
  const clash = await tx.role.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptRoleId ? { id: { not: exceptRoleId } } : {}) },
  });
  if (clash) throw new DomainError("CONFLICT", "ROLE_NAME_TAKEN", `There is already a role called ${clash.name}`);
}

async function replacePermissions(tx: IdentityTx, roleId: string, permissions: PermissionSet): Promise<void> {
  await tx.rolePermission.deleteMany({ where: { roleId } });
  await tx.rolePermission.createMany({
    data: permissions.toGrants().map((grant) => ({ roleId, permission: grant.permission, scope: grant.scope })),
  });
}

/** Active members per role key. The member table has no row-level security, so the organization is filtered here. */
async function countMembersByRole(tx: IdentityTx, organizationId: string): Promise<Map<string, number>> {
  const groups = await tx.member.groupBy({ by: ["role"], where: { organizationId }, _count: { _all: true } });
  return new Map(groups.map((group) => [group.role, group._count._all]));
}

function summarise(
  role: { key: string; name: string; isOwner: boolean; permissions: PermissionSet },
  memberCount: number,
): RoleSummary {
  return {
    key: role.key,
    name: role.name,
    isOwner: role.isOwner,
    permissions: role.permissions.toGrants(),
    memberCount,
  };
}
```

Replace `packages/domain/src/identity/identity.ts` (it adds `roles`):
```ts
// Builds the identity module: Better Auth plus the operations the API and onboarding call. One per process.
import type {
  CreateRoleInput,
  DeleteRoleInput,
  MeOutput,
  RoleSummary,
  UpdateRoleInput,
} from "@travel-crm/contracts/identity";
import { createIdentityDatabase } from "@travel-crm/db/identity";
import { describeSignedInPerson, isPlatformAdmin, resolveAccess, type SignedInSession } from "./access.js";
import { createAuth, type Auth, type AuthSettings } from "./auth/create-auth.js";
import type { MemberAccess } from "./member-access.js";
import { createRole, deleteRole, listRoles, updateRole } from "./roles.js";
import { seedStarterRoles } from "./seed-starter-roles.js";
import { createStaffAccount, type CreatedStaff, type PasswordHasher } from "./staff-accounts.js";
import { OWNER_ROLE_KEY } from "./starter-roles.js";

export interface IdentityOptions {
  /** DATABASE_URL: must connect as the app_runtime role. */
  databaseUrl: string;
  /** Size of the identity module's connection pool. */
  maxConnections?: number;
  auth: AuthSettings;
}

/** The first Owner of a new organization. */
export interface NewOwner {
  name: string;
  email: string;
  username?: string | undefined;
  password: string;
  mustChangePassword: boolean;
}

export interface Identity {
  /** Better Auth. The api serves auth.handler at /api/auth/* and reads sessions with auth.api.getSession. */
  readonly auth: Auth;
  /** The user's membership, role and permissions in the organization, or null when they are not an active member. */
  resolveAccess(userId: string, organizationId: string): Promise<MemberAccess | null>;
  /** What me.get returns. */
  describeSignedInPerson(session: SignedInSession): Promise<MeOutput | null>;
  /** True for platform staff: user role "admin" and no membership. */
  isPlatformAdmin(user: { id: string; role?: string | null | undefined }): Promise<boolean>;
  /** The actor's organization's roles. Changing them needs roles:manage, which the API checks. */
  readonly roles: {
    list(actor: MemberAccess): Promise<RoleSummary[]>;
    create(actor: MemberAccess, input: CreateRoleInput): Promise<RoleSummary>;
    update(actor: MemberAccess, input: UpdateRoleInput): Promise<RoleSummary>;
    delete(actor: MemberAccess, input: DeleteRoleInput): Promise<void>;
  };
  /** Creates the five starter roles. Onboarding calls it once per new organization. */
  seedStarterRoles(organizationId: string): Promise<void>;
  /** Adds an organization's first Owner. Onboarding only: it checks no permissions. */
  createOrganizationOwner(organizationId: string, owner: NewOwner): Promise<CreatedStaff>;
  /** Closes the connection pool. */
  disconnect(): Promise<void>;
}

export function createIdentity(options: IdentityOptions): Identity {
  const database = createIdentityDatabase(options.databaseUrl, { maxConnections: options.maxConnections ?? 10 });
  const auth = createAuth(database.client, options.auth);
  const hashPassword: PasswordHasher = async (password) => (await auth.$context).password.hash(password);

  return {
    auth,
    resolveAccess: (userId, organizationId) => resolveAccess(database, userId, organizationId),
    describeSignedInPerson: (session) => describeSignedInPerson(database, session),
    isPlatformAdmin: (user) => isPlatformAdmin(database, user),
    roles: {
      list: (actor) => listRoles(database, actor),
      create: (actor, input) => createRole(database, actor, input),
      update: (actor, input) => updateRole(database, actor, input),
      delete: (actor, input) => deleteRole(database, actor, input),
    },
    seedStarterRoles: (organizationId) => seedStarterRoles(database, organizationId),
    createOrganizationOwner: (organizationId, owner) =>
      createStaffAccount(database, hashPassword, { ...owner, organizationId, roleKey: OWNER_ROLE_KEY }),
    disconnect: () => database.disconnect(),
  };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain typecheck && pnpm --filter @travel-crm/domain test`

Expected: 46 tests pass. Among them:
- "stops a member granting a permission they don't hold" and "stops a member editing a role that allows more than they hold" (Review Focus 1).
- "creates a role with a readable key, whatever script its name is in": a Hindi name gives the key `role-xxxxxx`.

- [ ] **Step 5: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`. Expected: green.

```bash
cd /Users/ak/personal/travel-crm
git add packages/domain
git commit -m "feat(domain): add role management with no-escalation rules"
```

---

### Task 8: Staff, and requiring two-factor

Staff management (spec 6.3) and the one organization setting identity owns:
- list staff;
- add them with or without email, always with a temporary password they must change;
- change their role;
- reset their password;
- remove them, which ends their sessions and releases their email and username (ADR 0007);
- require two-factor for the whole organization.

**Files:**
- Create: `packages/domain/src/identity/staff.ts`, `packages/domain/src/identity/settings.ts`
- Modify: `packages/domain/src/identity/identity.ts`
- Create: `packages/domain/test/identity/staff.test.ts`
- Create: `packages/domain/README.md`, `packages/domain/src/identity/README.md`, `docs/adr/0007-removing-staff.md`; modify `docs/adr/README.md`

**Interfaces:**
- Consumes:
  - From Task 7: `findRole`.
  - From Task 6: `createStaffAccount`, `PasswordHasher`, the test helpers and `signInByEmail`.
  - From Task 5: `assertMayHandleRole`, `assertMayManageMember`, `isPlaceholderEmail`, `removedPersonEmail` and `shownEmail`.
  - From Task 3: `softDeleted`.
  - From Task 4: the staff and settings contracts.
- Produces:
  - `listStaff(database, actor): Promise<StaffMember[]>`: this organization's active staff, oldest first, placeholder emails shown as `null`.
  - `createStaff(database, hashPassword, actor, input: CreateStaffInput): Promise<StaffMember>`: always `mustChangePassword: true`.
  - `updateStaffRole(database, actor, input): Promise<StaffMember>`.
  - `resetStaffPassword(database, hashPassword, actor, input): Promise<void>`: deletes the person's sessions and sets `mustChangePassword`.
  - `removeStaff(database, actor, input): Promise<void>`.
  - `setTwoFactorRequirement(database, actor, input): Promise<SecuritySettings>`: throws `FORBIDDEN ENABLE_TWO_FACTOR_FIRST` when the actor has no two-factor.
  - New refusal reason: `MEMBER_NOT_FOUND` (NOT_FOUND). Members of other organizations are reported this way.
  - `Identity.staff: { list; create; updateRole; resetPassword; remove }` and `Identity.settings: { setTwoFactorRequirement }`.

- [ ] **Step 1: Write the failing tests**

`packages/domain/test/identity/staff.test.ts`:
```ts
// Staff against Postgres: adding people with or without email, changing roles, resetting passwords and removing
// people (spec 6.3), with the rules that stop anyone reaching above their own access.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MemberAccess } from "../../src/identity/member-access.js";
import {
  createTestAgency,
  createTestIdentity,
  signInByEmail,
  type TestAgency,
  type TestIdentity,
} from "./test-identity.js";

describe("staff", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;
  let owner: MemberAccess;

  async function accessOf(userId: string, organizationId = agency.organizationId): Promise<MemberAccess> {
    const access = await test.identity.resolveAccess(userId, organizationId);
    if (!access) throw new Error("no access");
    return access;
  }

  /** Signs in with organization code and username through Better Auth; true when it succeeds. */
  async function canSignInByUsername(code: string, username: string, password: string): Promise<boolean> {
    const response = await test.identity.auth.api.signInUsername({
      body: { username: `${code}:${username}`.toLowerCase(), password },
      asResponse: true,
    });
    return response.ok;
  }

  beforeAll(async () => {
    platform = createPlatformClient(inject("dbUrls").platform);
    test = createTestIdentity();
    agency = await createTestAgency(test.identity, platform);
    owner = await accessOf(agency.ownerUserId);
  });

  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  it("adds staff without email, who sign in with the organization code and must change their password", async () => {
    const ravi = await test.identity.staff.create(owner, {
      name: "Ravi Kumar",
      username: "Ravi",
      roleKey: "sales",
      temporaryPassword: "temporary-pass-1",
    });
    expect(ravi).toMatchObject({ email: null, username: "Ravi", role: { key: "sales", name: "Sales" } });
    expect(ravi.mustChangePassword).toBe(true);
    expect(await canSignInByUsername(agency.code, "RAVI", "temporary-pass-1")).toBe(true);
  });

  it("adds staff with email, who sign in by email", async () => {
    const meera = await test.identity.staff.create(owner, {
      name: "Meera",
      email: `meera-${agency.code.toLowerCase()}@example.test`,
      roleKey: "operations",
      temporaryPassword: "temporary-pass-2",
    });
    expect(meera.email).toBe(`meera-${agency.code.toLowerCase()}@example.test`);
    await expect(signInByEmail(test.identity, meera.email ?? "", "temporary-pass-2")).resolves.toBeInstanceOf(Headers);
  });

  it("lists only this organization's staff, never showing placeholder addresses", async () => {
    const other = await createTestAgency(test.identity, platform);
    const staff = await test.identity.staff.list(owner);
    expect(staff.map((member) => member.name)).toEqual(["Asha Owner", "Ravi Kumar", "Meera"]);
    expect(staff.some((member) => member.userId === other.ownerUserId)).toBe(false);
    expect(staff.every((member) => !member.email?.endsWith(".invalid"))).toBe(true);
  });

  it("refuses a username already taken in the organization, ignoring case", async () => {
    await expect(
      test.identity.staff.create(owner, {
        name: "Another Ravi",
        username: "ravi",
        roleKey: "sales",
        temporaryPassword: "temporary-pass-3",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", reason: "EMAIL_OR_USERNAME_TAKEN" });
  });

  it("lets the same username exist in two organizations", async () => {
    const other = await createTestAgency(test.identity, platform);
    const otherOwner = await accessOf(other.ownerUserId, other.organizationId);
    await expect(
      test.identity.staff.create(otherOwner, {
        name: "Ravi",
        username: "ravi",
        roleKey: "sales",
        temporaryPassword: "temporary-pass-4",
      }),
    ).resolves.toMatchObject({ username: "ravi" });
  });

  describe("an Admin", () => {
    let admin: MemberAccess;

    beforeAll(async () => {
      const created = await test.identity.staff.create(owner, {
        name: "Admin",
        username: "admin",
        roleKey: "org-admin",
        temporaryPassword: "temporary-pass-5",
      });
      admin = await accessOf(created.userId);
    });

    it("cannot make anyone an Owner", async () => {
      await expect(
        test.identity.staff.create(admin, {
          name: "New boss",
          username: "boss",
          roleKey: "org-owner",
          temporaryPassword: "temporary-pass-6",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "OWNER_ONLY" });
    });

    it("cannot give a role that allows more than they hold", async () => {
      const directors = await test.identity.roles.create(owner, {
        name: "Directors",
        permissions: [{ permission: "roles:manage" }],
      });
      await expect(
        test.identity.staff.create(admin, {
          name: "Director",
          username: "director",
          roleKey: directors.key,
          temporaryPassword: "temporary-pass-7",
        }),
      ).rejects.toMatchObject({ reason: "EXCEEDS_YOUR_PERMISSIONS" });
    });

    it("cannot change, reset or remove the Owner", async () => {
      const target = { memberId: agency.ownerMemberId };
      await expect(test.identity.staff.updateRole(admin, { ...target, roleKey: "sales" })).rejects.toMatchObject({
        reason: "OWNER_ONLY",
      });
      await expect(
        test.identity.staff.resetPassword(admin, { ...target, temporaryPassword: "hijacked-pass-1" }),
      ).rejects.toMatchObject({
        reason: "OWNER_ONLY",
      });
      await expect(test.identity.staff.remove(admin, target)).rejects.toMatchObject({ reason: "OWNER_ONLY" });
    });

    it("cannot change their own access", async () => {
      await expect(
        test.identity.staff.updateRole(admin, { memberId: admin.memberId, roleKey: "sales" }),
      ).rejects.toMatchObject({
        reason: "CANNOT_CHANGE_YOURSELF",
      });
    });
  });

  it("stops the Owner removing or demoting themselves, so the organization keeps an Owner", async () => {
    await expect(test.identity.staff.remove(owner, { memberId: owner.memberId })).rejects.toMatchObject({
      reason: "CANNOT_CHANGE_YOURSELF",
    });
    await expect(
      test.identity.staff.updateRole(owner, { memberId: owner.memberId, roleKey: "sales" }),
    ).rejects.toMatchObject({
      reason: "CANNOT_CHANGE_YOURSELF",
    });
  });

  it("changes a member's role, effective on their next request", async () => {
    const tara = await test.identity.staff.create(owner, {
      name: "Tara",
      username: "tara",
      roleKey: "sales",
      temporaryPassword: "temporary-pass-8",
    });
    const moved = await test.identity.staff.updateRole(owner, { memberId: tara.memberId, roleKey: "accounts" });
    expect(moved.role).toEqual({ key: "accounts", name: "Accounts" });
    expect((await accessOf(tara.userId)).permissions.has("money:view_margin")).toBe(true);
  });

  it("treats a member of another organization as not found", async () => {
    const other = await createTestAgency(test.identity, platform);
    await expect(test.identity.staff.remove(owner, { memberId: other.ownerMemberId })).rejects.toMatchObject({
      code: "NOT_FOUND",
      reason: "MEMBER_NOT_FOUND",
    });
  });

  it("resets a password to a temporary one and signs the person out everywhere", async () => {
    const sunil = await test.identity.staff.create(owner, {
      name: "Sunil",
      username: "sunil",
      roleKey: "sales",
      temporaryPassword: "first-temp-pass-1",
    });
    await test.database.client.user.update({ where: { id: sunil.userId }, data: { mustChangePassword: false } });
    expect(await canSignInByUsername(agency.code, "sunil", "first-temp-pass-1")).toBe(true);
    await test.identity.staff.resetPassword(owner, {
      memberId: sunil.memberId,
      temporaryPassword: "second-temp-pass-1",
    });
    expect(await test.database.client.session.count({ where: { userId: sunil.userId } })).toBe(0);
    expect(await canSignInByUsername(agency.code, "sunil", "first-temp-pass-1")).toBe(false);
    expect(await canSignInByUsername(agency.code, "sunil", "second-temp-pass-1")).toBe(true);
    expect((await accessOf(sunil.userId)).mustChangePassword).toBe(true);
  });

  it("removes a person: no access, no sign-in, and their email and username are free again", async () => {
    const email = `kiran-${agency.code.toLowerCase()}@example.test`;
    const kiran = await test.identity.staff.create(owner, {
      name: "Kiran",
      email,
      username: "kiran",
      roleKey: "sales",
      temporaryPassword: "kiran-temp-pass-1",
    });
    await signInByEmail(test.identity, email, "kiran-temp-pass-1");
    await test.identity.staff.remove(owner, { memberId: kiran.memberId });

    expect(await test.identity.resolveAccess(kiran.userId, agency.organizationId)).toBeNull();
    expect(await test.database.client.session.count({ where: { userId: kiran.userId } })).toBe(0);
    await expect(signInByEmail(test.identity, email, "kiran-temp-pass-1")).rejects.toThrow(/Sign-in failed/);
    expect(await canSignInByUsername(agency.code, "kiran", "kiran-temp-pass-1")).toBe(false);
    expect(await test.database.client.user.findUnique({ where: { id: kiran.userId } })).toMatchObject({
      formerEmail: email,
      banned: true,
    });
    expect((await test.identity.staff.list(owner)).some((member) => member.memberId === kiran.memberId)).toBe(false);

    const other = await createTestAgency(test.identity, platform);
    const otherOwner = await accessOf(other.ownerUserId, other.organizationId);
    await expect(
      test.identity.staff.create(otherOwner, {
        name: "Kiran",
        email,
        roleKey: "sales",
        temporaryPassword: "kiran-temp-pass-2",
      }),
    ).resolves.toMatchObject({ email });
    await expect(
      test.identity.staff.create(owner, {
        name: "Kiran Two",
        username: "kiran",
        roleKey: "sales",
        temporaryPassword: "kiran-temp-pass-3",
      }),
    ).resolves.toMatchObject({ username: "kiran" });
    await expect(test.identity.staff.remove(owner, { memberId: kiran.memberId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("two-factor requirement", () => {
  let platform: PlatformClient;
  let test: TestIdentity;
  let agency: TestAgency;

  beforeAll(async () => {
    platform = createPlatformClient(inject("dbUrls").platform);
    test = createTestIdentity();
    agency = await createTestAgency(test.identity, platform);
  });

  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
  });

  it("cannot be switched on by someone who doesn't use two-factor themselves", async () => {
    const owner = await test.identity.resolveAccess(agency.ownerUserId, agency.organizationId);
    if (!owner) throw new Error("no access");
    await expect(test.identity.settings.setTwoFactorRequirement(owner, { required: true })).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "ENABLE_TWO_FACTOR_FIRST",
    });
  });

  it("once on, asks every member without two-factor to set it up", async () => {
    await test.database.client.user.update({ where: { id: agency.ownerUserId }, data: { twoFactorEnabled: true } });
    const owner = await test.identity.resolveAccess(agency.ownerUserId, agency.organizationId);
    if (!owner) throw new Error("no access");
    await expect(test.identity.settings.setTwoFactorRequirement(owner, { required: true })).resolves.toEqual({
      requireTwoFactor: true,
    });
    const sales = await test.identity.staff.create(owner, {
      name: "Ravi",
      username: "ravi",
      roleKey: "sales",
      temporaryPassword: "temporary-pass-1",
    });
    await test.database.client.user.update({ where: { id: sales.userId }, data: { mustChangePassword: false } });
    const ravi = await test.identity.resolveAccess(sales.userId, agency.organizationId);
    expect(ravi?.organizationRequiresTwoFactor).toBe(true);
    expect(ravi?.twoFactorEnabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain test`

Expected: `staff.test.ts` fails because `test.identity.staff` is undefined.

- [ ] **Step 3: Write the staff functions and the two-factor setting**

`packages/domain/src/identity/staff.ts`:
```ts
// An organization's staff (spec 6.3): list them, add them with or without email, change their role, reset their
// password, remove them. The API checks staff:manage (request check 4) on a fresh session before calling these.
import type {
  CreateStaffInput,
  RemoveStaffInput,
  ResetStaffPasswordInput,
  StaffMember,
  UpdateStaffRoleInput,
} from "@travel-crm/contracts/identity";
import { softDeleted } from "@travel-crm/db";
import type { IdentityDatabase, IdentityTx } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import { assertMayHandleRole, assertMayManageMember } from "./access-rules.js";
import type { MemberAccess } from "./member-access.js";
import { findRole } from "./role-lookup.js";
import { isPlaceholderEmail, removedPersonEmail, shownEmail } from "./sign-in-names.js";
import { createStaffAccount, type PasswordHasher } from "./staff-accounts.js";

/** The organization's active staff, oldest first. Placeholder emails are never shown. */
export async function listStaff(database: IdentityDatabase, actor: MemberAccess): Promise<StaffMember[]> {
  return database.forOrg(actor.organizationId, async (tx) => {
    // The member table has no row-level security, so the organization is filtered here.
    const members = await tx.member.findMany({
      where: { organizationId: actor.organizationId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    const roleNames = new Map((await tx.role.findMany()).map((role) => [role.key, role.name]));
    return members.map((member) => ({
      memberId: member.id,
      userId: member.userId,
      name: member.user.name,
      email: shownEmail(member.user.email),
      username: member.user.displayUsername,
      role: { key: member.role, name: roleNames.get(member.role) ?? member.role },
      twoFactorEnabled: member.user.twoFactorEnabled ?? false,
      mustChangePassword: member.user.mustChangePassword,
      joinedAt: member.createdAt.toISOString(),
    }));
  });
}

/** Adds a staff member with a temporary password they must change at first sign-in. */
export async function createStaff(
  database: IdentityDatabase,
  hashPassword: PasswordHasher,
  actor: MemberAccess,
  input: CreateStaffInput,
): Promise<StaffMember> {
  const role = await database.forOrg(actor.organizationId, (tx) => findRole(tx, input.roleKey));
  assertMayHandleRole(actor, role);
  const created = await createStaffAccount(database, hashPassword, {
    organizationId: actor.organizationId,
    name: input.name,
    email: input.email,
    username: input.username,
    roleKey: role.key,
    password: input.temporaryPassword,
    mustChangePassword: true,
  });
  return staffMember(database, actor, created.memberId);
}

export async function updateStaffRole(
  database: IdentityDatabase,
  actor: MemberAccess,
  input: UpdateStaffRoleInput,
): Promise<StaffMember> {
  await database.forOrg(actor.organizationId, async (tx) => {
    const target = await findMember(tx, actor, input.memberId);
    assertMayManageMember(actor, { userId: target.userId, role: await findRole(tx, target.role) });
    const newRole = await findRole(tx, input.roleKey);
    assertMayHandleRole(actor, newRole);
    await tx.member.update({ where: { id: target.id }, data: { role: newRole.key } });
  });
  return staffMember(database, actor, input.memberId);
}

/** Sets a temporary password, which must be changed at next sign-in, and signs the person out everywhere. */
export async function resetStaffPassword(
  database: IdentityDatabase,
  hashPassword: PasswordHasher,
  actor: MemberAccess,
  input: ResetStaffPasswordInput,
): Promise<void> {
  const passwordHash = await hashPassword(input.temporaryPassword);
  await database.forOrg(actor.organizationId, async (tx) => {
    const target = await findMember(tx, actor, input.memberId);
    assertMayManageMember(actor, { userId: target.userId, role: await findRole(tx, target.role) });
    await tx.account.updateMany({
      where: { userId: target.userId, providerId: "credential" },
      data: { password: passwordHash },
    });
    await tx.user.update({ where: { id: target.userId }, data: { mustChangePassword: true } });
    await tx.session.deleteMany({ where: { userId: target.userId } });
  });
}

/**
 * Removes a person from the organization (ADR 0007): their membership is soft-deleted, their sessions end, and their
 * email and username are released so they can be used again, by this organization or another.
 */
export async function removeStaff(
  database: IdentityDatabase,
  actor: MemberAccess,
  input: RemoveStaffInput,
): Promise<void> {
  await database.forOrg(actor.organizationId, async (tx) => {
    const target = await findMember(tx, actor, input.memberId);
    assertMayManageMember(actor, { userId: target.userId, role: await findRole(tx, target.role) });
    await tx.member.update({ where: { id: target.id }, data: softDeleted(actor.userId) });
    const user = await tx.user.findUniqueOrThrow({ where: { id: target.userId } });
    await tx.user.update({
      where: { id: user.id },
      data: {
        formerEmail: isPlaceholderEmail(user.email) ? null : user.email,
        email: removedPersonEmail(user.id),
        username: null,
        // Belt and braces: Better Auth refuses to create a session for a banned user.
        banned: true,
        banReason: "Removed from their organization",
      },
    });
    await tx.session.deleteMany({ where: { userId: user.id } });
  });
}

/** An active member of the actor's organization. Members of other organizations are "not found". */
async function findMember(tx: IdentityTx, actor: MemberAccess, memberId: string) {
  const member = await tx.member.findFirst({ where: { id: memberId, organizationId: actor.organizationId } });
  if (!member) throw new DomainError("NOT_FOUND", "MEMBER_NOT_FOUND", "No such staff member");
  return member;
}

async function staffMember(database: IdentityDatabase, actor: MemberAccess, memberId: string): Promise<StaffMember> {
  const member = (await listStaff(database, actor)).find((staff) => staff.memberId === memberId);
  if (!member) throw new DomainError("NOT_FOUND", "MEMBER_NOT_FOUND", "No such staff member");
  return member;
}
```

`packages/domain/src/identity/settings.ts`:
```ts
// The organization setting the identity module owns: whether every member must use two-factor sign-in (spec 6.2).
// The API checks settings:manage before calling setTwoFactorRequirement.
import type { SecuritySettings, SetTwoFactorRequirementInput } from "@travel-crm/contracts/identity";
import type { IdentityDatabase } from "@travel-crm/db/identity";
import { DomainError } from "../kernel/index.js";
import type { MemberAccess } from "./member-access.js";

export async function setTwoFactorRequirement(
  database: IdentityDatabase,
  actor: MemberAccess,
  input: SetTwoFactorRequirementInput,
): Promise<SecuritySettings> {
  // Otherwise the person turning it on would be shut out of the app until they set it up.
  if (input.required && !actor.twoFactorEnabled) {
    throw new DomainError("FORBIDDEN", "ENABLE_TWO_FACTOR_FIRST", "Turn on two-factor sign-in for yourself first");
  }
  const organization = await database.forOrg(actor.organizationId, (tx) =>
    tx.organization.update({ where: { id: actor.organizationId }, data: { requireTwoFactor: input.required } }),
  );
  return { requireTwoFactor: organization.requireTwoFactor };
}
```

Replace `packages/domain/src/identity/identity.ts` (it adds `staff` and `settings`):
```ts
// Builds the identity module: Better Auth plus the operations the API and onboarding call. One per process.
import type {
  CreateRoleInput,
  CreateStaffInput,
  DeleteRoleInput,
  MeOutput,
  RemoveStaffInput,
  ResetStaffPasswordInput,
  RoleSummary,
  SecuritySettings,
  SetTwoFactorRequirementInput,
  StaffMember,
  UpdateRoleInput,
  UpdateStaffRoleInput,
} from "@travel-crm/contracts/identity";
import { createIdentityDatabase } from "@travel-crm/db/identity";
import { describeSignedInPerson, isPlatformAdmin, resolveAccess, type SignedInSession } from "./access.js";
import { createAuth, type Auth, type AuthSettings } from "./auth/create-auth.js";
import type { MemberAccess } from "./member-access.js";
import { createRole, deleteRole, listRoles, updateRole } from "./roles.js";
import { seedStarterRoles } from "./seed-starter-roles.js";
import { setTwoFactorRequirement } from "./settings.js";
import { createStaffAccount, type CreatedStaff, type PasswordHasher } from "./staff-accounts.js";
import { createStaff, listStaff, removeStaff, resetStaffPassword, updateStaffRole } from "./staff.js";
import { OWNER_ROLE_KEY } from "./starter-roles.js";

export interface IdentityOptions {
  /** DATABASE_URL: must connect as the app_runtime role. */
  databaseUrl: string;
  /** Size of the identity module's connection pool. */
  maxConnections?: number;
  auth: AuthSettings;
}

/** The first Owner of a new organization. */
export interface NewOwner {
  name: string;
  email: string;
  username?: string | undefined;
  password: string;
  mustChangePassword: boolean;
}

export interface Identity {
  /** Better Auth. The api serves auth.handler at /api/auth/* and reads sessions with auth.api.getSession. */
  readonly auth: Auth;
  /** The user's membership, role and permissions in the organization, or null when they are not an active member. */
  resolveAccess(userId: string, organizationId: string): Promise<MemberAccess | null>;
  /** What me.get returns. */
  describeSignedInPerson(session: SignedInSession): Promise<MeOutput | null>;
  /** True for platform staff: user role "admin" and no membership. */
  isPlatformAdmin(user: { id: string; role?: string | null | undefined }): Promise<boolean>;
  /** The actor's organization's staff. The API checks staff:manage first. */
  readonly staff: {
    list(actor: MemberAccess): Promise<StaffMember[]>;
    create(actor: MemberAccess, input: CreateStaffInput): Promise<StaffMember>;
    updateRole(actor: MemberAccess, input: UpdateStaffRoleInput): Promise<StaffMember>;
    resetPassword(actor: MemberAccess, input: ResetStaffPasswordInput): Promise<void>;
    remove(actor: MemberAccess, input: RemoveStaffInput): Promise<void>;
  };
  /** The actor's organization's roles. Changing them needs roles:manage, which the API checks. */
  readonly roles: {
    list(actor: MemberAccess): Promise<RoleSummary[]>;
    create(actor: MemberAccess, input: CreateRoleInput): Promise<RoleSummary>;
    update(actor: MemberAccess, input: UpdateRoleInput): Promise<RoleSummary>;
    delete(actor: MemberAccess, input: DeleteRoleInput): Promise<void>;
  };
  /** Organization settings owned by identity. Changing them needs settings:manage, which the API checks. */
  readonly settings: {
    setTwoFactorRequirement(actor: MemberAccess, input: SetTwoFactorRequirementInput): Promise<SecuritySettings>;
  };
  /** Creates the five starter roles. Onboarding calls it once per new organization. */
  seedStarterRoles(organizationId: string): Promise<void>;
  /** Adds an organization's first Owner. Onboarding only: it checks no permissions. */
  createOrganizationOwner(organizationId: string, owner: NewOwner): Promise<CreatedStaff>;
  /** Closes the connection pool. */
  disconnect(): Promise<void>;
}

export function createIdentity(options: IdentityOptions): Identity {
  const database = createIdentityDatabase(options.databaseUrl, { maxConnections: options.maxConnections ?? 10 });
  const auth = createAuth(database.client, options.auth);
  const hashPassword: PasswordHasher = async (password) => (await auth.$context).password.hash(password);

  return {
    auth,
    resolveAccess: (userId, organizationId) => resolveAccess(database, userId, organizationId),
    describeSignedInPerson: (session) => describeSignedInPerson(database, session),
    isPlatformAdmin: (user) => isPlatformAdmin(database, user),
    staff: {
      list: (actor) => listStaff(database, actor),
      create: (actor, input) => createStaff(database, hashPassword, actor, input),
      updateRole: (actor, input) => updateStaffRole(database, actor, input),
      resetPassword: (actor, input) => resetStaffPassword(database, hashPassword, actor, input),
      remove: (actor, input) => removeStaff(database, actor, input),
    },
    roles: {
      list: (actor) => listRoles(database, actor),
      create: (actor, input) => createRole(database, actor, input),
      update: (actor, input) => updateRole(database, actor, input),
      delete: (actor, input) => deleteRole(database, actor, input),
    },
    settings: {
      setTwoFactorRequirement: (actor, input) => setTwoFactorRequirement(database, actor, input),
    },
    seedStarterRoles: (organizationId) => seedStarterRoles(database, organizationId),
    createOrganizationOwner: (organizationId, owner) =>
      createStaffAccount(database, hashPassword, { ...owner, organizationId, roleKey: OWNER_ROLE_KEY }),
    disconnect: () => database.disconnect(),
  };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/domain typecheck && pnpm --filter @travel-crm/domain test`

Expected: 62 tests pass. These pin Review Focus 1, 2 and 4:
- "an Admin … cannot change, reset or remove the Owner";
- "removes a person: no access, no sign-in, and their email and username are free again";
- "cannot be switched on by someone who doesn't use two-factor themselves".

- [ ] **Step 5: Record the decision and document the module**

`docs/adr/0007-removing-staff.md`:
```markdown
# 0007: Removing staff

Date: 2026-10-14 · Status: accepted · Implements spec section 6.3, "Removing someone"

## Decision

Removing a member is one transaction:

1. The membership is soft-deleted (`member.deleted_at`, `deleted_by`).
2. The user row is retired: `former_email` keeps their email, `email` becomes `removed-<user id>@no-email.invalid`,
   `username` is cleared, and `banned` is set.
3. All their sessions are deleted.

A person who joins again, here or in another organization, gets a new user row.

## Context

- **The email must be released**, because email is unique across the product and Better Auth needs a non-null one.
  Moving it to `former_email` frees it and keeps it for support and audit lookups.
- **The username must be released** so the organization can give it to someone else.
- **The user row is never reused**, because `member.user_id` is unique (one user, one organization, spec section 4):
  the old membership row still points at it. Keeping the row keeps every "created by" reference valid.
- **Banning is belt and braces.** With email and username gone, the old password can't be used to sign in anyway.
  Better Auth's admin plugin also refuses any new session for a banned user, impersonation included.
- **It takes effect at once.** Sessions are deleted; `orgProcedure` reads the membership on every request, so the next
  request is refused even while the 5-minute session cookie is still cached.
- Rejected alternatives: deleting the user (breaks history and cascades), and Better Auth's `removeMember` and
  `banUser` endpoints (they need an admin session and are not one transaction with our changes).

## Consequences

- A DPDP erasure request must also clear `former_email` (the platform purge, spec section 5).
- Who removed whom is in `member.deleted_by`; the audit log (spec 9.5) will record it too.
```

Replace `docs/adr/README.md`:
```markdown
# Architecture decision records

Each record states a decision, the context, and the consequences, so it can be revisited knowingly.
The first and largest set of decisions is the Foundation spec: `docs/superpowers/specs/2026-10-13-foundation-design.md`.

| #                                      | Decision                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| [0001](0001-toolchain.md)              | Toolchain versions: Node 24, pnpm 12, TypeScript 6.0.3, Prisma 7.10                     |
| [0002](0002-row-level-security.md)     | How organization isolation is implemented in Postgres                                   |
| [0003](0003-repository-conventions.md) | Repository conventions: Prettier, husky, lint-staged, commitlint, Renovate              |
| [0004](0004-soft-delete.md)            | Soft delete: hidden rows, refused hard deletes, partial unique indexes                  |
| [0005](0005-roles-and-permissions.md)  | Roles and permissions: our own tables, the catalog, starter roles, no escalation        |
| [0006](0006-identity-and-sessions.md)  | Identity and sessions: Better Auth, organization-code sign-in, cookie cache, two-factor |
| [0007](0007-removing-staff.md)         | Removing staff: soft-deleted membership, released email, sessions ended                 |
```

`packages/domain/README.md`:
```markdown
# @travel-crm/domain

Business rules, one folder per module (spec section 8). A module's public API is its `index.ts`, imported as
`@travel-crm/domain/<module>`. Inside a module, import its own files freely; across modules, only the other module's
`index.ts`. dependency-cruiser enforces both.

| Module     | What it holds                                                                         |
| ---------- | ------------------------------------------------------------------------------------- |
| `kernel`   | building blocks every module uses: `DomainError`                                      |
| `identity` | Better Auth, members, roles and permissions, staff ([README](src/identity/README.md)) |

Business rule failures throw `DomainError(code, reason, message)`; the API turns the code into an HTTP status and passes
the reason to the web app.
```

`packages/domain/src/identity/README.md`:
```markdown
# identity

Who can sign in, to which organization, and what they may do (spec section 6).

## Public functions and values (`index.ts`)

- `createIdentity(options)` builds the module once per process. The `Identity` it returns has:
  - `auth`: Better Auth (serve `auth.handler`, read sessions with `auth.api.getSession`);
  - `resolveAccess(userId, organizationId)`: the member's role, permissions and pending steps, or null;
  - `describeSignedInPerson(session)`: what `me.get` returns;
  - `isPlatformAdmin(user)`;
  - `staff.list / create / updateRole / resetPassword / remove`;
  - `roles.list / create / update / delete`;
  - `settings.setTwoFactorRequirement`;
  - `seedStarterRoles(organizationId)` and `createOrganizationOwner(organizationId, owner)`, for onboarding;
  - `disconnect()`.
- `permissions`, `permissionCatalog`, `isPermission`, `moduleOf`, `PermissionSet`: the permission catalog.
- `starterRoles`, `OWNER_ROLE_KEY`: the five roles every organization starts with (ADR 0005).
- `scopeFilter(access, permission, ownerField)`, `assertRecordInScope(...)`: request check 5, own or all records.
- `pendingStep(access)`: a password change or two-factor setup still to do.
- `internalUsername`, `placeholderEmail`, `isPlaceholderEmail`, `shownEmail`: how sign-in names are stored.

## Events

None yet.

## Rules worth knowing

- The member table has no row-level security: every query of it filters by `organizationId` itself.
- Nobody grants more than they hold, changes their own access, or touches an Owner unless they are one (`access-rules.ts`).
- Removing someone soft-deletes their membership and releases their email and username (ADR 0007).
```

- [ ] **Step 6: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`. Expected: green.

```bash
cd /Users/ak/personal/travel-crm
git add packages/domain docs/adr
git commit -m "feat(domain): manage staff with or without email, and the two-factor requirement"
```

---

### Task 9: The api server, with Better Auth over HTTP

`apps/api` becomes a Hono app:
- a health check;
- Better Auth at `/api/auth/*`;
- the organization-code sign-in route;
- Better Auth's organization endpoints closed.

Its settings come from environment variables checked with Zod at start-up. A Node entry point runs it locally. Tests drive the app through `app.request()`, with a cookie jar standing in for the browser. tRPC arrives in Task 10.

**Files:**
- Create: `apps/api/package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`
- Create: `apps/api/src/environment.ts`, `apps/api/src/org-sign-in.ts`, `apps/api/src/app.ts`, `apps/api/src/server.ts`
- Create: `apps/api/test/support/cookie-jar.ts`, `apps/api/test/support/test-server.ts`
- Create: `apps/api/test/environment.test.ts`, `apps/api/test/sign-in.test.ts`, `apps/api/test/rate-limit.test.ts`
- Modify: `package.json` (import rules also cover `apps/`), `.env.example`

**Interfaces:**
- Consumes:
  - From Task 8: `createIdentity`, `Identity`, `AuthSettings`, `Auth`, `internalUsername`, `MemberAccess` and `identity.staff.create`.
  - From Task 4: `orgSignInInput`.
  - From Task 3: `@travel-crm/db/testing` and `@travel-crm/db/platform` in tests.
- Produces:
  - `loadEnvironment(source: Record<string, string | undefined>): Environment`, `type Environment`, `class EnvironmentError`, and `authSettingsFrom(environment: Environment): AuthSettings`.
  - Variables:
    - required: `DATABASE_URL`, `BETTER_AUTH_SECRET` (at least 32 characters), `BETTER_AUTH_URL`;
    - optional: `TRUSTED_ORIGINS`, `AUTH_RATE_LIMIT` (default `true`), `AUTH_IP_ADDRESS_HEADERS` (default `x-forwarded-for`), `DATABASE_POOL_SIZE` (10), `PORT` (3001), `NODE_ENV` (`development`).
  - `organizationSignIn(auth: Auth, request: Request): Promise<Response>`.
  - `interface ServerDependencies { identity: Identity }` and `createApp(dependencies: ServerDependencies): Hono`.
  - Test support:
    - `class CookieJar { absorb(response): Response; get header(): string; names(): string[] }`;
    - `ORIGIN` (`"http://localhost"`), `testAuthSettings: AuthSettings`;
    - `interface TestServer { app: Hono; identity: Identity; platform: PlatformClient; close(): Promise<void> }` and `createTestServer(settings?: Partial<AuthSettings>): TestServer`;
    - `interface TestAgency { organizationId; code; owner: { userId; memberId; email; password } }` and `createTestAgency(server): Promise<TestAgency>`;
    - `postJson(server, path, body, jar?, headers?): Promise<Response>`;
    - `signInByEmail(server, jar, email, password)` and `signInWithCode(server, jar, { orgCode, username, password })`.

- [ ] **Step 1: Create the package**

`apps/api/package.json`:
```json
{
  "name": "@travel-crm/api-server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --env-file-if-exists=../../.env src/server.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@hono/node-server": "2.1.5",
    "@travel-crm/contracts": "workspace:*",
    "@travel-crm/domain": "workspace:*",
    "hono": "4.13.13",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@travel-crm/db": "workspace:*",
    "@travel-crm/eslint-config": "workspace:*",
    "@travel-crm/tsconfig": "workspace:*",
    "@types/node": "catalog:",
    "eslint": "catalog:",
    "tsx": "4.23.15",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`apps/api/tsconfig.json`:
```json
{
  "extends": "@travel-crm/tsconfig/base.json",
  "include": ["src", "test", "vitest.config.ts"]
}
```

`apps/api/eslint.config.js`:
```js
// ESLint for @travel-crm/api-server: the shared strict config.
import { base } from "@travel-crm/eslint-config";

export default base({ tsconfigRootDir: import.meta.dirname });
```

`apps/api/vitest.config.ts`:
```ts
// End-to-end tests through the HTTP app (app.request), against the throwaway Postgres that @travel-crm/db's test
// setup starts.
import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);

export default defineConfig({
  test: {
    name: "api-server",
    include: ["test/**/*.test.ts"],
    // Provides inject("dbUrls") to the tests.
    globalSetup: [require.resolve("@travel-crm/db/testing/global-setup")],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install`

If pnpm refuses `@hono/node-server@2.1.5` as too new, add `"@hono/node-server@2.1.5"` to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` and install again (see Global Constraints).

- [ ] **Step 2: Write the test support and the failing tests**

`apps/api/test/support/cookie-jar.ts`:
```ts
// A small browser-like cookie store for app.request() tests. The last Set-Cookie for a name wins, and an empty value
// or Max-Age=0 deletes it: Better Auth sends deleting cookies before new ones, so joining headers naively breaks.
export class CookieJar {
  private readonly cookies = new Map<string, string>();

  /** Stores the response's cookies and returns the response, so calls can be wrapped: jar.absorb(await post(...)). */
  absorb(response: Response): Response {
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair = ""] = setCookie.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value === "" || /max-age=0/i.test(setCookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }

  /** The Cookie header a browser would send. */
  get header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  names(): string[] {
    return [...this.cookies.keys()];
  }
}
```

`apps/api/test/support/test-server.ts`:
```ts
// Builds the api on the test database: the Hono app, its identity module, and a platform client for creating
// organizations (which the api itself can never do). Requests go through app.request(), so no port is opened.
import type { PlatformClient } from "@travel-crm/db/platform";
import { createPlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { createIdentity, type AuthSettings, type Identity } from "@travel-crm/domain/identity";
import type { Hono } from "hono";
import { inject } from "vitest";
import { createApp } from "../../src/app.js";
import type { CookieJar } from "./cookie-jar.js";

/** app.request() runs on http://localhost, so that is the api's address and the browser's origin. */
export const ORIGIN = "http://localhost";

export const testAuthSettings: AuthSettings = {
  appName: "Test CRM",
  secret: "test-secret-".padEnd(48, "x"),
  baseUrl: ORIGIN,
  trustedOrigins: [],
  secureCookies: false,
  // Tests sign in many times from one address; rate-limit.test.ts turns it on.
  rateLimit: false,
  ipAddressHeaders: ["x-forwarded-for"],
};

export interface TestServer {
  app: Hono;
  identity: Identity;
  platform: PlatformClient;
  close(): Promise<void>;
}

export function createTestServer(settings: Partial<AuthSettings> = {}): TestServer {
  const urls = inject("dbUrls");
  const identity = createIdentity({
    databaseUrl: urls.runtime,
    maxConnections: 3,
    auth: { ...testAuthSettings, ...settings },
  });
  const platform = createPlatformClient(urls.platform);
  return {
    app: createApp({ identity }),
    identity,
    platform,
    close: async () => {
      await identity.disconnect();
      await platform.$disconnect();
    },
  };
}

export interface TestAgency {
  organizationId: string;
  code: string;
  owner: { userId: string; memberId: string; email: string; password: string };
}

/** An organization with its starter roles and an Owner who signs in by email, as onboarding (plan 4) will make. */
export async function createTestAgency(server: TestServer): Promise<TestAgency> {
  const organizationId = await createTestOrganization(server.platform, "Test agency");
  const { code } = await server.platform.organization.findUniqueOrThrow({ where: { id: organizationId } });
  await server.identity.seedStarterRoles(organizationId);
  const email = `owner-${code.toLowerCase()}@example.test`;
  const password = "owner-password-1";
  const created = await server.identity.createOrganizationOwner(organizationId, {
    name: "Asha Owner",
    email,
    password,
    mustChangePassword: false,
  });
  return { organizationId, code, owner: { ...created, email, password } };
}

/** A JSON POST as the web app sends it: same origin, with the jar's cookies. */
export async function postJson(
  server: TestServer,
  path: string,
  body: unknown,
  jar?: CookieJar,
  headers: Record<string, string> = {},
): Promise<Response> {
  return server.app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...(jar ? { cookie: jar.header } : {}), ...headers },
    body: JSON.stringify(body),
  });
}

export async function signInByEmail(
  server: TestServer,
  jar: CookieJar,
  email: string,
  password: string,
): Promise<Response> {
  return jar.absorb(await postJson(server, "/api/auth/sign-in/email", { email, password }, jar));
}

export async function signInWithCode(
  server: TestServer,
  jar: CookieJar,
  credentials: { orgCode: string; username: string; password: string },
): Promise<Response> {
  return jar.absorb(await postJson(server, "/api/auth/sign-in/org", credentials, jar));
}
```

`apps/api/test/environment.test.ts`:
```ts
// The api refuses to start with settings that are missing, malformed or unsafe in production, and says which.
import { describe, expect, it } from "vitest";
import { authSettingsFrom, EnvironmentError, loadEnvironment } from "../src/environment.js";

const valid = {
  DATABASE_URL: "postgresql://app_runtime:runtime@localhost:55432/travel_crm",
  BETTER_AUTH_SECRET: "a-long-enough-development-secret-123",
  BETTER_AUTH_URL: "http://localhost:3001",
};

describe("environment", () => {
  it("fills in development defaults", () => {
    const environment = loadEnvironment(valid);
    expect(environment).toMatchObject({ NODE_ENV: "development", PORT: 3001, AUTH_RATE_LIMIT: true });
    expect(authSettingsFrom(environment)).toMatchObject({
      secureCookies: false,
      trustedOrigins: [],
      rateLimit: true,
      ipAddressHeaders: ["x-forwarded-for"],
    });
  });

  it("names every missing or malformed variable, without printing values", () => {
    const attempt = () =>
      loadEnvironment({ DATABASE_URL: "mysql://x", BETTER_AUTH_SECRET: "short-secret", PORT: "eighty" });
    expect(attempt).toThrow(EnvironmentError);
    expect(attempt).toThrow(/DATABASE_URL[\s\S]*BETTER_AUTH_SECRET[\s\S]*BETTER_AUTH_URL/);
    expect(attempt).toThrow(/PORT/);
    expect(attempt).not.toThrow(/short-secret/);
  });

  it("reads trusted origins as a comma-separated list of origins", () => {
    const settings = authSettingsFrom(
      loadEnvironment({ ...valid, TRUSTED_ORIGINS: " http://localhost:3000/ , https://staging.example.in" }),
    );
    expect(settings.trustedOrigins).toEqual(["http://localhost:3000", "https://staging.example.in"]);
    expect(() => loadEnvironment({ ...valid, TRUSTED_ORIGINS: "localhost:3000" })).toThrow(/TRUSTED_ORIGINS/);
  });

  it("insists on HTTPS, secure cookies and rate limiting in production", () => {
    const production = { ...valid, NODE_ENV: "production" };
    expect(() => loadEnvironment(production)).toThrow(/BETTER_AUTH_URL: must be https in production/);
    const https = { ...production, BETTER_AUTH_URL: "https://app.example.in" };
    expect(authSettingsFrom(loadEnvironment(https)).secureCookies).toBe(true);
    expect(() => loadEnvironment({ ...https, AUTH_RATE_LIMIT: "false" })).toThrow(/AUTH_RATE_LIMIT/);
  });
});
```

`apps/api/test/sign-in.test.ts`:
```ts
// Signing in through the HTTP app (spec 6.3): by email or by organization code and username, with no self sign-up,
// session cookies a browser keeps, and Better Auth's organization endpoints closed to clients.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CookieJar } from "./support/cookie-jar.js";
import {
  createTestAgency,
  createTestServer,
  postJson,
  signInByEmail,
  signInWithCode,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";

describe("sign-in", () => {
  let server: TestServer;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    const ownerAccess = await server.identity.resolveAccess(agency.owner.userId, agency.organizationId);
    if (!ownerAccess) throw new Error("owner has no access");
    await server.identity.staff.create(ownerAccess, {
      name: "Ravi",
      username: "Ravi",
      roleKey: "sales",
      temporaryPassword: "ravi-password-1",
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it("answers the health check", async () => {
    const response = await server.app.request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("has no self sign-up", async () => {
    const response = await postJson(server, "/api/auth/sign-up/email", {
      email: "stranger@example.test",
      password: "stranger-password-1",
      name: "Stranger",
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await server.platform.user.count({ where: { email: "stranger@example.test" } })).toBe(0);
  });

  it("signs in by email, in any letter case, into an HTTP-only session cookie and a 5-minute cache cookie", async () => {
    const jar = new CookieJar();
    const response = await signInByEmail(server, jar, agency.owner.email.toUpperCase(), agency.owner.password);
    expect(response.status).toBe(200);
    expect(jar.names()).toEqual(["better-auth.session_token", "better-auth.session_data"]);
    const [sessionCookie] = response.headers.getSetCookie();
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
  });

  it("signs in with organization code and username, both in any letter case", async () => {
    const jar = new CookieJar();
    const response = await signInWithCode(server, jar, {
      orgCode: agency.code.toLowerCase(),
      username: "RAVI",
      password: "ravi-password-1",
    });
    expect(response.status).toBe(200);
    expect(jar.names()).toContain("better-auth.session_token");
  });

  it("refuses a wrong password, a wrong organization code, or someone else's organization", async () => {
    const other = await createTestAgency(server);
    const attempts = [
      { orgCode: agency.code, username: "ravi", password: "wrong-password-1" },
      { orgCode: "NOSUCHORG", username: "ravi", password: "ravi-password-1" },
      { orgCode: other.code, username: "ravi", password: "ravi-password-1" },
    ];
    for (const attempt of attempts) {
      expect((await postJson(server, "/api/auth/sign-in/org", attempt)).status).toBe(401);
    }
  });

  it("answers a malformed organization sign-in with 400", async () => {
    for (const body of [{}, { orgCode: "S!", username: "ravi", password: "x" }, "not json"]) {
      expect((await postJson(server, "/api/auth/sign-in/org", body)).status).toBe(400);
    }
  });

  it("refuses a sign-in posted from another website", async () => {
    const response = await postJson(
      server,
      "/api/auth/sign-in/email",
      { email: agency.owner.email, password: agency.owner.password },
      undefined,
      { origin: "https://evil.example" },
    );
    expect(response.status).toBe(403);
  });

  it("closes Better Auth's organization endpoints to clients", async () => {
    const jar = new CookieJar();
    await signInByEmail(server, jar, agency.owner.email, agency.owner.password);
    const update = await postJson(
      server,
      "/api/auth/organization/update-member-role",
      { memberId: "x", role: "x" },
      jar,
    );
    expect(update.status).toBe(404);
    const list = await server.app.request("/api/auth/organization/list", { headers: { cookie: jar.header } });
    expect(list.status).toBe(404);
  });

  it("signs out by clearing both cookies", async () => {
    const jar = new CookieJar();
    await signInByEmail(server, jar, agency.owner.email, agency.owner.password);
    jar.absorb(await postJson(server, "/api/auth/sign-out", {}, jar));
    expect(jar.names()).toEqual([]);
  });

  it("uses __Secure- cookies when secure cookies are on", async () => {
    const secure = createTestServer({ secureCookies: true });
    try {
      const response = await postJson(secure, "/api/auth/sign-in/email", {
        email: agency.owner.email,
        password: agency.owner.password,
      });
      const cookies = response.headers.getSetCookie();
      expect(cookies.map((cookie) => cookie.split("=")[0])).toEqual([
        "__Secure-better-auth.session_token",
        "__Secure-better-auth.session_data",
      ]);
      expect(cookies.every((cookie) => /;\s*Secure/i.test(cookie))).toBe(true);
    } finally {
      await secure.close();
    }
  });
});
```

`apps/api/test/rate-limit.test.ts`:
```ts
// Sign-in attempts are rate limited per client address (spec 6.2): Better Auth allows 3 per 10 seconds per path.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestAgency,
  createTestServer,
  postJson,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";

describe("sign-in rate limiting", () => {
  let server: TestServer;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer({ rateLimit: true });
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await server.close();
  });

  it("refuses the fourth attempt in 10 seconds from one address, and only from that address", async () => {
    const attempt = (address: string) =>
      postJson(
        server,
        "/api/auth/sign-in/org",
        { orgCode: agency.code, username: "nobody", password: "wrong-password-1" },
        undefined,
        { "x-forwarded-for": address },
      );
    const statuses: number[] = [];
    for (let count = 0; count < 5; count++) statuses.push((await attempt("203.0.113.9")).status);
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
    expect((await attempt("198.51.100.7")).status).toBe(401);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server test`

Expected: FAIL. Vitest cannot resolve `../src/environment.js` or `../../src/app.js`.

- [ ] **Step 4: Write the environment, the organization-code route, the app and the server**

`apps/api/src/environment.ts`:
```ts
// The api's settings, read from environment variables once at start-up and checked, so a bad deploy fails loudly.
import type { AuthSettings } from "@travel-crm/domain/identity";
import { z } from "zod";

/** A comma-separated list, e.g. "https://a.example,https://b.example". Empty items are dropped. */
const commaSeparated = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== ""),
  );

// DATABASE_MIGRATOR_URL and DATABASE_PLATFORM_URL are left out on purpose: the api never runs migrations, and it never
// connects as the role that sees every organization.
const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    /** Postgres, connecting as the app_runtime role. */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, message: "must be a postgresql:// URL" }),
    DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
    /** Signs and encrypts cookies and two-factor secrets. Generate with `openssl rand -base64 32`. */
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    /** Where browsers reach the api, e.g. https://app.example.in. */
    BETTER_AUTH_URL: z.url({ protocol: /^https?$/, message: "must be an http(s) URL" }),
    /** Other origins allowed to call the api with cookies, comma-separated, e.g. the web app in development. */
    TRUSTED_ORIGINS: commaSeparated.pipe(z.array(z.url({ protocol: /^https?$/, message: "must be http(s) origins" }))),
    /** Sign-in rate limiting. Only tests turn it off. */
    AUTH_RATE_LIMIT: z.stringbool().default(true),
    /** Headers the load balancer puts the client's IP address in, comma-separated. */
    AUTH_IP_ADDRESS_HEADERS: commaSeparated.pipe(z.array(z.string()).min(1)).default(["x-forwarded-for"]),
  })
  .refine(
    (environment) => environment.NODE_ENV !== "production" || environment.BETTER_AUTH_URL.startsWith("https://"),
    {
      path: ["BETTER_AUTH_URL"],
      message: "must be https in production",
    },
  )
  .refine((environment) => environment.NODE_ENV !== "production" || environment.AUTH_RATE_LIMIT, {
    path: ["AUTH_RATE_LIMIT"],
    message: "cannot be off in production",
  });

export type Environment = z.infer<typeof environmentSchema>;

/** Lists every problem by variable name. Values are never included: some are secrets. */
export class EnvironmentError extends Error {
  constructor(problems: string[]) {
    super(`The api's environment is not valid:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    this.name = "EnvironmentError";
  }
}

export function loadEnvironment(source: Record<string, string | undefined>): Environment {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    throw new EnvironmentError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
  }
  return result.data;
}

export function authSettingsFrom(environment: Environment): AuthSettings {
  return {
    // The product's name moves to the brand package (spec section 10) when that package exists.
    appName: "Travel CRM",
    secret: environment.BETTER_AUTH_SECRET,
    baseUrl: environment.BETTER_AUTH_URL,
    trustedOrigins: environment.TRUSTED_ORIGINS.map((origin) => new URL(origin).origin),
    secureCookies: environment.NODE_ENV === "production" || environment.BETTER_AUTH_URL.startsWith("https://"),
    rateLimit: environment.AUTH_RATE_LIMIT,
    ipAddressHeaders: environment.AUTH_IP_ADDRESS_HEADERS.map((header) => header.toLowerCase()),
  };
}
```

`apps/api/src/org-sign-in.ts`:
```ts
// POST /api/auth/sign-in/org: sign in with organization code, username and password (spec 6.3).
// It builds the internal username and hands the request to Better Auth's username sign-in, so rate limiting, cookies,
// two-factor and hooks work exactly as for any other sign-in.
import { orgSignInInput } from "@travel-crm/contracts/identity";
import { internalUsername, type Auth } from "@travel-crm/domain/identity";

export async function organizationSignIn(auth: Auth, request: Request): Promise<Response> {
  const parsed = orgSignInInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { code: "VALIDATION", message: "Give your organization code, username and password" },
      { status: 400 },
    );
  }
  const { orgCode, username, password } = parsed.data;
  // Keep every header (origin check, cookies, the client's address for rate limits); the body is new.
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  return auth.handler(
    new Request(new URL("/api/auth/sign-in/username", request.url), {
      method: "POST",
      headers,
      body: JSON.stringify({ username: internalUsername(orgCode, username), password }),
    }),
  );
}
```

`apps/api/src/app.ts` (Task 10 adds tRPC):
```ts
// The api's HTTP app: a health check and Better Auth's sign-in endpoints under /api/auth.
import type { Identity } from "@travel-crm/domain/identity";
import { Hono } from "hono";
import { organizationSignIn } from "./org-sign-in.js";

export interface ServerDependencies {
  identity: Identity;
}

export function createApp({ identity }: ServerDependencies): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  // Members and roles are managed through our own API. Better Auth's organization endpoints would bypass its rules.
  app.all("/api/auth/organization/*", (c) => c.json({ code: "NOT_FOUND", message: "Not found" }, 404));
  app.post("/api/auth/sign-in/org", (c) => organizationSignIn(identity.auth, c.req.raw));
  app.on(["GET", "POST"], "/api/auth/*", (c) => identity.auth.handler(c.req.raw));

  return app;
}
```

`apps/api/src/server.ts`:
```ts
// Starts the api on Node (`pnpm --filter @travel-crm/api-server dev`). All settings come from the environment.
import { serve } from "@hono/node-server";
import { createIdentity } from "@travel-crm/domain/identity";
import { createApp } from "./app.js";
import { authSettingsFrom, loadEnvironment } from "./environment.js";

const environment = loadEnvironment(process.env);
const identity = createIdentity({
  databaseUrl: environment.DATABASE_URL,
  maxConnections: environment.DATABASE_POOL_SIZE,
  auth: authSettingsFrom(environment),
});

const server = serve({ fetch: createApp({ identity }).fetch, port: environment.PORT }, (address) => {
  console.log(`api listening on port ${String(address.port)}`);
});

// Container platforms send SIGTERM before stopping an instance: finish open requests, then close the pool.
function shutDown(): void {
  server.close(() => {
    void identity.disconnect().finally(() => process.exit(0));
  });
}
process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server typecheck && pnpm --filter @travel-crm/api-server test`

Expected: 15 tests pass. These pin Review Focus 5:
- "has no self sign-up";
- "refuses a sign-in posted from another website": Better Auth logs `Invalid origin: https://evil.example`, which is expected;
- "closes Better Auth's organization endpoints to clients".

If "refuses a sign-in posted from another website" gets 200, `disableOriginCheck: false` is missing from `createAuth` (Task 6).

- [ ] **Step 6: Cover `apps/` in the import rules**

In the root `package.json`, make the import rules cover `apps/` too.

Find:
```json
    "depcruise": "depcruise packages --config .dependency-cruiser.cjs",
```

Replace it with:
```json
    "depcruise": "depcruise apps packages --config .dependency-cruiser.cjs",
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run depcruise`. Expected: no dependency violations.

- [ ] **Step 7: Run the api locally**

Replace `.env.example`:
```ini
# Local Postgres from docker-compose.yml. Dev-only passwords, set in packages/db/sql/bootstrap.sql.
DATABASE_MIGRATOR_URL=postgresql://app_migrator:migrator@localhost:55432/travel_crm
DATABASE_URL=postgresql://app_runtime:runtime@localhost:55432/travel_crm
DATABASE_PLATFORM_URL=postgresql://app_platform:platform@localhost:55432/travel_crm

# The api (apps/api). Dev-only secret: generate a real one with `openssl rand -base64 32`.
BETTER_AUTH_SECRET=dev-only-secret-not-for-any-real-deploy
BETTER_AUTH_URL=http://localhost:3001
# The web app's address in development (plan 5), allowed to call the api with cookies.
TRUSTED_ORIGINS=http://localhost:3000
PORT=3001
```

Add the new variables to your local `.env`. It is git-ignored; never commit it:
```bash
cd /Users/ak/personal/travel-crm
grep -q BETTER_AUTH_SECRET .env || sed -n '/^# The api/,$p' .env.example >> .env
```

Start the api with `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm db:migrate && pnpm --filter @travel-crm/api-server dev`, as a background process or in a second terminal. Then:
```bash
curl -s http://localhost:3001/health
curl -s -X POST http://localhost:3001/api/auth/sign-in/org -H 'content-type: application/json' -H 'origin: http://localhost:3000' -d '{"orgCode":"NOPE1","username":"x1","password":"y"}' -w ' %{http_code}\n'
```
Expected:
- the server prints `api listening on port 3001`;
- `{"status":"ok"}`;
- `{"message":"Invalid username or password","code":"INVALID_USERNAME_OR_PASSWORD"} 401`. Better Auth also warns that it can't find a client IP for rate limiting, which is expected locally.

Stop the server with Ctrl-C, or `pkill -f "tsx watch --env-file-if-exists"`. Nothing may still be listening on port 3001 afterwards.

- [ ] **Step 8: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`. Expected: green.

```bash
cd /Users/ak/personal/travel-crm
git add apps/api package.json .env.example pnpm-lock.yaml pnpm-workspace.yaml
git status --short
git commit -m "feat(api-server): serve Better Auth with organization-code sign-in, behind a checked environment"
```
`git status --short` must not list `.env`.

---

### Task 10: tRPC and the request checks

`packages/api` gets tRPC: the context, the error mapping and the procedure builders. The builders run the spec 6.5 checks in order:
- 1, signed in;
- 4, role permission, read from `role_permission` inside `forOrg`;
- the membership itself is re-read on every request;
- sensitive procedures re-read the session too.

Checks 2 and 3 (organization active, module on the plan) belong to plan 4. They go inside `memberAccessFor()` and `requires()` in `procedures.ts`, so no procedure changes when they arrive. Check 5 is the handler's job, through `scopeFilter()`; check 6 is row-level security.

The first routers are `me`, `settings` and `platform`, mounted at `/api/trpc`.

**Files:**
- Create: `packages/api/package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`
- Create: `packages/api/src/context.ts`, `errors.ts`, `trpc.ts`, `procedures.ts`, `index.ts`
- Create: `packages/api/src/routers/me.ts`, `settings.ts`, `platform.ts`, `app-router.ts`
- Create: `packages/api/test/errors.test.ts`
- Modify: `pnpm-workspace.yaml` (`allowBuilds`), `apps/api/package.json`, `apps/api/src/app.ts`
- Create: `apps/api/test/support/trpc.ts`, `people.ts`, `two-factor.ts`
- Create: `apps/api/test/request-checks.test.ts`, `two-factor.test.ts`, `platform.test.ts`, `apps/api/README.md`

**Interfaces:**
- Consumes:
  - From Task 9: `createApp`, `CookieJar` and the `test-server.ts` helpers.
  - From Task 8: `Identity` with `resolveAccess`, `describeSignedInPerson`, `isPlatformAdmin`, `staff.create` and `settings.setTwoFactorRequirement`.
  - From Task 5: `pendingStep`, `MemberAccess`, `Permission` and `DomainError`.
  - From Task 4: `meOutput`, `securitySettings` and `setTwoFactorRequirementInput`.
- Produces:
  - `interface ApiDependencies { identity: Identity }`, `createContext(dependencies, request: Request)` (gives `{ identity, headers, session | null, user | null }`) and `type Context`.
  - `toTrpcError(error: DomainError): TRPCError`, `interface ErrorDetails { domainCode: DomainErrorCode | null; reason: string | null }`, `errorDetails(error: TRPCError)` and `publicMessage(error: TRPCError)`. Every error response carries `error.data.domainCode` and `error.data.reason`. Internal errors say only "Something went wrong".
  - `t` and `router` in `trpc.ts`.
  - The builders:
    - `publicProcedure`;
    - `protectedProcedure`, which gives a non-null `ctx.session` and `ctx.user`;
    - `orgProcedure`, which adds `ctx.member: MemberAccess` and has `.requires(...permissions: [Permission, ...Permission[]])`;
    - `freshProcedure`, the same with the session read from the database;
    - `platformProcedure`.
  - FORBIDDEN reasons from the builders: `NOT_A_MEMBER`, `CHANGE_PASSWORD`, `SET_UP_TWO_FACTOR`, `MISSING_PERMISSION` and `PLATFORM_ONLY`. A missing or revoked session is plain 401.
  - Procedures:
    - `me.get`: `protectedProcedure`, output `meOutput`;
    - `settings.get`: `orgProcedure`;
    - `settings.setTwoFactorRequirement`: `freshProcedure.requires("settings:manage")`;
    - `platform.whoAmI`: `platformProcedure`, output `{ userId, name }`.
  - `appRouter` and `type AppRouter`, from `@travel-crm/api`.
  - Test support:
    - `query(server, path, jar?, input?)` and `mutate(server, path, input, jar?)`;
    - `dataOf<T>(response): Promise<T>` and `refusalOf(response): Promise<{ status; reason }>`;
    - `ownerAccess(server, agency)`;
    - `interface TestStaff { userId; memberId; username; password }`, `addStaff(server, agency, { username, roleKey, mustChangePassword? })`, `signedInStaff(server, agency, staff): Promise<CookieJar>` and `signedInOwner(server, agency)`;
    - `createPlatformAdmin(server)`;
    - `interface TwoFactorSetup { totpUri; secret }`, `enableTwoFactor(server, jar, password)` and `codeFor(server, secret)`.

- [ ] **Step 1: Create the package**

In `pnpm-workspace.yaml`, record in `allowBuilds` that `@trpc/server`'s install script is not needed.

Find:
```yaml
  ssh2: false
```

Replace it with:
```yaml
  ssh2: false
  # Its install script only offers "agent skills"; nothing is needed.
  "@trpc/server": false
```

`packages/api/package.json`:
```json
{
  "name": "@travel-crm/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@travel-crm/contracts": "workspace:*",
    "@travel-crm/domain": "workspace:*",
    "@trpc/server": "11.19.0",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@travel-crm/eslint-config": "workspace:*",
    "@travel-crm/tsconfig": "workspace:*",
    "@types/node": "catalog:",
    "eslint": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

`packages/api/tsconfig.json`:
```json
{
  "extends": "@travel-crm/tsconfig/base.json",
  "include": ["src", "test", "vitest.config.ts"]
}
```

`packages/api/eslint.config.js`:
```js
// ESLint for @travel-crm/api: the shared strict config.
import { base } from "@travel-crm/eslint-config";

export default base({ tsconfigRootDir: import.meta.dirname });
```

`packages/api/vitest.config.ts`:
```ts
// Unit tests for the tRPC layer. The routers are tested end to end through the HTTP app in apps/api.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "api",
    include: ["test/**/*.test.ts"],
  },
});
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install`

- [ ] **Step 2: Write the failing error-mapping test**

`packages/api/test/errors.test.ts`:
```ts
// Errors reach the client with the right status and a code and reason to translate, and internal details stay hidden.
import { TRPCError } from "@trpc/server";
import { DomainError } from "@travel-crm/domain/kernel";
import { describe, expect, it } from "vitest";
import { errorDetails, publicMessage, toTrpcError } from "../src/errors.js";

describe("api errors", () => {
  it("gives each domain error code its HTTP status", () => {
    const statuses = {
      NOT_FOUND: "NOT_FOUND",
      FORBIDDEN: "FORBIDDEN",
      CONFLICT: "CONFLICT",
      LIMIT_REACHED: "FORBIDDEN",
      FEATURE_LOCKED: "FORBIDDEN",
      VALIDATION: "BAD_REQUEST",
    } as const;
    for (const [domainCode, trpcCode] of Object.entries(statuses)) {
      const error = toTrpcError(new DomainError(domainCode as keyof typeof statuses, "SOME_REASON", "message"));
      expect(error.code).toBe(trpcCode);
    }
  });

  it("passes the domain code and reason to the client", () => {
    const error = toTrpcError(new DomainError("CONFLICT", "ROLE_IN_USE", "Move the staff first"));
    expect(errorDetails(error)).toEqual({ domainCode: "CONFLICT", reason: "ROLE_IN_USE" });
    expect(publicMessage(error)).toBe("Move the staff first");
  });

  it("hides the message of unexpected errors", () => {
    const error = new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause: new Error('relation "user" does not exist') });
    expect(publicMessage(error)).toBe("Something went wrong");
    expect(errorDetails(error)).toEqual({ domainCode: null, reason: null });
  });
});
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api test`

Expected: FAIL. Vitest cannot resolve `../src/errors.js`.

- [ ] **Step 3: Write the context, the error mapping and the tRPC instance**

`packages/api/src/context.ts`:
```ts
// The tRPC context: who sent the request, read from the session cookie (the 5-minute cache, spec 6.4).
import type { Identity } from "@travel-crm/domain/identity";

export interface ApiDependencies {
  identity: Identity;
}

export async function createContext({ identity }: ApiDependencies, request: Request) {
  const signedIn = await identity.auth.api.getSession({ headers: request.headers });
  return {
    identity,
    headers: request.headers,
    session: signedIn?.session ?? null,
    user: signedIn?.user ?? null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
```

`packages/api/src/errors.ts`:
```ts
// How errors reach the client (spec 9.7): each domain error code becomes a tRPC status, and the response carries the
// code and reason the web app turns into a translated message. Unexpected errors never show their own message.
import { TRPCError } from "@trpc/server";
import { DomainError, type DomainErrorCode } from "@travel-crm/domain/kernel";

const trpcCodeOf: Record<DomainErrorCode, TRPCError["code"]> = {
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  LIMIT_REACHED: "FORBIDDEN",
  FEATURE_LOCKED: "FORBIDDEN",
  VALIDATION: "BAD_REQUEST",
};

/** The tRPC error for a domain error, keeping it as the cause so the formatter can read its code and reason. */
export function toTrpcError(error: DomainError): TRPCError {
  return new TRPCError({ code: trpcCodeOf[error.code], message: error.message, cause: error });
}

/** What the client sees about a failed call, beyond tRPC's code and status. */
export interface ErrorDetails {
  /** The domain error code, e.g. "FORBIDDEN", or null for errors that aren't domain errors. */
  domainCode: DomainErrorCode | null;
  /** The reason, e.g. "MISSING_PERMISSION" or "SET_UP_TWO_FACTOR", or null. */
  reason: string | null;
}

export function errorDetails(error: TRPCError): ErrorDetails {
  const cause = error.cause;
  return cause instanceof DomainError
    ? { domainCode: cause.code, reason: cause.reason }
    : { domainCode: null, reason: null };
}

/** Internal errors can carry SQL or file paths in their message; the client gets a generic one instead. */
export function publicMessage(error: TRPCError): string {
  return error.code === "INTERNAL_SERVER_ERROR" ? "Something went wrong" : error.message;
}
```

`packages/api/src/trpc.ts`:
```ts
// The api's one tRPC instance: its context, and the error shape every response uses.
import { initTRPC } from "@trpc/server";
import type { Context } from "./context.js";
import { errorDetails, publicMessage } from "./errors.js";

export const t = initTRPC.context<Context>().create({
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    message: publicMessage(error),
    data: { ...shape.data, ...errorDetails(error) },
  }),
});

export const router = t.router;
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api test`. Expected: 3 tests pass.

- [ ] **Step 4: Write the procedure builders and the first routers**

`packages/api/src/procedures.ts`:
```ts
// The procedure builders. Each request runs the checks of spec 6.5 in order:
//   1 signed in → 2 organization active → 3 module on the plan → 4 role permission → handler.
// Checks 2 and 3 arrive with subscriptions (plan 4), inside memberAccessFor() and requires(), so call sites stay the
// same. Check 5 (own or all records) is the handler's, through scopeFilter(); check 6 is Postgres row-level security.
import { TRPCError } from "@trpc/server";
import { pendingStep, type Identity, type MemberAccess, type Permission } from "@travel-crm/domain/identity";
import { DomainError } from "@travel-crm/domain/kernel";
import { toTrpcError } from "./errors.js";
import { t } from "./trpc.js";

/** Every procedure turns domain errors into their HTTP status. */
const base = t.procedure.use(async ({ next }) => {
  const result = await next();
  if (!result.ok && result.error.cause instanceof DomainError) throw toTrpcError(result.error.cause);
  return result;
});

export const publicProcedure = base;

/** Check 1, from the session cookie. Cached for up to 5 minutes, so a revoked session still passes for that long. */
export const protectedProcedure = base.use(({ ctx, next }) => {
  if (!ctx.session || !ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { session: ctx.session, user: ctx.user } });
});

/** Check 1 against the database, ignoring the cookie cache: a revoked session stops at once (spec 6.4). */
const freshlySignedIn = base.use(async ({ ctx, next }) => {
  const fresh = await ctx.identity.auth.api.getSession({ headers: ctx.headers, query: { disableCookieCache: true } });
  if (!fresh) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { session: fresh.session, user: fresh.user } });
});

interface SignedInContext {
  identity: Identity;
  session: { activeOrganizationId?: string | null | undefined };
  user: { id: string };
}

/**
 * The member's access in the session's organization, read from the database on every request, so a removal or role
 * change applies to the next request. Members with a password change or two-factor setup still to do are refused
 * here; the endpoints they need for it (Better Auth's /change-password and /two-factor/*, and me.get) stay open.
 */
async function memberAccessFor(ctx: SignedInContext): Promise<MemberAccess> {
  const organizationId = ctx.session.activeOrganizationId;
  const access = organizationId ? await ctx.identity.resolveAccess(ctx.user.id, organizationId) : null;
  if (!access) throw new DomainError("FORBIDDEN", "NOT_A_MEMBER", "You are not a member of an organization");
  const step = pendingStep(access);
  if (step === "CHANGE_PASSWORD") throw new DomainError("FORBIDDEN", step, "Choose a new password first");
  if (step === "SET_UP_TWO_FACTOR") throw new DomainError("FORBIDDEN", step, "Set up two-factor sign-in first");
  return access;
}

/** Check 4: the member's role holds every listed permission. */
function assertHolds(member: MemberAccess, required: readonly Permission[]): void {
  const missing = member.permissions.missing(required);
  if (missing.length > 0) {
    throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", `Requires ${missing.join(", ")}`);
  }
}

type RequiredPermissions = [Permission, ...Permission[]];

const member = protectedProcedure.use(async ({ ctx, next }) => next({ ctx: { member: await memberAccessFor(ctx) } }));
const freshMember = freshlySignedIn.use(async ({ ctx, next }) => next({ ctx: { member: await memberAccessFor(ctx) } }));

/** Any member of the session's organization. `.requires("leads:create")` adds check 4. */
export const orgProcedure = Object.assign(member, {
  requires: (...permissions: RequiredPermissions) =>
    member.use(({ ctx, next }) => {
      assertHolds(ctx.member, permissions);
      return next();
    }),
});

/** Like orgProcedure, but the session is read from the database: for money, roles, exports and staff management. */
export const freshProcedure = Object.assign(freshMember, {
  requires: (...permissions: RequiredPermissions) =>
    freshMember.use(({ ctx, next }) => {
      assertHolds(ctx.member, permissions);
      return next();
    }),
});

/** Platform staff only (spec 6.1): user role "admin" and no membership, on a session read from the database. */
export const platformProcedure = freshlySignedIn.use(async ({ ctx, next }) => {
  if (!(await ctx.identity.isPlatformAdmin(ctx.user))) {
    throw new DomainError("FORBIDDEN", "PLATFORM_ONLY", "Only platform staff can do this");
  }
  return next();
});
```

tRPC builders can't take custom chain methods, so `requires` exists only on `orgProcedure` and `freshProcedure` themselves. Write `orgProcedure.requires("x:y").input(…)`, never `orgProcedure.input(…).requires(…)`.

`packages/api/src/routers/me.ts`:
```ts
// me.get: who is signed in, their organization and permissions, and any step they must take first. Open to every
// signed-in person, including those who must change their password or set up two-factor, so the app can guide them.
import { TRPCError } from "@trpc/server";
import { meOutput } from "@travel-crm/contracts/identity";
import { protectedProcedure } from "../procedures.js";
import { router } from "../trpc.js";

export const meRouter = router({
  get: protectedProcedure.output(meOutput).query(async ({ ctx }) => {
    const me = await ctx.identity.describeSignedInPerson({
      userId: ctx.user.id,
      organizationId: ctx.session.activeOrganizationId ?? null,
      impersonatedBy: ctx.session.impersonatedBy ?? null,
    });
    if (!me) throw new TRPCError({ code: "UNAUTHORIZED" });
    return me;
  }),
});
```

`packages/api/src/routers/settings.ts`:
```ts
// The organization's security settings: whether every member must use two-factor sign-in (spec 6.2).
import { securitySettings, setTwoFactorRequirementInput } from "@travel-crm/contracts/identity";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

export const settingsRouter = router({
  get: orgProcedure
    .output(securitySettings)
    .query(({ ctx }) => ({ requireTwoFactor: ctx.member.organizationRequiresTwoFactor })),

  setTwoFactorRequirement: freshProcedure
    .requires("settings:manage")
    .input(setTwoFactorRequirementInput)
    .output(securitySettings)
    .mutation(({ ctx, input }) => ctx.identity.settings.setTwoFactorRequirement(ctx.member, input)),
});
```

`packages/api/src/routers/platform.ts`:
```ts
// The platform console's procedures (spec 7). Plan 4 adds organizations, plans and impersonation here.
import { z } from "zod";
import { platformProcedure } from "../procedures.js";
import { router } from "../trpc.js";

export const platformRouter = router({
  /** Confirms the caller is platform staff; the console calls it when it opens. */
  whoAmI: platformProcedure
    .output(z.object({ userId: z.uuid(), name: z.string() }))
    .query(({ ctx }) => ({ userId: ctx.user.id, name: ctx.user.name })),
});
```

`packages/api/src/routers/app-router.ts` (Task 11 adds staff and roles):
```ts
// Every tRPC router the api serves at /api/trpc. The web app imports the AppRouter type only, never this code.
import { router } from "../trpc.js";
import { meRouter } from "./me.js";
import { platformRouter } from "./platform.js";
import { settingsRouter } from "./settings.js";

export const appRouter = router({
  me: meRouter,
  settings: settingsRouter,
  platform: platformRouter,
});

export type AppRouter = typeof appRouter;
```

`packages/api/src/index.ts`:
```ts
// Public API of @travel-crm/api: the tRPC router and its context, for apps/api to serve.
export { createContext, type ApiDependencies, type Context } from "./context.js";
export type { ErrorDetails } from "./errors.js";
export { appRouter, type AppRouter } from "./routers/app-router.js";
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api typecheck && pnpm --filter @travel-crm/api lint`. Expected: clean.

- [ ] **Step 5: Write the HTTP test support and the failing tests**

Replace `apps/api/package.json` (it adds tRPC and, for tests, `@better-auth/utils`):
```json
{
  "name": "@travel-crm/api-server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch --env-file-if-exists=../../.env src/server.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run"
  },
  "dependencies": {
    "@hono/node-server": "2.1.5",
    "@hono/trpc-server": "0.4.2",
    "@travel-crm/api": "workspace:*",
    "@travel-crm/contracts": "workspace:*",
    "@travel-crm/domain": "workspace:*",
    "@trpc/server": "11.19.0",
    "hono": "4.13.13",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@better-auth/utils": "0.4.2",
    "@travel-crm/db": "workspace:*",
    "@travel-crm/eslint-config": "workspace:*",
    "@travel-crm/tsconfig": "workspace:*",
    "@types/node": "catalog:",
    "eslint": "catalog:",
    "tsx": "4.23.15",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm install`

`apps/api/test/support/trpc.ts`:
```ts
// Calls tRPC procedures through the HTTP app the way the web app's client does: queries are GETs with the input in
// the URL, mutations are JSON POSTs.
import type { CookieJar } from "./cookie-jar.js";
import type { TestServer } from "./test-server.js";

export async function query(server: TestServer, path: string, jar?: CookieJar, input?: unknown): Promise<Response> {
  const search = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  return server.app.request(`/api/trpc/${path}${search}`, { headers: jar ? { cookie: jar.header } : {} });
}

export async function mutate(server: TestServer, path: string, input: unknown, jar?: CookieJar): Promise<Response> {
  return server.app.request(`/api/trpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(jar ? { cookie: jar.header } : {}) },
    body: JSON.stringify(input),
  });
}

/** The data of a successful call. Fails the test, showing the error, if the call failed. */
export async function dataOf<T>(response: Response): Promise<T> {
  const body = (await response.json()) as { result?: { data: T }; error?: unknown };
  if (!response.ok || !body.result)
    throw new Error(`Expected success, got ${String(response.status)}: ${JSON.stringify(body.error)}`);
  return body.result.data;
}

/** The HTTP status and domain reason of a failed call, e.g. { status: 403, reason: "MISSING_PERMISSION" }. */
export async function refusalOf(response: Response): Promise<{ status: number; reason: string | null }> {
  const body = (await response.json()) as { error?: { data?: { reason?: string | null } } };
  return { status: response.status, reason: body.error?.data?.reason ?? null };
}
```

`apps/api/test/support/people.ts`:
```ts
// People for the HTTP tests: staff of a test agency, and platform staff, made directly through the identity module.
import type { MemberAccess } from "@travel-crm/domain/identity";
import { CookieJar } from "./cookie-jar.js";
import { signInByEmail, signInWithCode, type TestAgency, type TestServer } from "./test-server.js";

/** The Owner's access, for calling the identity module directly when setting a test up. */
export async function ownerAccess(server: TestServer, agency: TestAgency): Promise<MemberAccess> {
  const access = await server.identity.resolveAccess(agency.owner.userId, agency.organizationId);
  if (!access) throw new Error("the test agency's owner has no access");
  return access;
}

export interface TestStaff {
  userId: string;
  memberId: string;
  username: string;
  password: string;
}

/** Adds staff without email and, unless told otherwise, marks their password as already changed. */
export async function addStaff(
  server: TestServer,
  agency: TestAgency,
  options: { username: string; roleKey: string; mustChangePassword?: boolean },
): Promise<TestStaff> {
  const password = `${options.username}-password-1`;
  const created = await server.identity.staff.create(await ownerAccess(server, agency), {
    name: options.username,
    username: options.username,
    roleKey: options.roleKey,
    temporaryPassword: password,
  });
  if (options.mustChangePassword !== true) {
    await server.platform.user.update({ where: { id: created.userId }, data: { mustChangePassword: false } });
  }
  return { userId: created.userId, memberId: created.memberId, username: options.username, password };
}

/** Signs staff in with the organization code and returns their cookie jar. */
export async function signedInStaff(server: TestServer, agency: TestAgency, staff: TestStaff): Promise<CookieJar> {
  const jar = new CookieJar();
  const response = await signInWithCode(server, jar, {
    orgCode: agency.code,
    username: staff.username,
    password: staff.password,
  });
  if (!response.ok) throw new Error(`staff sign-in failed with ${String(response.status)}`);
  return jar;
}

/** Signs the agency's Owner in by email and returns their cookie jar. */
export async function signedInOwner(server: TestServer, agency: TestAgency): Promise<CookieJar> {
  const jar = new CookieJar();
  const response = await signInByEmail(server, jar, agency.owner.email, agency.owner.password);
  if (!response.ok) throw new Error(`owner sign-in failed with ${String(response.status)}`);
  return jar;
}

/** Platform staff: user role "admin", a password, and no organization (spec 6.1). */
export async function createPlatformAdmin(
  server: TestServer,
): Promise<{ userId: string; email: string; password: string }> {
  const email = `support-${crypto.randomUUID()}@platform.test`;
  const password = "platform-password-1";
  const hash = await (await server.identity.auth.$context).password.hash(password);
  const user = await server.platform.user.create({ data: { name: "Platform support", email, role: "admin" } });
  await server.platform.account.create({
    data: { userId: user.id, accountId: user.id, providerId: "credential", password: hash },
  });
  return { userId: user.id, email, password };
}
```

`apps/api/test/support/two-factor.ts`:
```ts
// Two-factor sign-in for tests: turn it on through Better Auth's own endpoints and produce valid authenticator codes.
import { base32 } from "@better-auth/utils/base32";
import type { CookieJar } from "./cookie-jar.js";
import { postJson, type TestServer } from "./test-server.js";

export interface TwoFactorSetup {
  /** The otpauth:// link a phone would scan. */
  totpUri: string;
  /** The secret inside it, for generating codes. */
  secret: string;
}

/** Turns on two-factor for the signed-in person: asks for the setup link, then confirms it with a code. */
export async function enableTwoFactor(server: TestServer, jar: CookieJar, password: string): Promise<TwoFactorSetup> {
  const enable = jar.absorb(await postJson(server, "/api/auth/two-factor/enable", { password }, jar));
  if (!enable.ok) throw new Error(`two-factor enable failed with ${String(enable.status)}`);
  const { totpURI } = (await enable.json()) as { totpURI: string };
  const encoded = new URL(totpURI).searchParams.get("secret") ?? "";
  const secret = new TextDecoder().decode(base32.decode(encoded));
  const verify = jar.absorb(
    await postJson(server, "/api/auth/two-factor/verify-totp", { code: await codeFor(server, secret) }, jar),
  );
  if (!verify.ok) throw new Error(`two-factor verify failed with ${String(verify.status)}`);
  return { totpUri: totpURI, secret };
}

/** The current authenticator code for a secret, as the person's phone would show it. */
export async function codeFor(server: TestServer, secret: string): Promise<string> {
  return (await server.identity.auth.api.generateTOTP({ body: { secret } })).code;
}
```

`apps/api/test/request-checks.test.ts`:
```ts
// The request checks of spec 6.5 through the HTTP app: signed in (1), role permission (4), membership read on every
// request, fresh sessions for sensitive procedures (spec 6.4), and the steps a member must take before using the app.
import type { MeOutput } from "@travel-crm/contracts/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  postJson,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

describe("request checks", () => {
  let server: TestServer;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await server.close();
  });

  it("refuses calls without a session (check 1)", async () => {
    expect((await query(server, "me.get")).status).toBe(401);
    expect((await query(server, "settings.get")).status).toBe(401);
    expect((await query(server, "me.get", new CookieJar())).status).toBe(401);
  });

  it("tells a member who they are, their organization and what they may do", async () => {
    const ravi = await addStaff(server, agency, { username: "ravi", roleKey: "sales" });
    const me = await dataOf<MeOutput>(await query(server, "me.get", await signedInStaff(server, agency, ravi)));
    expect(me.user).toMatchObject({ id: ravi.userId, email: null, username: "ravi", twoFactorEnabled: false });
    expect(me.organization).toMatchObject({ id: agency.organizationId, code: agency.code, requireTwoFactor: false });
    expect(me.member?.role).toEqual({ key: "sales", name: "Sales", isOwner: false });
    expect(me.member?.permissions).toContainEqual({ permission: "leads:view", scope: "own" });
    expect(me).toMatchObject({ impersonatedBy: null, isPlatformAdmin: false, pendingStep: null });
  });

  it("lets a member read settings but only someone with settings:manage change them (check 4)", async () => {
    const sales = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "sunil", roleKey: "sales" }),
    );
    expect(await dataOf(await query(server, "settings.get", sales))).toEqual({ requireTwoFactor: false });
    expect(
      await refusalOf(await mutate(server, "settings.setTwoFactorRequirement", { required: false }, sales)),
    ).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
    const owner = await signedInOwner(server, agency);
    expect((await mutate(server, "settings.setTwoFactorRequirement", { required: false }, owner)).status).toBe(200);
  });

  it("rejects malformed input with 400", async () => {
    const owner = await signedInOwner(server, agency);
    const response = await mutate(server, "settings.setTwoFactorRequirement", { required: "yes" }, owner);
    expect(response.status).toBe(400);
  });

  it("refuses a removed member at once, though their session cookie is still cached", async () => {
    const meera = await addStaff(server, agency, { username: "meera", roleKey: "operations" });
    const jar = await signedInStaff(server, agency, meera);
    expect((await query(server, "settings.get", jar)).status).toBe(200);
    await server.platform.member.update({
      where: { id: meera.memberId },
      data: { deletedAt: new Date(), deletedBy: agency.owner.userId },
    });
    expect(await refusalOf(await query(server, "settings.get", jar))).toEqual({ status: 403, reason: "NOT_A_MEMBER" });
  });

  it("lets a revoked session through ordinary procedures for up to 5 minutes, but never through sensitive ones", async () => {
    const jar = await signedInOwner(server, agency);
    await server.platform.session.deleteMany({ where: { userId: agency.owner.userId } });
    // Cookie cache: the session row is gone, but the signed cookie is still trusted for up to 5 minutes (spec 6.4).
    expect((await query(server, "me.get", jar)).status).toBe(200);
    expect((await mutate(server, "settings.setTwoFactorRequirement", { required: false }, jar)).status).toBe(401);
  });

  it("holds a member with a temporary password at me.get until they change it through Better Auth", async () => {
    const tara = await addStaff(server, agency, { username: "tara", roleKey: "sales", mustChangePassword: true });
    const jar = await signedInStaff(server, agency, tara);
    expect(await refusalOf(await query(server, "settings.get", jar))).toEqual({
      status: 403,
      reason: "CHANGE_PASSWORD",
    });
    expect((await dataOf<MeOutput>(await query(server, "me.get", jar))).pendingStep).toBe("CHANGE_PASSWORD");

    const change = jar.absorb(
      await postJson(
        server,
        "/api/auth/change-password",
        { currentPassword: tara.password, newPassword: "taras-own-password", revokeOtherSessions: true },
        jar,
      ),
    );
    expect(change.status).toBe(200);
    expect((await query(server, "settings.get", jar)).status).toBe(200);
  });
});
```

`apps/api/test/two-factor.test.ts`:
```ts
// Two-factor sign-in (spec 6.2): optional per person, required for everyone when an owner says so, with the setup
// endpoints left open to those who still need them, and no placeholder email shown in the authenticator app.
import type { MeOutput } from "@travel-crm/contracts/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  postJson,
  signInWithCode,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";
import { codeFor, enableTwoFactor } from "./support/two-factor.js";

describe("two-factor sign-in", () => {
  let server: TestServer;
  let agency: TestAgency;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
  });

  afterAll(async () => {
    await server.close();
  });

  it("can't be required by an owner who doesn't use it, so they can't lock themselves out", async () => {
    const owner = await signedInOwner(server, agency);
    expect(
      await refusalOf(await mutate(server, "settings.setTwoFactorRequirement", { required: true }, owner)),
    ).toEqual({
      status: 403,
      reason: "ENABLE_TWO_FACTOR_FIRST",
    });
  });

  it("once required, holds members without it at setup, which stays open to them", async () => {
    const owner = await signedInOwner(server, agency);
    await enableTwoFactor(server, owner, agency.owner.password);
    expect(await dataOf(await mutate(server, "settings.setTwoFactorRequirement", { required: true }, owner))).toEqual({
      requireTwoFactor: true,
    });

    const ravi = await addStaff(server, agency, { username: "ravi", roleKey: "sales" });
    const jar = await signedInStaff(server, agency, ravi);
    expect(await refusalOf(await query(server, "settings.get", jar))).toEqual({
      status: 403,
      reason: "SET_UP_TWO_FACTOR",
    });
    expect((await dataOf<MeOutput>(await query(server, "me.get", jar))).pendingStep).toBe("SET_UP_TWO_FACTOR");

    const setup = await enableTwoFactor(server, jar, ravi.password);
    expect((await query(server, "settings.get", jar)).status).toBe(200);
    // The phone app shows the organization code and username, never the placeholder address.
    expect(decodeURIComponent(setup.totpUri)).toContain(`:${agency.code} ravi?`);
    expect(setup.totpUri).not.toContain("no-email.invalid");
  });

  it("asks for a code after the password, including at organization-code sign-in", async () => {
    const meera = await addStaff(server, agency, { username: "meera", roleKey: "operations" });
    const { secret } = await enableTwoFactor(server, await signedInStaff(server, agency, meera), meera.password);

    const jar = new CookieJar();
    const passwordStep = await signInWithCode(server, jar, {
      orgCode: agency.code,
      username: "meera",
      password: meera.password,
    });
    expect(await passwordStep.json()).toMatchObject({ twoFactorRedirect: true });
    expect(jar.names()).toEqual(["better-auth.two_factor"]);
    expect((await query(server, "me.get", jar)).status).toBe(401);

    jar.absorb(await postJson(server, "/api/auth/two-factor/verify-totp", { code: "000000" }, jar));
    expect((await query(server, "me.get", jar)).status).toBe(401);
    const codeStep = jar.absorb(
      await postJson(server, "/api/auth/two-factor/verify-totp", { code: await codeFor(server, secret) }, jar),
    );
    expect(codeStep.status).toBe(200);
    expect((await dataOf<MeOutput>(await query(server, "me.get", jar))).user.id).toBe(meera.userId);
  });
});
```

`apps/api/test/platform.test.ts`:
```ts
// Platform staff (spec 6.1): user role "admin" and no organization. They reach platform procedures, organization
// staff don't, and impersonation (at most an hour) makes the admin act as the user, never as platform staff.
import type { MeOutput } from "@travel-crm/contracts/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CookieJar } from "./support/cookie-jar.js";
import { createPlatformAdmin, signedInOwner } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  postJson,
  signInByEmail,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, query, refusalOf } from "./support/trpc.js";

describe("platform staff", () => {
  let server: TestServer;
  let agency: TestAgency;
  let admin: { userId: string; email: string; password: string };

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    admin = await createPlatformAdmin(server);
  });

  afterAll(async () => {
    await server.close();
  });

  it("reach platform procedures, and organization staff don't", async () => {
    const jar = new CookieJar();
    await signInByEmail(server, jar, admin.email, admin.password);
    expect(await dataOf(await query(server, "platform.whoAmI", jar))).toEqual({
      userId: admin.userId,
      name: "Platform support",
    });
    expect((await dataOf<MeOutput>(await query(server, "me.get", jar))).isPlatformAdmin).toBe(true);
    expect(await refusalOf(await query(server, "platform.whoAmI", await signedInOwner(server, agency)))).toEqual({
      status: 403,
      reason: "PLATFORM_ONLY",
    });
  });

  it("are not organization members", async () => {
    const jar = new CookieJar();
    await signInByEmail(server, jar, admin.email, admin.password);
    expect(await refusalOf(await query(server, "settings.get", jar))).toEqual({ status: 403, reason: "NOT_A_MEMBER" });
  });

  it("can impersonate a user for an hour, acting as them and not as platform staff", async () => {
    const jar = new CookieJar();
    await signInByEmail(server, jar, admin.email, admin.password);
    const start = jar.absorb(
      await postJson(server, "/api/auth/admin/impersonate-user", { userId: agency.owner.userId }, jar),
    );
    expect(start.status).toBe(200);

    const me = await dataOf<MeOutput>(await query(server, "me.get", jar));
    expect(me).toMatchObject({ impersonatedBy: admin.userId, isPlatformAdmin: false });
    expect(me.user.id).toBe(agency.owner.userId);
    expect((await query(server, "settings.get", jar)).status).toBe(200);
    expect((await query(server, "platform.whoAmI", jar)).status).toBe(403);
    const session = await server.platform.session.findFirstOrThrow({
      where: { userId: agency.owner.userId, impersonatedBy: admin.userId },
    });
    expect(session.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60 * 60 * 1000);

    jar.absorb(await postJson(server, "/api/auth/admin/stop-impersonating", {}, jar));
    expect((await dataOf<MeOutput>(await query(server, "me.get", jar))).user.id).toBe(admin.userId);
  });

  it("can't be impersonated into by organization staff", async () => {
    const owner = await signedInOwner(server, agency);
    const attempt = await postJson(server, "/api/auth/admin/impersonate-user", { userId: admin.userId }, owner);
    expect(attempt.status).toBe(403);
  });
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server test`

Expected: Task 9's 15 tests pass. The new files fail: every `/api/trpc/…` call answers 404, because tRPC isn't mounted yet.

- [ ] **Step 7: Mount tRPC**

Replace `apps/api/src/app.ts`:
```ts
// The api's HTTP app: a health check, Better Auth's sign-in endpoints under /api/auth, and tRPC at /api/trpc.
import { trpcServer } from "@hono/trpc-server";
import { appRouter, createContext } from "@travel-crm/api";
import type { Identity } from "@travel-crm/domain/identity";
import { Hono } from "hono";
import { organizationSignIn } from "./org-sign-in.js";

export interface ServerDependencies {
  identity: Identity;
}

export function createApp({ identity }: ServerDependencies): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  // Members and roles are managed through our own API. Better Auth's organization endpoints would bypass its rules.
  app.all("/api/auth/organization/*", (c) => c.json({ code: "NOT_FOUND", message: "Not found" }, 404));
  app.post("/api/auth/sign-in/org", (c) => organizationSignIn(identity.auth, c.req.raw));
  app.on(["GET", "POST"], "/api/auth/*", (c) => identity.auth.handler(c.req.raw));

  app.use(
    "/api/trpc/*",
    trpcServer({
      router: appRouter,
      endpoint: "/api/trpc",
      createContext: (_options, c) => createContext({ identity }, c.req.raw),
      onError: ({ error, path }) => {
        // Refusals (401, 403, 404...) are answers, not faults. Only unexpected errors are logged.
        if (error.code === "INTERNAL_SERVER_ERROR") console.error(`tRPC ${path ?? "?"} failed`, error);
      },
    }),
  );

  return app;
}
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server typecheck && pnpm --filter @travel-crm/api-server test`

Expected: 29 tests pass. These pin Review Focus 2, 3 and 4:
- "refuses a removed member at once, though their session cookie is still cached";
- "lets a revoked session through ordinary procedures for up to 5 minutes, but never through sensitive ones";
- "can't be required by an owner who doesn't use it…";
- "once required, holds members without it at setup, which stays open to them": the authenticator label shows `<CODE> ravi`, never the placeholder;
- "asks for a code after the password, including at organization-code sign-in".

- [ ] **Step 9: Document the server**

`apps/api/README.md`:
```markdown
# @travel-crm/api-server

The api: one Hono app on Node. Settings come from environment variables (`src/environment.ts` checks them at start-up).

## Routes

| Route                        | What it is                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `GET /health`                | `{ "status": "ok" }` for the container platform                                       |
| `POST /api/auth/sign-in/org` | sign in with `{ orgCode, username, password }` (see ADR 0006)                         |
| `/api/auth/*`                | Better Auth: email sign-in, sign-out, `/change-password`, `/two-factor/*`, `/admin/*` |
| `/api/auth/organization/*`   | closed (404): members and roles are managed through tRPC                              |
| `/api/trpc/*`                | the tRPC routers from `@travel-crm/api`                                               |

## Environment

| Variable                  | Required | Default           | Meaning                                                     |
| ------------------------- | -------- | ----------------- | ----------------------------------------------------------- |
| `DATABASE_URL`            | yes      |                   | Postgres as the `app_runtime` role                          |
| `BETTER_AUTH_SECRET`      | yes      |                   | at least 32 characters; `openssl rand -base64 32`           |
| `BETTER_AUTH_URL`         | yes      |                   | where browsers reach the api; https in production           |
| `TRUSTED_ORIGINS`         | no       | none              | other origins allowed to call with cookies, comma-separated |
| `AUTH_RATE_LIMIT`         | no       | `true`            | sign-in rate limiting; cannot be off in production          |
| `AUTH_IP_ADDRESS_HEADERS` | no       | `x-forwarded-for` | header(s) the load balancer puts the client's IP in         |
| `DATABASE_POOL_SIZE`      | no       | `10`              | connections per instance                                    |
| `PORT`                    | no       | `3001`            |                                                             |
| `NODE_ENV`                | no       | `development`     | `production` turns on HTTPS and rate-limit requirements     |

The api never reads `DATABASE_MIGRATOR_URL` or `DATABASE_PLATFORM_URL`: migrations run as a separate step, and only the
platform module may connect as the role that sees every organization.

## Tests

`pnpm --filter @travel-crm/api-server test` runs end-to-end tests through `app.request()` against a throwaway Postgres.
`test/support/` has the cookie jar, tRPC call helpers, and helpers that create agencies, staff and platform admins.
```

- [ ] **Step 10: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`. Expected: green.

```bash
cd /Users/ak/personal/travel-crm
git add packages/api apps/api pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(api): add tRPC with the request checks, and the me, settings and platform routers"
```

---

### Task 11: Staff and roles over tRPC

The last two routers. `staff.*` needs `staff:manage`; changing roles needs `roles:manage`. Both read the session from the database (spec 6.4). Every member may list roles and read the permission catalog. The tests are the end-to-end journeys: an owner adds people with and without email, they sign in, roles change under them, and they are removed.

**Files:**
- Create: `packages/api/src/routers/staff.ts`, `packages/api/src/routers/roles.ts`, `packages/api/README.md`
- Modify: `packages/api/src/routers/app-router.ts`
- Create: `apps/api/test/staff.test.ts`, `apps/api/test/roles.test.ts`

**Interfaces:**
- Consumes:
  - From Task 10: `freshProcedure`, `orgProcedure`, `router` and all the test support.
  - From Task 8: `Identity.staff` and `Identity.roles`.
  - From Task 5: `permissionCatalog`.
  - From Task 4: the staff and roles contracts.
- Produces:
  - `staff.list` (query; output `StaffMember[]`) and `staff.create`, `staff.updateRole` (mutations; output `StaffMember`), all `freshProcedure.requires("staff:manage")`.
  - `staff.resetPassword` and `staff.remove`: mutations with no output, also `freshProcedure.requires("staff:manage")`.
  - `roles.list`: `freshProcedure` for any member, output `RoleSummary[]`.
  - `roles.permissionCatalog`: `orgProcedure`, output `PermissionCatalogEntry[]`.
  - `roles.create`, `roles.update` (output `RoleSummary`) and `roles.delete`: `freshProcedure.requires("roles:manage")`.
  - `appRouter` = `{ me, staff, roles, settings, platform }`.

- [ ] **Step 1: Write the failing tests**

`apps/api/test/staff.test.ts`:
```ts
// Staff management through the HTTP app (spec 6.3): an owner adds people with and without email, changes their
// roles, resets passwords and removes them, and nobody reaches above their own access.
import type { MeOutput, StaffMember } from "@travel-crm/contracts/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import {
  createTestAgency,
  createTestServer,
  signInByEmail,
  signInWithCode,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

describe("staff management", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
  });

  afterAll(async () => {
    await server.close();
  });

  it("adds staff without email, who sign in with the organization code and must choose a password", async () => {
    const ravi = await dataOf<StaffMember>(
      await mutate(
        server,
        "staff.create",
        { name: "Ravi Kumar", username: "Ravi", roleKey: "sales", temporaryPassword: "ravi-temp-pass-1" },
        owner,
      ),
    );
    expect(ravi).toMatchObject({
      email: null,
      username: "Ravi",
      role: { key: "sales", name: "Sales" },
      mustChangePassword: true,
    });
    const jar = new CookieJar();
    expect(
      (await signInWithCode(server, jar, { orgCode: agency.code, username: "ravi", password: "ravi-temp-pass-1" }))
        .status,
    ).toBe(200);
    expect((await dataOf<MeOutput>(await query(server, "me.get", jar))).pendingStep).toBe("CHANGE_PASSWORD");
  });

  it("adds staff with email, who sign in by email", async () => {
    const email = `meera-${agency.code.toLowerCase()}@example.test`;
    await dataOf(
      await mutate(
        server,
        "staff.create",
        {
          name: "Meera",
          email: ` ${email.toUpperCase()} `,
          roleKey: "operations",
          temporaryPassword: "meera-temp-pass-1",
        },
        owner,
      ),
    );
    expect((await signInByEmail(server, new CookieJar(), email, "meera-temp-pass-1")).status).toBe(200);
  });

  it("refuses staff with neither email nor username, or a placeholder address", async () => {
    const neither = await mutate(
      server,
      "staff.create",
      { name: "Nobody", roleKey: "sales", temporaryPassword: "nobody-pass-1" },
      owner,
    );
    expect(neither.status).toBe(400);
    const placeholder = await mutate(
      server,
      "staff.create",
      { name: "Sneaky", email: "x@no-email.invalid", roleKey: "sales", temporaryPassword: "sneaky-pass-1" },
      owner,
    );
    expect(placeholder.status).toBe(400);
  });

  it("refuses a username already in use in the organization", async () => {
    const again = await mutate(
      server,
      "staff.create",
      { name: "Another Ravi", username: "RAVI", roleKey: "sales", temporaryPassword: "ravi-temp-pass-2" },
      owner,
    );
    expect(await refusalOf(again)).toEqual({ status: 409, reason: "EMAIL_OR_USERNAME_TAKEN" });
  });

  it("lists the organization's staff, without placeholder addresses, to staff:manage only", async () => {
    const staff = await dataOf<StaffMember[]>(await query(server, "staff.list", owner));
    expect(staff.map((member) => member.name)).toEqual(["Asha Owner", "Ravi Kumar", "Meera"]);
    expect(staff.find((member) => member.name === "Ravi Kumar")?.email).toBeNull();
    const sales = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "sunil", roleKey: "sales" }),
    );
    expect(await refusalOf(await query(server, "staff.list", sales))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
  });

  describe("an Admin", () => {
    let admin: CookieJar;

    beforeAll(async () => {
      admin = await signedInStaff(
        server,
        agency,
        await addStaff(server, agency, { username: "admin", roleKey: "org-admin" }),
      );
    });

    it("can manage staff but cannot make anyone an Owner", async () => {
      expect((await query(server, "staff.list", admin)).status).toBe(200);
      const boss = await mutate(
        server,
        "staff.create",
        { name: "Boss", username: "boss", roleKey: "org-owner", temporaryPassword: "boss-temp-pass-1" },
        admin,
      );
      expect(await refusalOf(boss)).toEqual({ status: 403, reason: "OWNER_ONLY" });
    });

    it("cannot take over the Owner's account by resetting its password", async () => {
      const reset = await mutate(
        server,
        "staff.resetPassword",
        { memberId: agency.owner.memberId, temporaryPassword: "hijacked-pass-1" },
        admin,
      );
      expect(await refusalOf(reset)).toEqual({ status: 403, reason: "OWNER_ONLY" });
      expect((await signInByEmail(server, new CookieJar(), agency.owner.email, agency.owner.password)).status).toBe(
        200,
      );
    });

    it("cannot remove the Owner, and the Owner cannot remove themselves", async () => {
      expect(await refusalOf(await mutate(server, "staff.remove", { memberId: agency.owner.memberId }, admin))).toEqual(
        { status: 403, reason: "OWNER_ONLY" },
      );
      expect(await refusalOf(await mutate(server, "staff.remove", { memberId: agency.owner.memberId }, owner))).toEqual(
        {
          status: 403,
          reason: "CANNOT_CHANGE_YOURSELF",
        },
      );
    });
  });

  it("moves someone to another role, effective on their next request", async () => {
    const tara = await addStaff(server, agency, { username: "tara", roleKey: "sales" });
    const jar = await signedInStaff(server, agency, tara);
    expect((await query(server, "staff.list", jar)).status).toBe(403);
    await dataOf(await mutate(server, "staff.updateRole", { memberId: tara.memberId, roleKey: "org-admin" }, owner));
    expect((await query(server, "staff.list", jar)).status).toBe(200);
  });

  it("resets a password: the person is signed out everywhere and must choose a new one", async () => {
    const kiran = await addStaff(server, agency, { username: "kiran", roleKey: "sales" });
    const jar = await signedInStaff(server, agency, kiran);
    await dataOf(
      await mutate(
        server,
        "staff.resetPassword",
        { memberId: kiran.memberId, temporaryPassword: "kiran-new-temp-1" },
        owner,
      ),
    );
    expect((await query(server, "roles.list", jar)).status).toBe(401);
    expect(
      (
        await signInWithCode(server, new CookieJar(), {
          orgCode: agency.code,
          username: "kiran",
          password: kiran.password,
        })
      ).status,
    ).toBe(401);
    const again = new CookieJar();
    expect(
      (await signInWithCode(server, again, { orgCode: agency.code, username: "kiran", password: "kiran-new-temp-1" }))
        .status,
    ).toBe(200);
    expect(await refusalOf(await query(server, "settings.get", again))).toEqual({
      status: 403,
      reason: "CHANGE_PASSWORD",
    });
  });

  it("removes someone at once: no access on the next request, no sign-in, and their email is free again", async () => {
    const email = `dev-${agency.code.toLowerCase()}@example.test`;
    const dev = await dataOf<StaffMember>(
      await mutate(
        server,
        "staff.create",
        { name: "Dev", email, username: "dev", roleKey: "sales", temporaryPassword: "dev-temp-pass-1" },
        owner,
      ),
    );
    await server.platform.user.update({ where: { id: dev.userId }, data: { mustChangePassword: false } });
    const jar = new CookieJar();
    await signInByEmail(server, jar, email, "dev-temp-pass-1");
    expect((await query(server, "settings.get", jar)).status).toBe(200);

    await dataOf(await mutate(server, "staff.remove", { memberId: dev.memberId }, owner));
    expect(await refusalOf(await query(server, "settings.get", jar))).toEqual({ status: 403, reason: "NOT_A_MEMBER" });
    expect((await query(server, "roles.list", jar)).status).toBe(401);
    expect((await signInByEmail(server, new CookieJar(), email, "dev-temp-pass-1")).status).toBe(401);

    const other = await createTestAgency(server);
    const otherOwner = await signedInOwner(server, other);
    const rejoined = await mutate(
      server,
      "staff.create",
      { name: "Dev", email, roleKey: "sales", temporaryPassword: "dev-temp-pass-2" },
      otherOwner,
    );
    expect((await dataOf<StaffMember>(rejoined)).email).toBe(email);
  });

  it("treats a member of another organization as not found", async () => {
    const other = await createTestAgency(server);
    expect(await refusalOf(await mutate(server, "staff.remove", { memberId: other.owner.memberId }, owner))).toEqual({
      status: 404,
      reason: "MEMBER_NOT_FOUND",
    });
  });

  it("stops a staff manager whose sessions were revoked, at once", async () => {
    const jar = await signedInOwner(server, agency);
    await server.platform.session.deleteMany({ where: { userId: agency.owner.userId } });
    expect((await query(server, "staff.list", jar)).status).toBe(401);
    owner = await signedInOwner(server, agency);
  });
});
```

`apps/api/test/roles.test.ts`:
```ts
// Roles through the HTTP app (spec 6.5): every member can see them, only roles:manage can change them, the Owner
// role never changes, and a role in use can't be deleted.
import type { PermissionCatalogEntry, RoleSummary } from "@travel-crm/contracts/identity";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

describe("roles", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
  });

  afterAll(async () => {
    await server.close();
  });

  it("shows every member the roles and the permission catalog", async () => {
    const sales = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "ravi", roleKey: "sales" }),
    );
    const roles = await dataOf<RoleSummary[]>(await query(server, "roles.list", sales));
    expect(roles.map((role) => role.name)).toEqual(["Owner", "Accounts", "Admin", "Operations", "Sales"]);
    const catalog = await dataOf<PermissionCatalogEntry[]>(await query(server, "roles.permissionCatalog", sales));
    expect(catalog).toContainEqual({ permission: "leads:view", module: "leads", scoped: true });
  });

  it("lets only roles:manage change roles, which Admin doesn't have", async () => {
    const admin = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "admin", roleKey: "org-admin" }),
    );
    expect(await refusalOf(await mutate(server, "roles.create", { name: "Guides", permissions: [] }, admin))).toEqual({
      status: 403,
      reason: "MISSING_PERMISSION",
    });
  });

  it("creates a role, gives it to staff, and edits it, effective on their next request", async () => {
    const guides = await dataOf<RoleSummary>(
      await mutate(
        server,
        "roles.create",
        { name: "मार्गदर्शक", permissions: [{ permission: "departures:view" }] },
        owner,
      ),
    );
    expect(guides.key).toMatch(/^role-[0-9a-f]{6}$/);
    const guide = await addStaff(server, agency, { username: "guide", roleKey: guides.key });
    const jar = await signedInStaff(server, agency, guide);
    expect((await query(server, "staff.list", jar)).status).toBe(403);

    const updated = await mutate(
      server,
      "roles.update",
      { key: guides.key, permissions: [{ permission: "staff:manage" }] },
      owner,
    );
    expect(await dataOf<RoleSummary>(updated)).toMatchObject({
      memberCount: 1,
      permissions: [{ permission: "staff:manage", scope: null }],
    });
    expect((await query(server, "staff.list", jar)).status).toBe(200);
  });

  it("explains invalid permissions", async () => {
    const unknown = await mutate(
      server,
      "roles.create",
      { name: "Visas", permissions: [{ permission: "visas:apply" }] },
      owner,
    );
    expect(await refusalOf(unknown)).toEqual({ status: 400, reason: "UNKNOWN_PERMISSION" });
    const noScope = await mutate(
      server,
      "roles.create",
      { name: "Viewers", permissions: [{ permission: "leads:view" }] },
      owner,
    );
    expect(await refusalOf(noScope)).toEqual({ status: 400, reason: "SCOPE_REQUIRED" });
  });

  it("never changes the Owner role", async () => {
    expect(await refusalOf(await mutate(server, "roles.update", { key: "org-owner", permissions: [] }, owner))).toEqual(
      {
        status: 403,
        reason: "OWNER_ROLE_IS_FIXED",
      },
    );
  });

  it("refuses to delete a role staff have, and deletes one they don't", async () => {
    expect(await refusalOf(await mutate(server, "roles.delete", { key: "sales" }, owner))).toEqual({
      status: 409,
      reason: "ROLE_IN_USE",
    });
    expect((await mutate(server, "roles.delete", { key: "accounts" }, owner)).status).toBe(200);
    const names = (await dataOf<RoleSummary[]>(await query(server, "roles.list", owner))).map((role) => role.name);
    expect(names).not.toContain("Accounts");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api-server test`

Expected: the 29 earlier tests pass. The new ones fail with 404 ("No procedure found on path …") for `staff.*` and `roles.*`.

- [ ] **Step 3: Write the routers**

`packages/api/src/routers/staff.ts`:
```ts
// Staff management (spec 6.3). Every procedure needs staff:manage and reads the session from the database, so an
// admin whose sessions were revoked is stopped at once (spec 6.4). The identity module enforces who may change whom.
import {
  createStaffInput,
  removeStaffInput,
  resetStaffPasswordInput,
  staffMember,
  updateStaffRoleInput,
} from "@travel-crm/contracts/identity";
import { z } from "zod";
import { freshProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const staffManager = freshProcedure.requires("staff:manage");

export const staffRouter = router({
  list: staffManager.output(z.array(staffMember)).query(({ ctx }) => ctx.identity.staff.list(ctx.member)),

  create: staffManager
    .input(createStaffInput)
    .output(staffMember)
    .mutation(({ ctx, input }) => ctx.identity.staff.create(ctx.member, input)),

  updateRole: staffManager
    .input(updateStaffRoleInput)
    .output(staffMember)
    .mutation(({ ctx, input }) => ctx.identity.staff.updateRole(ctx.member, input)),

  /** Sets a temporary password, signs the person out everywhere, and makes them choose a new one at sign-in. */
  resetPassword: staffManager.input(resetStaffPasswordInput).mutation(async ({ ctx, input }) => {
    await ctx.identity.staff.resetPassword(ctx.member, input);
  }),

  /** Removes the person: their sessions end and their email and username are released (ADR 0007). */
  remove: staffManager.input(removeStaffInput).mutation(async ({ ctx, input }) => {
    await ctx.identity.staff.remove(ctx.member, input);
  }),
});
```

`packages/api/src/routers/roles.ts`:
```ts
// Roles and the permission catalog (spec 6.5). Any member may see them; changing them needs roles:manage. Role
// procedures read the session from the database (spec 6.4). The identity module stops anyone granting more than they hold.
import {
  createRoleInput,
  deleteRoleInput,
  permissionCatalogEntry,
  roleSummary,
  updateRoleInput,
} from "@travel-crm/contracts/identity";
import { permissionCatalog } from "@travel-crm/domain/identity";
import { z } from "zod";
import { freshProcedure, orgProcedure } from "../procedures.js";
import { router } from "../trpc.js";

const roleManager = freshProcedure.requires("roles:manage");

export const rolesRouter = router({
  list: freshProcedure.output(z.array(roleSummary)).query(({ ctx }) => ctx.identity.roles.list(ctx.member)),

  /** Every permission a role can grant, for the roles editor. */
  permissionCatalog: orgProcedure.output(z.array(permissionCatalogEntry)).query(() => permissionCatalog),

  create: roleManager
    .input(createRoleInput)
    .output(roleSummary)
    .mutation(({ ctx, input }) => ctx.identity.roles.create(ctx.member, input)),

  update: roleManager
    .input(updateRoleInput)
    .output(roleSummary)
    .mutation(({ ctx, input }) => ctx.identity.roles.update(ctx.member, input)),

  /** Deletes a role nobody has (soft delete: its name and key become free). */
  delete: roleManager.input(deleteRoleInput).mutation(async ({ ctx, input }) => {
    await ctx.identity.roles.delete(ctx.member, input);
  }),
});
```

Replace `packages/api/src/routers/app-router.ts`:
```ts
// Every tRPC router the api serves at /api/trpc. The web app imports the AppRouter type only, never this code.
import { router } from "../trpc.js";
import { meRouter } from "./me.js";
import { platformRouter } from "./platform.js";
import { rolesRouter } from "./roles.js";
import { settingsRouter } from "./settings.js";
import { staffRouter } from "./staff.js";

export const appRouter = router({
  me: meRouter,
  staff: staffRouter,
  roles: rolesRouter,
  settings: settingsRouter,
  platform: platformRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm --filter @travel-crm/api typecheck && pnpm --filter @travel-crm/api-server test`

Expected: 48 tests pass. These pin Review Focus 1, 2 and 3:
- "cannot take over the Owner's account by resetting its password";
- "removes someone at once: no access on the next request, no sign-in, and their email is free again";
- "refuses staff with neither email nor username, or a placeholder address";
- "lists the organization's staff, without placeholder addresses, to staff:manage only".

- [ ] **Step 5: Document the package**

`packages/api/README.md`:
```markdown
# @travel-crm/api

The tRPC routers. Routers are thin: validate with `@travel-crm/contracts`, run the request checks, call the domain.
The web app imports the `AppRouter` type only.

## Procedure builders (`src/procedures.ts`)

| Builder                              | Checks (spec 6.5)                                              | Use for                      |
| ------------------------------------ | -------------------------------------------------------------- | ---------------------------- |
| `publicProcedure`                    | none                                                           | nothing yet                  |
| `protectedProcedure`                 | 1, from the 5-minute session cookie                            | `me.get`                     |
| `orgProcedure`, `.requires("x:y")`   | 1, membership and pending steps read from the database, then 4 | organization data            |
| `freshProcedure`, `.requires("x:y")` | the same, with the session itself read from the database       | money, roles, exports, staff |
| `platformProcedure`                  | 1 from the database, user role `admin`, no membership          | the platform console         |

Checks 2 (organization active) and 3 (module on the plan) arrive in plan 4 inside these builders, so procedures don't
change. Check 5 (own or all records) is the handler's job, with `scopeFilter()` from `@travel-crm/domain/identity`.

## Errors

A `DomainError` becomes the matching tRPC status (`NOT_FOUND` 404, `FORBIDDEN` 403, `CONFLICT` 409, `VALIDATION` 400,
`LIMIT_REACHED` and `FEATURE_LOCKED` 403). The response's `error.data` carries `domainCode` and `reason` for the web
app's translated message. Unexpected errors say only "Something went wrong".

## Routers

`me`, `staff`, `roles`, `settings`, `platform`. Add a router in `src/routers/` and list it in `app-router.ts`.
```

- [ ] **Step 6: Check and commit**

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm check`. Expected: green.

```bash
cd /Users/ak/personal/travel-crm
git add packages/api apps/api
git commit -m "feat(api): add the staff and roles routers"
```

---

### Task 12: Repository conventions, and a clean-clone run

`CLAUDE.md` gains the identity, permission and soft-delete rules and the new repo map; `README.md` says how to run the api. Then a fresh clone proves the lockfile, approved builds, generated client, three test databases and import rules all work from nothing, the way CI runs them.

**Files:**
- Modify: `CLAUDE.md`, `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the conventions later plans follow. Plan 3 builds on `DomainError`, the procedure builders and soft delete; plan 4 on `seedStarterRoles`, `createOrganizationOwner` and the insertion points for checks 2 and 3.

- [ ] **Step 1: Update `CLAUDE.md`**

Replace `CLAUDE.md`:
```markdown
# travel-crm

Subscription CRM and operations platform for Indian travel agencies. Each agency is an **organization**.
The design is in `docs/superpowers/specs/`, the build plans in `docs/superpowers/plans/`, and decisions in `docs/adr/`.

## Commands (always under Node 24)

Start every shell command with `source ~/.nvm/nvm.sh && nvm use >/dev/null &&`.

| Command                                    | What it does                                             |
| ------------------------------------------ | -------------------------------------------------------- |
| `pnpm install`                             | install dependencies                                     |
| `pnpm db:up` / `pnpm db:down`              | start / stop local Postgres (Docker)                     |
| `pnpm db:migrate`                          | apply migrations to local Postgres                       |
| `pnpm --filter @travel-crm/api-server dev` | run the api on http://localhost:3001 (reads `.env`)      |
| `pnpm format`                              | format every file with Prettier                          |
| `pnpm check`                               | everything CI runs: typecheck, lint, tests, import rules |
| `pnpm --filter @travel-crm/<package> test` | one package's tests (most need Docker running)           |

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
- Never call `forOrg()` inside another `forOrg()` (it throws `NestedForOrgError`): pass the outer `tx` down.
- A foreign key between two organization tables includes `organization_id`, and so does every unique constraint on an
  organization table (except a primary key on `id`). The test suite checks both.
- Only the platform module uses `@travel-crm/db/platform` (it sees every organization).
- Better Auth's sign-in tables (user, session, account, verification, two_factor, organization, member, invitation) have no
  row-level security. Only `packages/domain/src/identity` reaches them, through `@travel-crm/db/identity`; `OrgTx` hides them.
- Outside `packages/db`, never write SQL that sets `app.org_id` (`set_config`), changes the session (`SET`, `RESET`) or
  creates temporary tables, and never use `$executeRawUnsafe`/`$queryRawUnsafe`: on a pooled connection they outlive the
  transaction. ESLint catches `set_config`, `app.org_id`, `SET ROLE`, `SET SESSION AUTHORIZATION`, `RESET ALL`/`ROLE`,
  `CREATE TEMP` and the `*Unsafe` methods.
- Soft delete (ADR 0004): tables with `deleted_at`/`deleted_by` are listed in `softDeleteModels`. Delete by updating with
  `softDeleted(userId)`; reads skip deleted rows; `withDeleted(() => …)` shows them. Unique values among live rows use
  `@@unique([...], where: { deletedAt: null })`.
- IDs are UUID v7 (`@default(uuid(7)) @db.Uuid`). Money is never a float.

## API and permission rules

- Every tRPC procedure is built from `packages/api/src/procedures.ts`:
  - `orgProcedure.requires("module:action")` for organization data;
  - `freshProcedure` (reads the session from the database) for money, roles, exports and staff management;
  - `platformProcedure` for platform staff;
  - `protectedProcedure` only for things every signed-in person may see about themselves (`me.get`).
- Inputs and outputs are Zod schemas from `@travel-crm/contracts`; every procedure has both.
- Permissions are `module:action` in `packages/domain/src/identity/permissions.ts`. Add new ones there; the Owner role
  gets them automatically. List queries for scoped views filter with `scopeFilter()` (own or all records).
- Domain modules are folders in `packages/domain/src`. Their public API is `index.ts`; other modules import only that.
  Business rule failures throw `DomainError` from `@travel-crm/domain/kernel`, which the API turns into an HTTP status.

## Repo map

- `apps/api`: the Hono server. Health check, Better Auth at `/api/auth/*`, organization-code sign-in, tRPC at `/api/trpc`.
- `packages/api`: tRPC routers and the procedure builders that run the request checks.
- `packages/contracts`: Zod schemas for every API input and output.
- `packages/domain`: business rules, one folder per module (`identity`, `kernel`).
- `packages/db`: Prisma schema, migrations, RLS, `forOrg`, soft delete, document numbers.
- `packages/tsconfig`, `packages/eslint-config`: shared settings (the ESLint config holds the raw-SQL guard).
```

- [ ] **Step 2: Update `README.md`**

Replace `README.md`:
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

Then start the api:

    pnpm --filter @travel-crm/api-server dev
    curl http://localhost:3001/health

## Where things are

- `docs/superpowers/specs/`: what we are building and why
- `docs/superpowers/plans/`: step-by-step build plans
- `docs/adr/`: decisions and their reasons
- `apps/api/`: the api server ([README](apps/api/README.md))
- `packages/api/`: tRPC routers and request checks ([README](packages/api/README.md))
- `packages/contracts/`: API input and output schemas ([README](packages/contracts/README.md))
- `packages/domain/`: business rules by module ([README](packages/domain/README.md))
- `packages/db/`: database schema, migrations and organization isolation ([README](packages/db/README.md))
- `CLAUDE.md`: the conventions every contributor follows
- `CONTRIBUTING.md`: how to make a change (branches, commits, hooks)
```

Run: `cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null && pnpm run format:check`. Expected: all files formatted.

- [ ] **Step 3: Commit**

```bash
cd /Users/ak/personal/travel-crm
git add CLAUDE.md README.md
git commit -m "docs: record the identity, permission and soft-delete conventions"
```

- [ ] **Step 4: Prove a fresh clone works, the way CI will run it**

```bash
cd /Users/ak/personal/travel-crm && source ~/.nvm/nvm.sh && nvm use >/dev/null
rm -rf /private/tmp/claude-501/-Users-ak-personal-yatrahikes-crm/20d5e186-01fd-4585-b5e1-2faab53ae574/scratchpad/travel-crm-clean && git clone -q /Users/ak/personal/travel-crm /private/tmp/claude-501/-Users-ak-personal-yatrahikes-crm/20d5e186-01fd-4585-b5e1-2faab53ae574/scratchpad/travel-crm-clean
cd /private/tmp/claude-501/-Users-ak-personal-yatrahikes-crm/20d5e186-01fd-4585-b5e1-2faab53ae574/scratchpad/travel-crm-clean && git checkout -q foundation/02-api-identity
pnpm install --frozen-lockfile && pnpm check
```
Expected: install succeeds without prompts, and `pnpm check` is green: 17 Turborepo tasks. The test counts are 69 (db), 62 (domain), 48 (api-server), 32 (eslint-config, after Task 1's review), 11 (contracts) and 3 (api). Then `rm -rf /private/tmp/claude-501/-Users-ak-personal-yatrahikes-crm/20d5e186-01fd-4585-b5e1-2faab53ae574/scratchpad/travel-crm-clean`.

If the clone's install stops on an unapproved build script, add it to `allowBuilds` with a comment saying why, the way `@trpc/server` was added in Task 10, and commit that too.

---

## After the last task

The controller (not an implementer):
1. Requests a whole-branch review.
2. Merges with `git merge --no-ff foundation/02-api-identity -m "chore: merge foundation/02-api-identity (API and identity)"`.
3. Carries these forward:
   - **Plan 3:**
     - The brand package replaces the product name in `apps/api/src/environment.ts` (`appName`). It is the name authenticator apps show.
     - The email adapter turns on Better Auth's password reset (`emailAndPassword.sendResetPassword`); `onPasswordReset` already clears `must_change_password`.
     - The audit log records staff removals, role changes and impersonation.
     - Translated messages come from `error.data.reason`.
   - **Plan 4:**
     - Onboarding calls `identity.seedStarterRoles` and `identity.createOrganizationOwner`.
     - Checks 2 and 3 go into `memberAccessFor()` and `requires()` in `packages/api/src/procedures.ts`; entitlements map `moduleOf(permission)` to plan modules.
     - The impersonation banner reads `me.get`'s `impersonatedBy`.
     - The organization code must not change once an organization has staff (usernames contain it).
     - A DPDP purge also clears `user.former_email`.
   - **Plan 5:**
     - Rate-limit storage that spans instances (Better Auth `rateLimit.storage`).
     - `AUTH_IP_ADDRESS_HEADERS` for the chosen load balancer.
     - The web app calls `/api` on its own origin, with `TRUSTED_ORIGINS` set for development.
     - Cloudflare Turnstile after repeated sign-in failures (spec 6.2), which needs the sign-in screen.

