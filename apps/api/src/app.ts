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
import type { SubscriptionAccess } from "@travel-crm/domain/subscriptions";
import { WHATSAPP_PROVIDER } from "@travel-crm/domain/inbox";
import { receiveWebhook, type WebhookProvider, type WebhookRequest } from "@travel-crm/domain/webhooks";
import type { AiModel } from "@travel-crm/integrations/ai";
import type { GoogleSheets } from "@travel-crm/integrations/google-sheets";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import type { Logger } from "@travel-crm/integrations/logging";
import { Hono, type Context } from "hono";
import { limitBody } from "./body-limit.js";
import { metaDeletionRoute, metaVerifyRoute } from "./meta-routes.js";
import type { WhatsAppProvider } from "@travel-crm/integrations/whatsapp";
import type { MetaServices } from "./meta-services.js";
import { apiErrorHandler } from "./error-handler.js";
import type { FormAddressSettings } from "./form-client-address.js";
import { organizationSignIn } from "./org-sign-in.js";
import { rateLimit } from "./rate-limit.js";
import { noteTrpcError, requestLog, type RequestLogEnv } from "./request-log.js";
import { shareLinkActions, shareLinkResolvers } from "./share-link-resolvers.js";
import { shareLinkRoutes, tooManyRequestsPage } from "./share-link-route.js";
import { requireTrustedJson } from "./trusted-origin.js";
import { websiteFormRoutes } from "./website-form-routes.js";
import type { Turnstile } from "./website-form-shared.js";
import { webhookRoutes } from "./webhook-route.js";
import { whatsappWebhookRoute } from "./whatsapp-routes.js";

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
  /** The Meta lead ads (ADR 0034): the verify and deletion routes and the procedures; null or absent when Meta is off. */
  meta?: MetaServices | null;
  /** The AI that drafts replies; null or absent when no key is set. */
  ai?: AiModel | null;
  /** The MSG91 provider, for the templates screens; null when WhatsApp is off. */
  whatsappProvider?: WhatsAppProvider | null;
  /** The structured log (ADR 0032): a line per request, and every unexpected error. */
  logger: Logger;
  /** BETTER_AUTH_SECRET: the website form's opened-token key is derived from it (W37). */
  authSecret: string;
  /** Where people open the web app (APP_URL): the settings screens' form links are made under it. */
  appUrl: string;
  /** Turnstile's check and the widget's public key; null or absent when the server has no keys (W39). */
  turnstile?: Turnstile | null;
  /** How the website form reads the visitor's address (W32); absent, as sign-in does. */
  formAddress?: FormAddressSettings;
}

/**
 * Per client address and minute. A customer opens a link a few times; guessing tokens needs millions of tries.
 * Providers send bursts of webhooks from a few addresses, and retry what we refuse. MSG91's WhatsApp webhook is not counted
 * by this limit at all (any 4xx pauses it for every agency): its route limits only callers that fail the secrets check.
 */
const publicLimits = {
  shareLinks: { limit: 30, windowSeconds: 60 },
  webhooks: { limit: 600, windowSeconds: 60 },
  // Callers without MSG91's secrets (a mistyped paste, a scanner): they are refused 401, and past this, 429.
  whatsappStrangers: { limit: 60, windowSeconds: 60 },
  // Meta's data deletion callback comes a few times in a year, from Meta's addresses.
  metaDeletion: { limit: 60, windowSeconds: 60 },
};

/** No sign-in or tRPC call needs a bigger body; the cap stops a client making the server read a huge one. */
const BODY_LIMIT = 64 * 1024;

