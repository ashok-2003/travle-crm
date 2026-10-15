// Builds the api on the test database: the Hono app, its identity module, the public routes' services (on in-memory
// storage and job queue unless a test passes real ones), and a platform client for creating organizations (which the
// api itself can never do). Requests go through app.request(), so no port is opened.
import { createDatabase, type Database } from "@travel-crm/db";
import type { PlatformClient } from "@travel-crm/db/platform";
import { createPlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { createFiles, type Files } from "@travel-crm/domain/files";
import { createIdentity, type AuthSettings, type Identity } from "@travel-crm/domain/identity";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import type { WebhookProvider } from "@travel-crm/domain/webhooks";
import { createMemoryJobQueue, type JobQueue } from "@travel-crm/integrations/jobs";
import { createMemoryStorage, type ObjectStorage } from "@travel-crm/integrations/storage";
import type { Hono } from "hono";
import { inject } from "vitest";
import { createApp } from "../../src/app.js";
import { processLog, type ProcessLog } from "../../src/process-log.js";
import { clientAddressFrom } from "../../src/rate-limit.js";
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
  trustedProxies: [],
};

export interface TestServer {
  app: Hono;
  identity: Identity;
  db: Database;
  files: Files;
  platform: PlatformClient;
  close(): Promise<void>;
}

export interface TestServerOptions {
  webhookProviders?: readonly WebhookProvider[];
  /** Where files go; in memory unless given, e.g. S3 on MinIO. */
  storage?: ObjectStorage;
  /** Where the app queues jobs (webhooks to process); in memory unless given, e.g. pg-boss. */
  queue?: JobQueue;
  /** The app's log; the api's own unless given, so an unexpected error shows on stderr as "api: ...". */
  log?: ProcessLog;
}

export function createTestServer(settings: Partial<AuthSettings> = {}, options: TestServerOptions = {}): TestServer {
  const urls = inject("dbUrls");
  const identity = createIdentity({
    databaseUrl: urls.runtime,
    maxConnections: 3,
    auth: { ...testAuthSettings, ...settings },
  });
  const db = createDatabase(urls.runtime, { maxConnections: 3 });
  const files = createFiles({ db, storage: options.storage ?? createMemoryStorage() });
  const platform = createPlatformClient(urls.platform);
  const app = createApp({
    identity,
    db,
    files,
    queue: options.queue ?? createMemoryJobQueue(),
    rateLimiter: createRateLimiter(db, { keySecret: "test-server-rate-limit-secret-of-32-bytes" }),
    clientAddress: clientAddressFrom({ headerNames: ["x-forwarded-for"], trustedProxies: [] }),
    webhookProviders: options.webhookProviders ?? [],
    log: options.log ?? processLog("api"),
  });
  return {
    app,
    identity,
    db,
    files,
    platform,
    close: async () => {
      await identity.disconnect();
      await db.disconnect();
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
