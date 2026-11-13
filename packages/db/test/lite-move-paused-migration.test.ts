// The move to the lite agent arrives paused (plan 5's final review, C1): the data migration turns on the every-agency
// pause, in the first super admin's name, so the new worker starts with nobody answering. A database with no super admin
// (a fresh one: tests, development, CI) has no agency to protect and is left as it is; a pause already on keeps its time
// and author; running it again changes nothing. Each test copies the migrated database, so the shared policy row, which
// other test files read, is never touched. The test runs the migration's own SQL, as the migrator.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { afterEach, describe, expect, inject, it } from "vitest";
import { createIsolatedDatabase, type IsolatedDatabase } from "./isolated-database.js";

const migration = path.join(import.meta.dirname, "../prisma/migrations/20261214200000_lite_move_paused/migration.sql");

interface Policy {
  ai_agent_paused_at: Date | null;
  ai_agent_paused_by: string | null;
}

describe("the move to the lite agent arrives paused", () => {
  const shared = inject("dbUrls");
  let isolated: IsolatedDatabase | undefined;
  afterEach(async () => {
    await isolated?.drop();
    isolated = undefined;
  });

  async function asMigrator<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
    if (isolated === undefined) throw new Error("No database yet");
    const client = new pg.Client({ connectionString: isolated.urls.migrator });
    await client.connect();
    try {
      return await work(client);
    } finally {
      await client.end();
    }
  }

  const runMigration = async () => {
    const sql = await readFile(migration, "utf8");
    await asMigrator((client) => client.query(sql));
  };

  const policy = () =>
    asMigrator(async (client) => {
      const { rows } = await client.query<Policy>(
        "SELECT ai_agent_paused_at, ai_agent_paused_by FROM subscription_policy WHERE id = true",
      );
      return rows[0];
    });

  /** A user as Better Auth keeps one: `role` is "super-admin" or "admin" (support) for platform staff. */
  const aUser = (options: { role: string | null; createdAt: string; banned?: boolean }) =>
    asMigrator(async (client) => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO "user" (id, name, email, role, banned, created_at, updated_at)
         VALUES ($1, 'Someone', $2, $3, $4, $5, $5)`,
        [id, `${id}@example.test`, options.role, options.banned ?? false, options.createdAt],
      );
      return id;
    });

  it("leaves a database with no super admin as it is", async () => {
    isolated = await createIsolatedDatabase(shared);
    await aUser({ role: null, createdAt: "2026-10-01T00:00:00Z" });
    await aUser({ role: "admin", createdAt: "2026-10-02T00:00:00Z" });
    await runMigration();
    expect(await policy()).toEqual({ ai_agent_paused_at: null, ai_agent_paused_by: null });
  });

  it("pauses every agency in the first super admin's name, once", async () => {
    isolated = await createIsolatedDatabase(shared);
    // Support came first, and a removed super admin is banned: neither is the pause's author.
    await aUser({ role: "admin", createdAt: "2026-10-01T00:00:00Z" });
    await aUser({ role: "super-admin", createdAt: "2026-10-02T00:00:00Z", banned: true });
    const first = await aUser({ role: "super-admin", createdAt: "2026-10-03T00:00:00Z" });
    await aUser({ role: "super-admin", createdAt: "2026-10-04T00:00:00Z" });
    await runMigration();
    const once = await policy();
    expect(once?.ai_agent_paused_by).toBe(first);
    expect(once?.ai_agent_paused_at).toBeInstanceOf(Date);
    await runMigration();
    expect(await policy()).toEqual(once);
  });

  it("keeps a pause already on, with its time and its author", async () => {
    isolated = await createIsolatedDatabase(shared);
    await aUser({ role: "super-admin", createdAt: "2026-10-03T00:00:00Z" });
    const author = randomUUID();
    const since = new Date("2026-11-10T06:00:00Z");
    await asMigrator((client) =>
      client.query("UPDATE subscription_policy SET ai_agent_paused_at = $1, ai_agent_paused_by = $2", [since, author]),
    );
    await runMigration();
    expect(await policy()).toEqual({ ai_agent_paused_at: since, ai_agent_paused_by: author });
  });
});
