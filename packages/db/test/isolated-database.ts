// A database of one test file's own, copied from the migrated test database before any test ran. For tests of rules
// that count across the whole database (the last super admin, the command that makes the first one), which other
// files' rows would upset: test files share one database and run at once.
import { randomUUID } from "node:crypto";
import pg from "pg";
import { TEMPLATE_DATABASE, type DbUrls } from "./test-databases.js";

export interface IsolatedDatabase {
  /** The same roles as the shared database's, connected to this one. */
  urls: DbUrls;
  /** Drops the database, ending whatever is still connected to it. */
  drop(): Promise<void>;
}

export async function createIsolatedDatabase(shared: DbUrls): Promise<IsolatedDatabase> {
  const name = `isolated_${randomUUID().replaceAll("-", "")}`;
  await asSuperuser(shared, async (client) => {
    // As sql/bootstrap.sql sets them up: neither the owner nor the database's own grants come with a template.
    await client.query(`CREATE DATABASE ${name} TEMPLATE ${TEMPLATE_DATABASE} OWNER app_migrator`);
    await client.query(`REVOKE TEMPORARY ON DATABASE ${name} FROM PUBLIC`);
  });
  const inDatabase = (url: string): string => {
    const parsed = new URL(url);
    parsed.pathname = `/${name}`;
    return parsed.toString();
  };
  return {
    urls: {
      superuser: inDatabase(shared.superuser),
      migrator: inDatabase(shared.migrator),
      runtime: inDatabase(shared.runtime),
      platform: inDatabase(shared.platform),
    },
    drop: () =>
      asSuperuser(shared, async (client) => {
        await client.query(`DROP DATABASE ${name} WITH (FORCE)`);
      }),
  };
}

async function asSuperuser(urls: DbUrls, work: (client: pg.Client) => Promise<void>): Promise<void> {
  const client = new pg.Client({ connectionString: urls.superuser });
  await client.connect();
  try {
    await work(client);
  } finally {
    await client.end();
  }
}
