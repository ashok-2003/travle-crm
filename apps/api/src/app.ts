// The api's HTTP app: a health check, Better Auth's sign-in endpoints under /api/auth, tRPC at /api/trpc, and the
// public routes that need no session: share links at /p and the webhook intake at /webhooks, both rate-limited.
import { trpcServer } from "@hono/trpc-server";
import { appRouter, createContext } from "@travel-crm/api";
import type { Database } from "@travel-crm/db";
import type { Files } from "@travel-crm/domain/files";
import type { Identity } from "@travel-crm/domain/identity";
import type { Profiles } from "@travel-crm/domain/profile";
import { assertNoSheetCheckSaving, type SheetsHashes } from "@travel-crm/domain/sheets";
import type { RateLimiter } from "@travel-crm/domain/rate-limits";
import { findShareLink, recordShareLinkOpen } from "@travel-crm/domain/share-links";
import { plansOnSale, type SubscriptionAccess } from "@travel-crm/domain/subscriptions";
import { receiveWebhook, type WebhookProvider } from "@travel-crm/domain/webhooks";
import type { GoogleSheets } from "@travel-crm/integrations/google-sheets";
import { describeError, type JobQueue } from "@travel-crm/integrations/jobs";
import { Hono } from "hono";
import { limitBody } from "./body-limit.js";
import { apiErrorHandler } from "./error-handler.js";
import { organizationSignIn } from "./org-sign-in.js";
import type { ProcessLog } from "./process-log.js";
import { rateLimit } from "./rate-limit.js";
import { shareLinkResolvers } from "./share-link-resolvers.js";
import { shareLinkRoutes, tooManyRequestsPage } from "./share-link-route.js";
import { requireTrustedJson } from "./trusted-origin.js";
import { webhookRoutes } from "./webhook-route.js";

export interface ServerDependencies {
  identity: Identity;
  /** What each organization may use today, for the request checks 2 and 3. */
  subscriptions: SubscriptionAccess;
  /** The organization's business profile, for the profile router. */
  profiles: Profiles;
  /** The public routes' database (share links, webhook events, rate-limit counters), and the procedures'. */
  db: Database;
  /** Presigned uploads and downloads for the procedures; a share link's download for its route. */
  files: Files;
  /** The VAPID public key the browser subscribes to push with (notifications.push.publicKey). */
  pushPublicKey: string;
  /** Reads Google Sheets, read only; null or absent when no service account is set (ADR 0031). */
  google?: GoogleSheets | null;
  /** Keys the spreadsheet claim; null or absent when SHEETS_HASH_KEY is not set. */
  sheetsHashes?: SheetsHashes | null;
  /** Where the webhook intake queues work for the worker. */
  queue: JobQueue;
  rateLimiter: RateLimiter;
  /** The client's address as AUTH_IP_ADDRESS_HEADERS and AUTH_TRUSTED_PROXIES say to read it. */
  clientAddress: (request: Request) => string | null;
  /** The webhook providers. The Foundation has none; later steps add theirs (Razorpay, WhatsApp). */
  webhookProviders: readonly WebhookProvider[];
  /** The process's one log: unexpected errors and warnings, a line each of ids, names and codes. */
  log: ProcessLog;
}

/**
 * Per client address and minute. A customer opens a link a few times; guessing tokens needs millions of tries.
 * Providers send bursts of webhooks from a few addresses, and retry what we refuse. WhatsApp's status callbacks can
 * pass 600 a minute during a broadcast: Meta retries on 429, so they arrive late rather than being lost, and the
 * WhatsApp step should raise this limit or count by provider when broadcasts arrive.
 */
const publicLimits = {
  shareLinks: { limit: 30, windowSeconds: 60 },
  /** The public pricing page asks once per visit at most (the web app keeps the answer for minutes). */
  plans: { limit: 60, windowSeconds: 60 },
  webhooks: { limit: 600, windowSeconds: 60 },
};

/** No sign-in or tRPC call needs a bigger body; the cap stops a client making the server read a huge one. */
const BODY_LIMIT = 64 * 1024;

