// Builds the api on the test database: the Hono app, its identity module, the public routes' services (on in-memory
// storage and job queue unless a test passes real ones), held to the plan limits as in services.ts, and a platform
// client for creating organizations (which the api itself can never do). Requests go through app.request(), so no
// port is opened.
import { planModules } from "@travel-crm/contracts/subscriptions";
import { createDatabase, isUniqueViolation, type Database } from "@travel-crm/db";
import type { PlatformClient } from "@travel-crm/db/platform";
import { createPlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization, type DbUrls } from "@travel-crm/db/testing";
import { createFiles, type Files } from "@travel-crm/domain/files";
import { createIdentity, type AuthSettings, type Identity, type SeatLimit } from "@travel-crm/domain/identity";
import { createProfiles } from "@travel-crm/domain/profile";
import type { SheetsHashes } from "@travel-crm/domain/sheets";
import { createRateLimiter, type RateLimiter } from "@travel-crm/domain/rate-limits";
import { createSubscriptionAccess, planLimits, type SubscriptionAccess } from "@travel-crm/domain/subscriptions";
import type { WebhookProvider } from "@travel-crm/domain/webhooks";
import type { GoogleSheets } from "@travel-crm/integrations/google-sheets";
import { createMemoryJobQueue, type JobQueue } from "@travel-crm/integrations/jobs";
import { createMemoryLogger, type MemoryLogger } from "@travel-crm/integrations/logging";
import { createSpreadsheets, type Spreadsheets } from "@travel-crm/integrations/spreadsheets";
import { createMemoryStorage, type ObjectStorage } from "@travel-crm/integrations/storage";

import { inject } from "vitest";
import { createApp } from "../../src/app.js";
import { loggerOfRequest } from "../../src/request-log.js";
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

/** The VAPID public key the test server hands the browser: any text will do until a test sends a push. */
export const TEST_PUSH_PUBLIC_KEY = "test-vapid-public-key";

export interface TestServer {
  app: ReturnType<typeof createApp>;
  /** What the app wrote to its structured log. */
  logger: MemoryLogger;
  identity: Identity;
  db: Database;
  files: Files;
  /** What a worker beside it is built from too (worker-jobs.ts): the real spreadsheets, the plans' access and seats. */
  spreadsheets: Spreadsheets;
  subscriptions: SubscriptionAccess;
  seatLimit: SeatLimit;
  platform: PlatformClient;
  /** The database it runs on, for a console beside it. */
  urls: DbUrls;
  close(): Promise<void>;
}

export interface TestServerOptions {
  webhookProviders?: readonly WebhookProvider[];
  /** Where files go; in memory unless given, e.g. S3 on MinIO. */
  storage?: ObjectStorage;
  /** Where the app queues jobs (webhooks to process); in memory unless given, e.g. pg-boss. */
  queue?: JobQueue;
  /** The app's structured log; a fresh in-memory one unless given, kept as `logger` on the server. */
  logger?: MemoryLogger;
  /** Google Sheets for the sheet sync's procedures: off unless given (with the hashes). */
  google?: GoogleSheets;
  sheetsHashes?: SheetsHashes;
  /** The rate limiter the app counts with; the real one on the database unless a file needs another. */
  rateLimiter?: RateLimiter;
  /** The database to run on: the test run's shared one, unless a file needs one of its own (createIsolatedDatabase). */
  dbUrls?: DbUrls;
}

export function createTestServer(settings: Partial<AuthSettings> = {}, options: TestServerOptions = {}): TestServer {
  const urls = options.dbUrls ?? inject("dbUrls");
  const logger = options.logger ?? createMemoryLogger();
  const db = createDatabase(urls.runtime, { maxConnections: 3 });
  const subscriptions = createSubscriptionAccess({ db });
  const limits = planLimits(subscriptions);
  const identity = createIdentity({
    databaseUrl: urls.runtime,
    maxConnections: 3,
    auth: { ...testAuthSettings, log: loggerOfRequest(logger), ...settings },
    seatLimit: limits.seats,
  });
  const files = createFiles({
    db,
    storage: options.storage ?? createMemoryStorage(),
    storageLimitBytes: limits.storageBytes,
  });
  const platform = createPlatformClient(urls.platform);
  const app = createApp({
    identity,
    subscriptions,
    profiles: createProfiles({ db }),
    db,
    files,
    pushPublicKey: TEST_PUSH_PUBLIC_KEY,
    google: options.google ?? null,
    sheetsHashes: options.sheetsHashes ?? null,
    queue: options.queue ?? createMemoryJobQueue(),
    rateLimiter:
      options.rateLimiter ?? createRateLimiter(db, { keySecret: "test-server-rate-limit-secret-of-32-bytes" }),
    clientAddress: clientAddressFrom({ headerNames: ["x-forwarded-for"], trustedProxies: [] }),
    webhookProviders: options.webhookProviders ?? [],
    logger,
  });
  return {
    app,
    logger,
    identity,
    db,
    files,
    spreadsheets: createSpreadsheets(),
    subscriptions,
    seatLimit: limits.seats,
    platform,
    urls,
    close: async () => {
      await identity.disconnect();
      await db.disconnect();
      await platform.$disconnect();
    },
  };
}

/** What Better Auth logged at `level` since the server's log was last emptied: its messages, after "auth: ". */
export function betterAuthLines(server: Pick<TestServer, "logger">, level: "warn" | "error"): string[] {
  return server.logger.entries
    .filter((entry) => entry.source === "better-auth" && entry.level === level)
    .map((entry) => entry.msg.replace(/^auth: /, ""));
}

export interface TestAgency {
  organizationId: string;
  code: string;
  owner: { userId: string; memberId: string; email: string; password: string };
}

/** The key of the plan test agencies are on. */
export const EVERYTHING_PLAN_KEY = "test-everything";

/** Every module, and room to spare: the plan test agencies are on unless a test changes their subscription. */
const everythingPlan = {
  key: EVERYTHING_PLAN_KEY,
  name: "Everything (tests)",
  monthlyPricePaise: 0,
  seatLimit: 1000,
  whatsappNumberLimit: 10,
  storageLimitBytes: 1_000_000_000_000n,
  modules: [...planModules],
};

/** The test plan's id. Test files run at once, so another may create the plan between the look and the create. */
async function everythingPlanId(platform: PlatformClient): Promise<string> {
  const existing = await platform.plan.findUnique({ where: { key: everythingPlan.key }, select: { id: true } });
  if (existing) return existing.id;
  try {
    return (await platform.plan.create({ data: everythingPlan, select: { id: true } })).id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return (await platform.plan.findUniqueOrThrow({ where: { key: everythingPlan.key }, select: { id: true } })).id;
  }
}

/** Puts the organization on the test plan, active and paid for a year from today, as onboarding would have. */
export async function subscribeToEverything(platform: PlatformClient, organizationId: string): Promise<void> {
  await platform.subscription.create({
    data: {
      organizationId,
      planId: await everythingPlanId(platform),
      billingCycle: "monthly",
      status: "active",
      statusChangedAt: new Date(),
      paidThrough: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });
}

/**
 * An organization with its starter roles, an Owner who signs in by email, and an active subscription to every module,
 * as onboarding makes them.
 */
export async function createTestAgency(server: TestServer): Promise<TestAgency> {
  const organizationId = await createTestOrganization(server.platform, "Test agency");
  await subscribeToEverything(server.platform, organizationId);
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
