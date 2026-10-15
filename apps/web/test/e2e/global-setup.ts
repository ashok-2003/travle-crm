// Before the journeys: a throwaway Postgres with every migration (the same setup the api's tests use), then the api
// and the built web app. The journeys read where everything is from environment variables; each test makes its own
// organization, so tests never share data. Playwright doesn't tear down a setup that failed, so a failure here stops
// the database itself.
import type { TestProject } from "vitest/node";
import { setup as startDatabase, teardown as stopDatabase, type DbUrls } from "@travel-crm/db/testing/global-setup";
import { startServers } from "./support/servers";

export default async function globalSetup(): Promise<() => Promise<void>> {
  let urls: DbUrls | undefined;
  // The database setup hands its URLs to Vitest's provide(); here they are simply kept. It reads nothing else of the
  // project, which the cast relies on: a journey run would fail at once if that changed.
  const recorder = {
    provide: (key: string, value: DbUrls) => {
      if (key === "dbUrls") urls = value;
    },
  };
  await startDatabase(recorder as unknown as TestProject);
  try {
    if (!urls) throw new Error("the database setup gave no URLs");
    const servers = await startServers({ databaseUrl: urls.runtime });
    process.env.E2E_BASE_URL = servers.webUrl;
    process.env.E2E_DATABASE_URL = urls.runtime;
    process.env.E2E_PLATFORM_DATABASE_URL = urls.platform;
    return async () => {
      servers.stop();
      await stopDatabase();
    };
  } catch (error) {
    await stopDatabase();
    throw error;
  }
}
