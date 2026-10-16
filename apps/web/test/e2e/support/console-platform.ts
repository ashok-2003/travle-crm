// Steps the journeys of the console's platform screens share: opening a screen as platform staff, calling the
// console's api as the screens do, finding one record on a screen as a phone or a desktop shows it, a failed job and
// a leftover schedule in pg-boss, and names of a journey's own, since plans, jobs and the platform log are the whole
// platform's, seen by every journey running at once.
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { createDatabase, type OrgTx } from "@travel-crm/db";
import { signInToConsole, type PlatformStaff } from "./console";

/** Signs platform staff in, opens a console screen and waits for its heading. */
export async function openConsoleScreen(page: Page, staff: PlatformStaff, path: string, heading: string) {
  await signInToConsole(page, staff);
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
}

/**
 * The table row on a desktop, or the list item on a phone, that holds the text, within the page's main region (a
 * toast is a list item too) or a part of it.
 */
export function recordWith(scope: Page | Locator, testInfo: TestInfo, text: string): Locator {
  const within = "goto" in scope ? scope.getByRole("main") : scope;
  return within.getByRole(testInfo.project.name === "phone" ? "listitem" : "row").filter({ hasText: text });
}

/** Calls one of the console's procedures as its screens do, signed in as the page is; returns what it answered. */
export async function consoleCall(page: Page, path: string, input: unknown): Promise<unknown> {
  const response = await page.request.post(`/api/platform/trpc/${path}`, {
    data: input,
    // The console accepts calls only from the web app's own origin, which a browser would send.
    headers: { origin: process.env.E2E_BASE_URL ?? "" },
  });
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { result: { data: unknown } }).result.data;
}

/**
 * Runs SQL on pg-boss's tables as the runtime role, the role the worker and the console run pg-boss as. The journeys
 * reach pg-boss no other way: the web app's tests can't import the jobs adapter.
 */
async function onPgBoss(work: (tx: OrgTx) => Promise<void>): Promise<void> {
  const database = createDatabase(process.env.E2E_DATABASE_URL ?? "");
  try {
    await database.withoutOrg(work);
  } finally {
    await database.disconnect();
  }
}

/**
 * A failed job on a queue of the journey's own, as pg-boss 12 leaves one after its one attempt: the queue
 * (pgboss.create_queue, as its createQueue does), then the job, failed, with ids only in its data and our own words
 * as its error. Nobody works the queue, so a retry leaves the job waiting, out of the failed list.
 */
export async function addFailedJob(queue: string): Promise<void> {
  await onPgBoss(async (tx) => {
    await tx.$executeRaw`SELECT pgboss.create_queue(${queue}, ${JSON.stringify({ policy: "standard", retryLimit: 0 })}::jsonb)`;
    await tx.$executeRaw`
      INSERT INTO pgboss.job (name, data, state, retry_limit, started_on, completed_on, output)
      VALUES (${queue}, ${JSON.stringify({ recordId: crypto.randomUUID() })}::jsonb, 'failed', 0, now(), now(),
              ${JSON.stringify({ message: "ProbeError: failed on purpose" })}::jsonb)`;
  });
}

/** A schedule a job left behind when it went from the code: pg-boss's row for a queue nothing registers. */
export async function addLeftoverSchedule(queue: string): Promise<void> {
  await onPgBoss(async (tx) => {
    await tx.$executeRaw`SELECT pgboss.create_queue(${queue}, ${JSON.stringify({ policy: "standard" })}::jsonb)`;
    await tx.$executeRaw`
      INSERT INTO pgboss.schedule (name, cron, timezone, data, options)
      VALUES (${queue}, '0 8 * * 1', 'Asia/Kolkata', '{}'::jsonb, '{}'::jsonb)`;
  });
}

/** Eight characters of this journey's own, for names no other journey running at once has. */
export function uniqueSuffix(): string {
  return crypto.randomUUID().slice(0, 8);
}
