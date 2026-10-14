// The api's HTTP app: a health check and Better Auth's sign-in endpoints under /api/auth.
import type { Identity } from "@travel-crm/domain/identity";
import { Hono } from "hono";
import { organizationSignIn } from "./org-sign-in.js";

export interface ServerDependencies {
  identity: Identity;
}

export function createApp({ identity }: ServerDependencies): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  // Members and roles are managed through our own API. Better Auth's organization endpoints would bypass its rules.
  app.all("/api/auth/organization/*", (c) => c.json({ code: "NOT_FOUND", message: "Not found" }, 404));
  app.post("/api/auth/sign-in/org", (c) => organizationSignIn(identity.auth, c.req.raw));
  app.on(["GET", "POST"], "/api/auth/*", (c) => identity.auth.handler(c.req.raw));

  return app;
}
