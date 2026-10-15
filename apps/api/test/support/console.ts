// The platform console on the test database, beside a test server whose identity it shares (so the server's sign-in
// cookies work here): its services, on in-memory storage and jobs unless a test passes real ones, its HTTP app,
// and calls to a part of its router before that part joins platformRouter.
import { createPlatformContext } from "@travel-crm/api/platform";
import { createDatabase } from "@travel-crm/db";
import { createPlatformServices, type PlatformServices } from "@travel-crm/domain/platform";
import {
  createMemoryJobAdministration,
  createMemoryJobQueue,
  type JobAdministration,
  type JobQueue,
} from "@travel-crm/integrations/jobs";
import { createMemoryStorage, type ObjectStorage } from "@travel-crm/integrations/storage";
import type { AnyTRPCRouter } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Hono } from "hono";
import { inject } from "vitest";
import { createConsoleApp } from "../../src/console-app.js";
import { CookieJar } from "./cookie-jar.js";
import { ORIGIN, signInByEmail, type TestServer } from "./test-server.js";

export interface TestConsole {
  app: Hono;
  services: PlatformServices;
  /** What the console logged: nothing, unless a call failed unexpectedly. */
  lines: string[];
  close(): Promise<void>;
}

export interface TestConsoleOptions {
  storage?: ObjectStorage;
  queue?: JobQueue;
  jobs?: JobAdministration;
}

export function createTestConsole(server: TestServer, options: TestConsoleOptions = {}): TestConsole {
  const urls = inject("dbUrls");
  const db = createDatabase(urls.runtime, { maxConnections: 2 });
  const lines: string[] = [];
  const services = createPlatformServices({
    platformDatabaseUrl: urls.platform,
    maxConnections: 2,
    db,
    identity: server.identity,
    storage: options.storage ?? createMemoryStorage(),
    queue: options.queue ?? createMemoryJobQueue(),
    jobs: options.jobs ?? createMemoryJobAdministration(),
    log: (line) => lines.push(line),
  });
  return {
    app: createConsoleApp(services, (line) => lines.push(line)),
    services,
    lines,
    close: async () => {
      await services.platformDb.disconnect();
      await db.disconnect();
    },
  };
}

/** A console query through the console app, as the console screens call it: a GET with the input in the URL. */
export async function consoleQuery(
  testConsole: TestConsole,
  path: string,
  jar?: CookieJar,
  input?: unknown,
): Promise<Response> {
  const search = input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  return testConsole.app.request(`/api/platform/trpc/${path}${search}`, {
    headers: jar ? { cookie: jar.header } : {},
  });
}

/** A console mutation through the console app: a JSON POST from the trusted origin. */
export async function consoleMutate(
  testConsole: TestConsole,
  path: string,
  input: unknown,
  jar?: CookieJar,
): Promise<Response> {
  return testConsole.app.request(`/api/platform/trpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...(jar ? { cookie: jar.header } : {}) },
    body: JSON.stringify(input),
  });
}

/**
 * Calls `path` on `router`, a part of the console's router that hasn't joined platformRouter yet, with the console's
 * context: queries as GETs, mutations as JSON POSTs.
 */
export async function callConsoleRouter(
  testConsole: TestConsole,
  router: AnyTRPCRouter,
  path: string,
  call: { jar?: CookieJar; input?: unknown; mutation?: boolean } = {},
): Promise<Response> {
  const cookie = call.jar ? { cookie: call.jar.header } : {};
  const request = call.mutation
    ? new Request(`${ORIGIN}/api/platform/trpc/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, ...cookie },
        body: JSON.stringify(call.input),
      })
    : new Request(
        `${ORIGIN}/api/platform/trpc/${path}${call.input === undefined ? "" : `?input=${encodeURIComponent(JSON.stringify(call.input))}`}`,
        { headers: cookie },
      );
  return fetchRequestHandler({
    endpoint: "/api/platform/trpc",
    req: request,
    router,
    createContext: ({ req, resHeaders }) => createPlatformContext(testConsole.services, req, resHeaders),
  });
}

export interface TestPlatformStaff {
  userId: string;
  email: string;
  password: string;
  jar: CookieJar;
}

/** Platform staff at the given level, signed in through the test server; their temporary password already replaced. */
export async function signedInPlatformStaff(
  server: TestServer,
  level: "support" | "super-admin" = "support",
  options: { mustChangePassword?: boolean } = {},
): Promise<TestPlatformStaff> {
  const email = `${level}-${crypto.randomUUID()}@platform.test`;
  const password = "platform-password-1";
  const hash = await (await server.identity.auth.$context).password.hash(password);
  const user = await server.platform.user.create({
    data: {
      name: level === "support" ? "Platform support" : "Platform super admin",
      email,
      role: level === "support" ? "admin" : "super-admin",
      mustChangePassword: options.mustChangePassword ?? false,
    },
  });
  await server.platform.account.create({
    data: { userId: user.id, accountId: user.id, providerId: "credential", password: hash },
  });
  const jar = new CookieJar();
  const response = await signInByEmail(server, jar, email, password);
  if (!response.ok) throw new Error(`platform staff sign-in failed with ${String(response.status)}`);
  return { userId: user.id, email, password, jar };
}
