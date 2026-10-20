// The platform console's HTTP app (spec 7), served by the console process: a health check, and the console's tRPC at
// /api/platform/trpc, which the load balancer (and the web app's development server) routes here. Platform staff sign
// in through the api's /api/auth like everyone else; the console reads the same session cookie. It logs as the api
// does: unexpected errors only, by names and codes.
import { trpcServer } from "@hono/trpc-server";
import { createPlatformContext, platformRouter } from "@travel-crm/api/platform";
import type { PlatformServices } from "@travel-crm/domain/platform";
import { describeError } from "@travel-crm/integrations/jobs";
import { Hono } from "hono";
import { limitBody } from "./body-limit.js";
import { apiErrorHandler } from "./error-handler.js";
import type { ProcessLog } from "./process-log.js";
import { requireTrustedJson } from "./trusted-origin.js";

/** No console call needs a bigger body. */
const BODY_LIMIT = 64 * 1024;

export function createConsoleApp(services: PlatformServices, log: ProcessLog): Hono {
  const app = new Hono();
  app.onError(apiErrorHandler(log));

  app.get("/health", (c) => c.json({ status: "ok" }));
  // The same, through the web app's address, which hands on only /api/platform to the console: on Render's free plan
  // a sleeping service wakes for a call that comes that way, not for a pinger's call to its own address
  // (docs/serverless.md, step 9).
  app.get("/api/platform/health", (c) => c.json({ status: "ok" }));

  // The same rules as the api's tRPC: posts (every call, queries included) come from the web app as JSON, and bodies
  // are small.
  app.use("/api/platform/trpc/*", requireTrustedJson(services.identity));
  app.use("/api/platform/trpc/*", limitBody(BODY_LIMIT));
  app.use(
    "/api/platform/trpc/*",
    trpcServer({
      router: platformRouter,
      endpoint: "/api/platform/trpc",
      // As the api's: queries come as POSTs too, so no input is ever in a URL.
      allowMethodOverride: true,
      createContext: ({ resHeaders }, c) => createPlatformContext(services, c.req.raw, resHeaders),
      onError: ({ error, path }) => {
        // Refusals are answers, not faults. Only unexpected errors are logged, by names and codes: tRPC copies the
        // cause's message into its own, and a database error's message can quote a person's data.
        if (error.code === "INTERNAL_SERVER_ERROR") log(`console tRPC ${path ?? "?"} failed: ${describeError(error)}`);
      },
    }),
  );

  return app;
}
