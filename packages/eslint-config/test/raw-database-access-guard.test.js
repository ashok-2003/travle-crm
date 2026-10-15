// Proves the raw-database guard fires on code that could switch organization inside db.forOrg(), or query a table
// without row-level security outside its own module (the sign-in tables, webhook_event, rate_limit_counter), and stays
// quiet otherwise.
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { base, rawDatabaseAccessGuard, rawSqlSelectorsAllowing } from "../index.js";

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    { files: ["**/*.ts"], languageOptions: { parser: tseslint.parser } },
    rawDatabaseAccessGuard,
    // The modules' overrides, as packages/domain/eslint.config.js writes them.
    {
      files: ["src/identity/**", "test/identity/**"],
      rules: { "no-restricted-syntax": ["error", ...rawSqlSelectorsAllowing("signInTables")] },
    },
    {
      files: ["src/webhooks/**", "test/webhooks/**"],
      rules: { "no-restricted-syntax": ["error", ...rawSqlSelectorsAllowing("webhookEvents")] },
    },
    {
      files: ["src/rate-limits/**", "test/rate-limits/**"],
      rules: { "no-restricted-syntax": ["error", ...rawSqlSelectorsAllowing("rateLimitCounters")] },
    },
  ],
});

/** The ids of the rules that report on a TypeScript snippet, linted as a file outside the identity module by default. */
async function rulesReportedFor(source, filePath = "src/leads/sample.ts") {
  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.map((message) => message.ruleId);
}

const insideIdentity = "src/identity/sample.ts";
const insideWebhooks = "src/webhooks/sample.ts";
const insideRateLimits = "src/rate-limits/sample.ts";

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
    // Anywhere in a FROM list, and after USING.
    "SELECT r.name FROM role r, member m WHERE m.role = r.key",
    'SELECT 1 FROM lead AS l, "public"."user" u WHERE u.id = l.assigned_to_id',
    "SELECT 1 FROM lead l, role, session s",
    "UPDATE lead SET note = ${note} FROM role r, account a WHERE a.user_id = lead.assigned_to_id",
    "DELETE FROM lead USING member WHERE lead.assigned_to_id = member.user_id",
  ];

  it.each(signInTableQueries)("reports %s outside the identity module", async (sql) => {
    expect(await rulesReportedFor("await tx.$queryRaw`" + sql + "`;")).toEqual(["no-restricted-syntax"]);
    expect(await rulesReportedFor("await tx.$executeRaw`" + sql + "`;")).toEqual(["no-restricted-syntax"]);
  });

  it.each(signInTableQueries)("allows %s inside the identity module", async (sql) => {
    expect(await rulesReportedFor("await tx.$queryRaw`" + sql + "`;", insideIdentity)).toEqual([]);
  });

  const webhookEventQueries = [
    "SELECT payload FROM webhook_event WHERE id = ${id}::uuid",
    'UPDATE "public"."webhook_event" SET attempts = attempts + 1',
    "SELECT 1 FROM lead l, webhook_event w WHERE w.provider_event_id = l.source_id",
    "DELETE FROM webhook_event",
  ];
  const rateLimitCounterQueries = [
    "INSERT INTO rate_limit_counter (key, window_start, count) VALUES (${key}, ${start}, 1)",
    "DELETE FROM rate_limit_counter WHERE window_start < ${olderThan}",
    'SELECT count FROM "rate_limit_counter" WHERE key = ${key}',
  ];

  it.each(webhookEventQueries)("reports %s outside the webhooks module", async (sql) => {
    for (const filePath of [undefined, insideIdentity, insideRateLimits]) {
      expect(await rulesReportedFor("await tx.$queryRaw`" + sql + "`;", filePath)).toEqual(["no-restricted-syntax"]);
    }
  });

  it.each(webhookEventQueries)("allows %s inside the webhooks module", async (sql) => {
    expect(await rulesReportedFor("await tx.$executeRaw`" + sql + "`;", insideWebhooks)).toEqual([]);
    expect(await rulesReportedFor("await tx.$executeRaw`" + sql + "`;", "test/webhooks/sample.test.ts")).toEqual([]);
  });

  it.each(rateLimitCounterQueries)("reports %s outside the rate-limits module", async (sql) => {
    for (const filePath of [undefined, insideIdentity, insideWebhooks]) {
      expect(await rulesReportedFor("await tx.$queryRaw`" + sql + "`;", filePath)).toEqual(["no-restricted-syntax"]);
    }
  });

  it.each(rateLimitCounterQueries)("allows %s inside the rate-limits module", async (sql) => {
    expect(await rulesReportedFor("await tx.$queryRaw`" + sql + "`;", insideRateLimits)).toEqual([]);
    expect(await rulesReportedFor("await tx.$queryRaw`" + sql + "`;", "test/rate-limits/sample.test.ts")).toEqual([]);
  });

  it("keeps the sign-in tables and the organization switch refused inside the webhooks and rate-limits modules", async () => {
    for (const filePath of [insideWebhooks, insideRateLimits]) {
      expect(await rulesReportedFor('await tx.$queryRaw`SELECT * FROM "user"`;', filePath)).toEqual([
        "no-restricted-syntax",
      ]);
      expect(await rulesReportedFor('const sql = "RESET ROLE";', filePath)).toEqual(["no-restricted-syntax"]);
    }
  });

  it("does not flag tables whose names merely start like a sign-in table's", async () => {
    for (const sql of [
      "SELECT * FROM member_note",
      'SELECT * FROM "user_preference"',
      "SELECT * FROM accounts_ledger",
      "SELECT * FROM webhook_event_archive",
      "SELECT * FROM rate_limit_counter_history",
    ]) {
      expect(await rulesReportedFor("await tx.$queryRaw`" + sql + "`;")).toEqual([]);
    }
    const roleLock = 'await tx.$queryRaw`SELECT id FROM "role" WHERE key = ${key} AND deleted_at IS NULL FOR SHARE`;';
    expect(await rulesReportedFor(roleLock)).toEqual([]);
  });

  it("does not flag sign-in names used as columns, in FROM lists or after USING", async () => {
    for (const sql of [
      "SELECT * FROM attachment WHERE organization_id = ${organizationId}::uuid",
      "SELECT a.id FROM attachment a, lead l WHERE a.user_id = l.assigned_to_id",
      "SELECT * FROM lead JOIN note USING (user_id)",
      "DELETE FROM lead USING lead_archive WHERE lead.id = lead_archive.id",
      "SELECT id FROM lead ORDER BY created_at, organization_id",
    ]) {
      expect(await rulesReportedFor("await tx.$queryRaw`" + sql + "`;")).toEqual([]);
    }
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