export function createApp(dependencies: ServerDependencies): Hono {
  const {
    identity,
    subscriptions,
    profiles,
    db,
    files,
    pushPublicKey,
    google = null,
    sheetsHashes = null,
    queue,
    rateLimiter,
    clientAddress,
    webhookProviders,
    log,
  } = dependencies;
  const app = new Hono();
  app.onError(apiErrorHandler(log));

  app.get("/health", (c) => c.json({ status: "ok" }));

  // Members and roles are managed through our own API. Better Auth's organization endpoints would bypass our API's rules.
  app.all("/api/auth/organization/*", (c) => c.json({ code: "NOT_FOUND", message: "Not found" }, 404));
  // Our own route: it reads any body as JSON, so it needs the origin and content-type checks Better Auth would
  // otherwise apply to its own JSON-only endpoints (a cross-site form post must not sign a visitor in), and a size cap.
  app.post("/api/auth/sign-in/org", requireTrustedJson(identity), limitBody(8 * 1024), (c) =>
    organizationSignIn(identity.auth, c.req.raw),
  );
  // Registered after the route above, which answers first, so this cap is for Better Auth's own endpoints.
  app.use("/api/auth/*", limitBody(BODY_LIMIT));
  app.on(["GET", "POST"], "/api/auth/*", (c) => identity.auth.handler(c.req.raw));

  app.use("/api/trpc/*", requireTrustedJson(identity));
  app.use("/api/trpc/*", limitBody(BODY_LIMIT));
  app.use(
    "/api/trpc/*",
    trpcServer({
      router: appRouter,
      endpoint: "/api/trpc",
      // The web app sends queries as POSTs too, so their input (a phone, a searched name) is never in a URL. They stay
      // queries: what a call does, for the lifecycle, is its procedure's type, not the HTTP method.
      allowMethodOverride: true,
      createContext: ({ resHeaders }, c) =>
        createContext(
          {
            identity,
            subscriptions,
            profiles,
            db,
            files,
            pushPublicKey,
            google,
            sheetsHashes,
            rateLimiter,
            // An import's Add waits while a sheet's check is saving rows (S26).
            addGuards: [assertNoSheetCheckSaving],
          },
          c.req.raw,
          resHeaders,
        ),
      onError: ({ error, path }) => {
        // Refusals (401, 403, 404...) are answers, not faults. Only unexpected errors are logged, by names and codes:
        // tRPC copies the cause's message into its own, and a Prisma message can quote the query's values.
        if (error.code === "INTERNAL_SERVER_ERROR") log(`tRPC ${path ?? "?"} failed: ${describeError(error)}`);
      },
    }),
  );

  // No session, no cookies: these answer customers' browsers and providers' servers. The webhook route caps its own
  // body at 1 MB; share links are GETs. Over the limit, /p answers with a page (a customer's browser shows it) and
  // /webhooks with JSON.
  app.use(
    "/p/*",
    rateLimit({
      limiter: rateLimiter,
      name: "share-links",
      ...publicLimits.shareLinks,
      clientAddress,
      refusal: tooManyRequestsPage,
      log,
    }),
  );
  app.route(
    "/p",
    shareLinkRoutes({
      find: (token) => findShareLink(db, token),
      recordOpen: (opened, visitor) => recordShareLinkOpen(db, opened, visitor),
      resolvers: shareLinkResolvers({ db, files }),
      clientAddress,
    }),
  );
  // The public pricing page's plans: the same for every visitor, so caches may keep them for five minutes.
  app.use(
    "/api/public/plans",
    rateLimit({ limiter: rateLimiter, name: "public-plans", ...publicLimits.plans, clientAddress, log }),
  );
  app.get("/api/public/plans", async (c) => {
    c.header("Cache-Control", "public, max-age=300");
    return c.json(await plansOnSale(db));
  });
  app.use(
    "/webhooks/*",
    rateLimit({ limiter: rateLimiter, name: "webhooks", ...publicLimits.webhooks, clientAddress, log }),
  );
  app.route(
    "/webhooks",
    webhookRoutes({
      receive: (provider, request) => receiveWebhook({ db, queue, providers: webhookProviders }, provider, request),
    }),
  );

  return app;
}
