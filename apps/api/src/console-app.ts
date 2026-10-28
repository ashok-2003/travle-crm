// The platform console's HTTP app (spec 7), served by the console process: a health check, and the console's tRPC at
// /api/platform/trpc, which the load balancer (and the web app's development server) routes here. Platform staff sign
// in through the api's /api/auth like everyone else; the console reads the same session cookie. It logs as the api
// does: unexpected errors only, by names and codes. And the invite program's one public route: opening an invite's
// link makes the company's organization (only the platform role may), rate-limited by the client's address.
import { trpcServer } from "@hono/trpc-server";
import { createPlatformContext, platformRouter } from "@travel-crm/api/platform";
import { openVipInvite, type PlatformServices } from "@travel-crm/domain/platform";
import type { RateLimiter } from "@travel-crm/domain/rate-limits";
import type { Logger } from "@travel-crm/integrations/logging";
import { Hono, type Context } from "hono";
import { limitBody } from "./body-limit.js";
import { apiErrorHandler } from "./error-handler.js";
import { rateLimit } from "./rate-limit.js";
import { noteTrpcError, requestLog, type RequestLogEnv } from "./request-log.js";
import { requireTrustedJson } from "./trusted-origin.js";

/** No console call needs a bigger body. */
const BODY_LIMIT = 64 * 1024;
/** An invite's token: 24 random bytes, base64url. */
const INVITE_TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

export interface ConsolePublicRoutes {
  rateLimiter: RateLimiter;
  clientAddress: (request: Request) => string | null;
}

export function createConsoleApp(
  services: PlatformServices,
  logger: Logger,
  publicRoutes?: ConsolePublicRoutes,
): Hono<RequestLogEnv> {
  const app = new Hono<RequestLogEnv>();
  app.use("*", requestLog(logger));
  app.onError(apiErrorHandler(logger));

  app.get("/health", (c) => c.json({ status: "ok" }));
  // The same, through the web app's address, which hands on only /api/platform to the console: on Render's free plan
  // a sleeping service wakes for a call that comes that way, not for a pinger's call to its own address
  // (docs/serverless.md, step 9).
  app.get("/api/platform/health", (c) => c.json({ status: "ok" }));

  // An invite's link opened, from the web app's /vip/<token> page (same origin, JSON): a few tries a minute per address.
  if (publicRoutes !== undefined) {
    app.post(
      "/api/platform/public/vip/:token",
      requireTrustedJson(services.identity),
      limitBody(1024),
      rateLimit({
        limiter: publicRoutes.rateLimiter,
        name: "vip-invite",
        limit: 20,
        windowSeconds: 60,
        clientAddress: publicRoutes.clientAddress,
        logger,
      }),
      async (c) => {
        const token = c.req.param("token");
        if (!INVITE_TOKEN.test(token)) return c.json({ state: "closed" });
        return c.json(await openVipInvite(services, token));
      },
    );
  }

  // The same rules as the api's tRPC: posts (every call, queries included) come from the web app as JSON, and bodies
  // are small.
  app.use("/api/platform/trpc/*", requireTrustedJson(services.identity));
  app.use("/api/platform/trpc/*", limitBody(BODY_LIMIT));
  app.use("/api/platform/trpc/*", (c, next) => {
    const request = c.var.requestLog;
    return trpcServer({
      router: platformRouter,
      endpoint: "/api/platform/trpc",
      // As the api's: queries come as POSTs too, so no input is ever in a URL.
      allowMethodOverride: true,
      createContext: async ({ resHeaders }) => {
        const context = await createPlatformContext(services, c.req.raw, resHeaders);
        if (context.user !== null) request.userId = context.user.id;
        return context;
      },
      onError: ({ error, path }) => {
        // Refusals are answers, not faults: the request line carries them. A fault is logged by names, code and frames:
        // tRPC copies the cause's message into its own, and a database error's message can quote a person's data.
        noteTrpcError(request, error, path);
      },
    })(c as Context<RequestLogEnv, string>, next);
  });

  return app;
}
