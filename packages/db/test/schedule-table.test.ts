// Keeps the Sheets sync's two exemptions from row-level security honest (ADR 0031): sheet_check_schedule and
// sheet_spreadsheet_claim carry organization_id but hold ids, times and a keyed hash only. Each listed table exists and
// has organization_id; it has no row-level security and no other table is exempted by this list; its columns are exactly
// the ones named, so nobody adds personal data to an exempt table; OrgTx, IdentityTx and the identity client don't expose
// them; they are reached only inside db.withoutOrg(), through sheetSchedule and spreadsheetClaims; and the roles' grants
// are the narrow ones.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { UnscopedModelError } from "../src/errors.js";
import type { IdentityTx, OrgTx } from "../src/for-org.js";
import { createIdentityDatabase, type IdentityClient, type IdentityDatabase } from "../src/identity.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { sheetSchedule, spreadsheetClaims } from "../src/sheet-schedule.js";
import { createTestOrganization } from "./helpers.js";
import { crossOrganizationUniques, signInTables, unscopedScheduleTables } from "./org-table-fixtures.js";

/** Reaches for a model by name, as a cast past the types would. */
const reachFor = (tx: object, model: string) => Promise.resolve(Reflect.get(tx, model) as unknown);

const exactColumns: Record<string, string[]> = {
  sheet_check_schedule: ["claimed_until", "id", "next_check_at", "organization_id", "service_account_index"],
  sheet_spreadsheet_claim: ["created_at", "id", "organization_id", "spreadsheet_hash"],
};

const hash = () => new Uint8Array(Buffer.from(randomUUID().replaceAll("-", "").repeat(2), "hex"));

