// The api's HTTP app: a health check, Better Auth's sign-in endpoints under /api/auth, and tRPC at /api/trpc.
import { trpcServer } from "@hono/trpc-server";
import { appRouter, createContext } from "@travel-crm/api";
import type { Identity } from "@travel-crm/domain/identity";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { organizationSignIn } from "./org-sign-in.js";
import { requireTrustedJson } from "./trusted-origin.js";

export interface ServerDependencies {
  identity: Identity;
}

export function createApp({ identity }: ServerDependencies): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  // Members and roles are managed through our own API. Better Auth's organization endpoints would bypass our API's rules.
  app.all("/api/auth/organization/*", (c) => c.json({ code: "NOT_FOUND", message: "Not found" }, 404));
  // Our own route: it reads any body as JSON, so it needs the origin and content-type checks Better Auth would
  // otherwise apply to its own JSON-only endpoints (a cross-site form post must not sign a visitor in), and a size cap.
  app.post(
    "/api/auth/sign-in/org",
    requireTrustedJson(identity),
    bodyLimit({
      maxSize: 8 * 1024,
      onError: (c) => c.json({ code: "PAYLOAD_TOO_LARGE", message: "Request is too large" }, 413),
    }),
    (c) => organizationSignIn(identity.auth, c.req.raw),
  );
  app.on(["GET", "POST"], "/api/auth/*", (c) => identity.auth.handler(c.req.raw));

  app.use("/api/trpc/*", requireTrustedJson(identity));
  app.use(
    "/api/trpc/*",
    trpcServer({
      router: appRouter,
      endpoint: "/api/trpc",
      createContext: ({ resHeaders }, c) => createContext({ identity }, c.req.raw, resHeaders),
      onError: ({ error, path }) => {
        // Refusals (401, 403, 404...) are answers, not faults. Only unexpected errors are logged.
        if (error.code === "INTERNAL_SERVER_ERROR") console.error(`tRPC ${path ?? "?"} failed`, error);
      },
    }),
  );

  return app;
}
