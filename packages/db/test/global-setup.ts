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
    // Every test file opens its own pools; the default 100 runs out as files are added.
    .withCommand(["postgres", "-c", "max_connections=300"])
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
    // `migrate diff --exit-code` exits with 2 for "differences found"; any other failure means the check didn't run.
    if ((error as { code?: unknown }).code === 2) {
      throw new Error(
        "The Prisma schema and the migrations disagree. Create the missing migration with " +
          "`pnpm --filter @travel-crm/db exec prisma migrate dev --create-only --name <change>`.",
        { cause: error },
      );
    }
    throw new Error("The drift check could not run (Prisma CLI or database connection error).", { cause: error });
  }

  project.provide("dbUrls", urls);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