describe("the tables outside row-level security that carry organization_id", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let identity: IdentityDatabase;
  let organizationId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    identity = createIdentityDatabase(urls.runtime, { maxConnections: 1 });
    organizationId = await createTestOrganization(platform, "Schedule tables");
  });

  afterAll(async () => {
    await identity.disconnect();
    await db.disconnect();
    await platform.$disconnect();
  });

  it("lists exactly the two exempt tables, each existing and carrying organization_id", async () => {
    expect([...unscopedScheduleTables].sort()).toEqual(["sheet_check_schedule", "sheet_spreadsheet_claim"]);
    for (const table of unscopedScheduleTables) {
      const columns = await platform.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table} AND column_name = 'organization_id'`;
      expect(columns, table).toHaveLength(1);
    }
    expect(signInTables.filter((table) => unscopedScheduleTables.includes(table))).toEqual([]);
    expect(crossOrganizationUniques).toEqual(["sheet_spreadsheet_claim_hash"]);
  });

  it("gives them no row-level security, and no other table is exempt", async () => {
    const rows = await platform.$queryRaw<{ table_name: string; rls: boolean }[]>`
      SELECT c.relname AS table_name, c.relrowsecurity AS rls
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped
      WHERE c.relkind IN ('r', 'p')
      ORDER BY c.relname`;
    const withoutSecurity = rows.filter((row) => !row.rls).map((row) => row.table_name);
    expect(withoutSecurity.filter((name) => !signInTables.includes(name)).sort()).toEqual(
      [...unscopedScheduleTables].sort(),
    );
  });

  it("holds exactly the columns the spec names, so no personal data can be added", async () => {
    for (const table of unscopedScheduleTables) {
      const columns = await platform.$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table} ORDER BY column_name`;
      expect(
        columns.map((column) => column.column_name),
        table,
      ).toEqual(exactColumns[table]);
    }
  });

  it("hides both from OrgTx, IdentityTx and the identity client, and refuses a cast past the types", async () => {
    // Compile-time checks: `pnpm typecheck` fails if any of these types exposes them again.
    const hidden = (tx: OrgTx, identityTx: IdentityTx, client: IdentityClient): unknown[] => [
      // @ts-expect-error the schedule has no row-level security, so OrgTx leaves it out
      tx.sheetCheckSchedule,
      // @ts-expect-error nor the spreadsheet claim
      tx.sheetSpreadsheetClaim,
      // @ts-expect-error IdentityTx reaches the sign-in tables, not the schedule
      identityTx.sheetCheckSchedule,
      // @ts-expect-error nor the claim
      identityTx.sheetSpreadsheetClaim,
      // @ts-expect-error the client Better Auth uses reaches its own tables, not the schedule
      client.sheetCheckSchedule,
      // @ts-expect-error nor the claim
      client.sheetSpreadsheetClaim,
    ];
    expect(typeof hidden).toBe("function");
    for (const model of ["sheetCheckSchedule", "sheetSpreadsheetClaim"]) {
      await expect(db.forOrg(organizationId, (tx) => reachFor(tx, model))).rejects.toBeInstanceOf(UnscopedModelError);
      await expect(identity.forOrg(organizationId, (tx) => reachFor(tx, model))).rejects.toBeInstanceOf(
        UnscopedModelError,
      );
      await expect(db.withoutOrg((tx) => reachFor(tx, model))).rejects.toBeInstanceOf(UnscopedModelError);
      expect(() => Reflect.get(identity.client, model) as unknown).toThrow(UnscopedModelError);
    }
  });

  it("reaches them only in db.withoutOrg(), through sheetSchedule and spreadsheetClaims", async () => {
    await expect(db.forOrg(organizationId, (tx) => sheetSchedule(tx).count())).rejects.toBeInstanceOf(
      UnscopedModelError,
    );
    await expect(db.forOrg(organizationId, (tx) => spreadsheetClaims(tx).count())).rejects.toBeInstanceOf(
      UnscopedModelError,
    );
    const id = randomUUID();
    const spreadsheetHash = hash();
    const found = await db.withoutOrg(async (tx) => {
      await sheetSchedule(tx).create({
        data: { id, organizationId, serviceAccountIndex: 1, nextCheckAt: new Date() },
      });
      await spreadsheetClaims(tx).create({ data: { organizationId, spreadsheetHash } });
      return {
        due: await sheetSchedule(tx).count({ where: { id } }),
        claimed: await spreadsheetClaims(tx).count({ where: { spreadsheetHash } }),
      };
    });
    expect(found).toEqual({ due: 1, claimed: 1 });
    await db.withoutOrg(async (tx) => {
      await sheetSchedule(tx).update({ where: { id }, data: { claimedUntil: new Date() } });
      await sheetSchedule(tx).delete({ where: { id } });
      await spreadsheetClaims(tx).deleteMany({ where: { spreadsheetHash } });
    });
  });

  it("gives app_runtime select, insert, update and delete on the schedule, select, insert and delete on the claim, and nothing else", async () => {
    const privileges = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"];
    const by = async (table: string) => {
      const held = await Promise.all(
        privileges.map(async (privilege) => {
          const [row] = await platform.$queryRaw<{ held: boolean }[]>`
            SELECT has_table_privilege('app_runtime', ${`public.${table}`}, ${privilege}) AS held`;
          return row?.held === true ? privilege : null;
        }),
      );
      return held.filter((privilege) => privilege !== null).sort();
    };
    expect(await by("sheet_check_schedule")).toEqual(["DELETE", "INSERT", "SELECT", "UPDATE"]);
    expect(await by("sheet_spreadsheet_claim")).toEqual(["DELETE", "INSERT", "SELECT"]);
  });

  it("lets the platform role read and delete both", async () => {
    const id = randomUUID();
    const spreadsheetHash = hash();
    await db.withoutOrg(async (tx) => {
      await sheetSchedule(tx).create({
        data: { id, organizationId, serviceAccountIndex: 0, nextCheckAt: new Date() },
      });
      await spreadsheetClaims(tx).create({ data: { organizationId, spreadsheetHash } });
    });
    expect(await platform.sheetCheckSchedule.count({ where: { id } })).toBe(1);
    expect(await platform.sheetSpreadsheetClaim.count({ where: { spreadsheetHash } })).toBe(1);
    await platform.sheetCheckSchedule.delete({ where: { id } });
    await platform.sheetSpreadsheetClaim.deleteMany({ where: { spreadsheetHash } });
  });

  it("keeps the claim's hash unique across organizations", async () => {
    const other = await createTestOrganization(platform, "Other claim");
    const spreadsheetHash = hash();
    await db.withoutOrg((tx) => spreadsheetClaims(tx).create({ data: { organizationId, spreadsheetHash } }));
    await expect(
      db.withoutOrg((tx) => spreadsheetClaims(tx).create({ data: { organizationId: other, spreadsheetHash } })),
    ).rejects.toThrow(/sheet_spreadsheet_claim_hash/);
    await db.withoutOrg((tx) => spreadsheetClaims(tx).deleteMany({ where: { spreadsheetHash } }));
  });
});
