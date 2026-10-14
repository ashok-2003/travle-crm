// Proves the raw-database guard fires on code that could switch organization inside db.forOrg() or query the sign-in
// tables outside the identity module, and stays quiet otherwise.
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { base, organizationSwitchSelectors, rawDatabaseAccessGuard } from "../index.js";

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    { files: ["**/*.ts"], languageOptions: { parser: tseslint.parser } },
    rawDatabaseAccessGuard,
    // The identity module's override, as packages/domain/eslint.config.js writes it.
    { files: ["src/identity/**"], rules: { "no-restricted-syntax": ["error", ...organizationSwitchSelectors] } },
  ],
});

/** The ids of the rules that report on a TypeScript snippet, linted as a file outside the identity module by default. */
async function rulesReportedFor(source, filePath = "src/leads/sample.ts") {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.map((message) => message.ruleId);
}

const insideIdentity = "src/identity/sample.ts";

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

  const switchingStatements = [
    "SELECT set_config ( 'app . org_id', 'x', true)",
    "SET app  .  org_id = 'x'",
    "SET ROLE app_platform",
    "SET LOCAL ROLE x",
    "SET ROLE postgres",
    "set local role postgres",
    "SET SESSION ROLE postgres",
    "SET SESSION AUTHORIZATION postgres",
    "RESET ALL",
    "reset role",
    "CREATE TEMP TABLE scratch (id int)",
    "create temporary table scratch (id int)",
  ];

  it.each(switchingStatements)("reports %s in a plain string", async (sql) => {
    expect(await rulesReportedFor('const sql = "' + sql + '";')).toEqual(["no-restricted-syntax"]);
  });

  it.each(switchingStatements)("reports %s in a tagged template", async (sql) => {
    expect(await rulesReportedFor("await tx.$executeRaw`" + sql + "`;")).toEqual(["no-restricted-syntax"]);
  });

  it("reports the organization setting split across lines in a template", async () => {
    expect(await rulesReportedFor("await tx.$executeRaw`SET app\n  .org_id = 'x'`;")).toEqual(["no-restricted-syntax"]);
  });

  it("does not flag a column called role being assigned", async () => {
    for (const sql of ["UPDATE lead SET role = $1", "update lead set role=$1"]) {
      expect(await rulesReportedFor('const sql = "' + sql + '";')).toEqual([]);
      expect(await rulesReportedFor("await tx.$executeRaw`" + sql + "`;")).toEqual([]);
    }
    // member is a sign-in table, so only the identity module may assign its role column.
    for (const sql of ["UPDATE member SET role = $1", "update member set role=$1"]) {
      expect(await rulesReportedFor("await tx.$executeRaw`" + sql + "`;", insideIdentity)).toEqual([]);
    }
  });

  const signInTableQueries = [
    "SELECT password FROM account WHERE user_id = ${userId}",
    'SELECT * FROM "user"',
    "SELECT token FROM public.session",
    'SELECT id FROM "public"."member" WHERE organization_id = ${organizationId}::uuid',
    "SELECT lead.id FROM lead JOIN member ON member.user_id = lead.assigned_to_id",
    "UPDATE two_factor SET secret = ${secret}",
    "INSERT INTO verification (identifier, value) VALUES (${a}, ${b})",
    "update Organization set name = ${name}",
    "DELETE FROM invitation",
    "SELECT id, user_id FROM member\n    WHERE role = ${ownerKey} ORDER BY id FOR UPDATE",
  ];

  it.each(signInTableQueries)("reports %s outside the identity module", async (sql) => {
    expect(await rulesReportedFor("await tx.$queryRaw`" + sql + "`;")).toEqual(["no-restricted-syntax"]);
    expect(await rulesReportedFor("await tx.$executeRaw`" + sql + "`;")).toEqual(["no-restricted-syntax"]);
  });

  it.each(signInTableQueries)("allows %s inside the identity module", async (sql) => {
    expect(await rulesReportedFor("await tx.$queryRaw`" + sql + "`;", insideIdentity)).toEqual([]);
  });

  it("does not flag tables whose names merely start like a sign-in table's", async () => {
    for (const sql of [
      "SELECT * FROM member_note",
      'SELECT * FROM "user_preference"',
      "SELECT * FROM accounts_ledger",
    ]) {
      expect(await rulesReportedFor("await tx.$queryRaw`" + sql + "`;")).toEqual([]);
    }
    const roleLock = 'await tx.$queryRaw`SELECT id FROM "role" WHERE key = ${key} AND deleted_at IS NULL FOR SHARE`;';
    expect(await rulesReportedFor(roleLock)).toEqual([]);
  });

  it("still reports switching the organization inside the identity module", async () => {
    const switching = "await tx.$executeRaw`SELECT set_config('app.org_id', ${other}, true)`;";
    expect(await rulesReportedFor(switching, insideIdentity)).toEqual(["no-restricted-syntax"]);
    expect(await rulesReportedFor('const sql = "RESET ROLE";', insideIdentity)).toEqual(["no-restricted-syntax"]);
  });

  it("does not flag ordinary SQL that merely contains SET or similar words", async () => {
    expect(await rulesReportedFor("await tx.$queryRaw`SELECT * FROM lead WHERE status = ${status}`;")).toEqual([]);
    expect(await rulesReportedFor(`const sql = "SELECT * FROM lead WHERE status = $1";`)).toEqual([]);
    expect(await rulesReportedFor("await tx.$executeRaw`UPDATE lead SET name = ${name} WHERE id = ${id}`;")).toEqual(
      [],
    );
    expect(await rulesReportedFor(`const sql = "UPDATE lead SET role_note = 'reset' WHERE id = $1";`)).toEqual([]);
  });

  it("keeps the guard's entries in the composed base() config", () => {
    const configs = base({ tsconfigRootDir: import.meta.dirname });
    for (const rule of ["no-restricted-syntax", "no-restricted-properties"]) {
      const composed = configs.map((config) => config.rules?.[rule]).filter(Boolean);
      expect(composed.at(-1)).toEqual(rawDatabaseAccessGuard.rules[rule]);
    }
  });
});