export function createApp(dependencies: ServerDependencies): Hono<RequestLogEnv> {
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
    meta = null,
    whatsappProvider = null,
    ai = null,
    logger,
    authSecret,
    appUrl,
    turnstile = null,
    formAddress = { headerNames: ["x-forwarded-for"], trustedProxies: [], proxyHops: null },
  } = dependencies;
  const app = new Hono<RequestLogEnv>();
  app.use("*", requestLog(logger));
  app.onError(apiErrorHandler(logger));

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
  // Built for each request, so its context and its errors can tell the request's line who called and what failed.
  app.use("/api/trpc/*", (c, next) => {
    const request = c.var.requestLog;
    return trpcServer({
      router: appRouter,
      endpoint: "/api/trpc",
      // The web app sends queries as POSTs too, so their input (a phone, a searched name) is never in a URL. They stay
      // queries: what a call does, for the lifecycle, is its procedure's type, not the HTTP method.
      allowMethodOverride: true,
      createContext: async ({ resHeaders }) => {
        const context = await createContext(
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
            appUrl,
            meta: meta?.dependencies ?? null,
            whatsappConfigured: webhookProviders.some((candidate) => candidate.name === WHATSAPP_PROVIDER),
            whatsappProvider,
            ai,
            // An import's Add waits while a sheet's check is saving rows (S26).
            addGuards: [assertNoSheetCheckSaving],
          },
          c.req.raw,
          resHeaders,
        );
        if (context.user !== null) request.userId = context.user.id;
        if (context.session?.activeOrganizationId) request.organizationId = context.session.activeOrganizationId;
        return context;
      },
      onError: ({ error, path }) => {
        // Refusals (401, 403, 404...) are answers, not faults: the request line carries them. A fault is logged by
        // names, code and frames: tRPC copies the cause's message into its own, and a Prisma message can quote values.
        noteTrpcError(request, error, path);
      },
    })(c as Context<RequestLogEnv, string>, next);
  });

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
      logger,
    }),
  );
  app.route(
    "/p",
    shareLinkRoutes({
      find: (token) => findShareLink(db, token),
      recordOpen: (opened, visitor) => recordShareLinkOpen(db, opened, visitor),
      resolvers: shareLinkResolvers({ db, files, identity }),
      actions: shareLinkActions({ db }),
      clientAddress,
    }),
  );
  const webhookLimit = rateLimit({
    limiter: rateLimiter,
    name: "webhooks",
    ...publicLimits.webhooks,
    clientAddress,
    logger,
  });
  // MSG91's webhook is not counted here: one answer of 4xx (a 429 as much as any) pauses it for every agency. Its route checks
  // the secrets first and limits only the callers that fail the check.
  const whatsappOn = webhookProviders.some((candidate) => candidate.name === WHATSAPP_PROVIDER);
  app.use("/webhooks/*", (c, next) =>
    whatsappOn && c.req.path.startsWith(`/webhooks/${WHATSAPP_PROVIDER}/`) ? next() : webhookLimit(c as never, next),
  );
  // Meta's callback verification (GET) answers before the generic intake, which takes POSTs only.
  if (meta !== null)
    app.route("/webhooks/meta-leads", metaVerifyRoute({ verifyToken: meta.settings.webhookVerifyToken }));
  const receive = (provider: string, request: WebhookRequest) =>
    receiveWebhook({ db, queue, providers: webhookProviders }, provider, request);
  // MSG91's webhook carries its token in the path, one segment more than the generic intake takes (ADR 0035).
  if (whatsappOn) {
    app.route(
      "/webhooks/msg91-whatsapp",
      whatsappWebhookRoute({
        receive,
        logger,
        // A caller without the secrets: counted per address, and past the limit refused with 429 (only a stranger sees one).
        strangerOverLimit: async (request) =>
          !(
            await rateLimiter.hit(
              `webhooks-whatsapp-strangers:${clientAddress(request) ?? "unknown"}`,
              publicLimits.whatsappStrangers,
            )
          ).allowed,
      }),
    );
  }
  app.route("/webhooks", webhookRoutes({ receive }));

  // Meta's data deletion callback (spec 10): the signed request is its only credential, so it is outside the trusted-origin rule.
  if (meta !== null) {
    app.use(
      "/api/meta/*",
      rateLimit({ limiter: rateLimiter, name: "meta-deletion", ...publicLimits.metaDeletion, clientAddress, logger }),
    );
    app.route(
      "/api/meta",
      metaDeletionRoute({ dependencies: meta.dependencies, appSecret: meta.settings.appSecret, appUrl }),
    );
  }

  // The website form's public routes (spec 5): no session, no cookies, no CORS; each does its own limits and checks.
  app.route(
    "/api/public",
    websiteFormRoutes({
      db,
      identity,
      profiles,
      files,
      limiter: rateLimiter,
      turnstile,
      authSecret,
      address: formAddress,
      logger,
    }),
  );

  return app;
}
