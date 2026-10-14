// Proves the raw-database guard fires on code that could switch organization inside db.forOrg(), and stays quiet otherwise.
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { base, rawDatabaseAccessGuard } from "../index.js";

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

  const switchingStatements = [
    "SELECT set_config ( 'app . org_id', 'x', true)",
    "SET app  .  org_id = 'x'",
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
    expect(await rulesReportedFor("await tx.$executeRaw`" + sql + "`;")).toContain("no-restricted-syntax");
  });

  it("reports the organization setting split across lines in a template", async () => {
    expect(await rulesReportedFor("await tx.$executeRaw`SET app\n  .org_id = 'x'`;")).toContain("no-restricted-syntax");
  });

  it("does not flag ordinary SQL that merely contains SET or similar words", async () => {
    expect(await rulesReportedFor("await tx.$queryRaw`SELECT * FROM lead WHERE status = ${status}`;")).toEqual([]);
    expect(await rulesReportedFor(`const sql = "SELECT * FROM lead WHERE status = $1";`)).toEqual([]);
    expect(await rulesReportedFor("await tx.$executeRaw`UPDATE lead SET name = ${name} WHERE id = ${id}`;")).toEqual(
      [],
    );
    expect(await rulesReportedFor(`const sql = "UPDATE lead SET role_note = 'reset' WHERE id = $1";`)).toEqual([]);
  });

  it("stays part of the composed base() config", () => {
    const rules = base({ tsconfigRootDir: import.meta.dirname }).flatMap((config) => Object.keys(config.rules ?? {}));
    expect(rules).toContain("no-restricted-syntax");
    expect(rules).toContain("no-restricted-properties");
  });
});
