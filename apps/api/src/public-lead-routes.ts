// The api's routes for leads from outside (release D), none of them signed in:
// - /api/public/forms/<token>: a website form's words (GET) and its answers (POST), from the hosted page or the
//   agency's own site (any origin may post: no cookie is read or set);
// - /api/public/leads/<token>: the incoming lead link other tools (Zapier, Pabbly, Make) post JSON to;
// - /api/v1/leads: the REST API, with an API key as a bearer token (leads:read lists, leads:write adds);
// - GET /webhooks/meta: Meta's check that the webhook address is ours (META_VERIFY_TOKEN).
// Every one is rate-limited per address; a refusal says only what the caller may know.
import {
  apiAddLead,
  apiListLeads,
  authenticateApiKey,
  findCapture,
  receiveCaptureLead,
} from "@travel-crm/domain/connectors";
import type { Database } from "@travel-crm/db";
import type { Identity } from "@travel-crm/domain/identity";
import type { RateLimiter } from "@travel-crm/domain/rate-limits";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { limitBody } from "./body-limit.js";
import { intakePeople } from "./intake-people.js";
import type { ProcessLog } from "./process-log.js";
import { rateLimit } from "./rate-limit.js";

export interface PublicLeadDependencies {
  db: Database;
  identity: Pick<Identity, "leadWorkers" | "firstOwner" | "organizationProfile">;
  rateLimiter: RateLimiter;
  clientAddress: (request: Request) => string | null;
  log: ProcessLog;
  metaVerifyToken: string | null;
}

/** A form's answers and a tool's lead are small; anything bigger is refused before it is read. */
const LEAD_BODY_LIMIT = 16 * 1024;

const answerOf = (c: Context, result: Awaited<ReturnType<typeof receiveCaptureLead>>) => {
  if (result.taken) return c.json(result, 201);
  return c.json(result, result.reason === "not_found" ? 404 : result.reason === "invalid" ? 422 : 409);
};

async function jsonBody(c: Context): Promise<unknown> {
  return c.req.json<unknown>().catch(() => null);
}

export function publicLeadRoutes(dependencies: PublicLeadDependencies): Hono {
  const { db, identity, rateLimiter, clientAddress, log } = dependencies;
  const intake = { db, people: intakePeople(identity) };
  const limited = (name: string, limit: number) =>
    rateLimit({ limiter: rateLimiter, name, limit, windowSeconds: 60, clientAddress, log });
  const app = new Hono();

  app.use(
    "/api/public/*",
    cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["content-type"] }),
  );
  app.use("/api/public/forms/*", limited("public-forms", 30));
  app.use("/api/public/leads/*", limited("public-leads", 120));
  app.use("/api/v1/*", limited("api-v1", 120));

  app.get("/api/public/forms/:token", async (c) => {
    const found = await findCapture(db, c.req.param("token"));
    if (found?.capture.kind !== "form") return c.json({ code: "NOT_FOUND" }, 404);
    const profile = await identity.organizationProfile(found.organizationId);
    return c.json({ organizationName: profile?.name ?? "", settings: found.capture.settings });
  });
  app.post("/api/public/forms/:token", limitBody(LEAD_BODY_LIMIT), async (c) =>
    answerOf(c, await receiveCaptureLead(intake, c.req.param("token"), await jsonBody(c))),
  );
  app.post("/api/public/leads/:token", limitBody(LEAD_BODY_LIMIT), async (c) =>
    answerOf(c, await receiveCaptureLead(intake, c.req.param("token"), await jsonBody(c))),
  );

  const keyOf = async (c: Context, scope: "leads:read" | "leads:write") => {
    const header = c.req.header("authorization") ?? "";
    const presented = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    const key = presented === "" ? null : await authenticateApiKey(db, presented);
    if (key === null) return { refusal: c.json({ code: "UNAUTHORIZED" }, 401) } as const;
    if (!key.scopes.includes(scope)) return { refusal: c.json({ code: "FORBIDDEN", needs: scope }, 403) } as const;
    return { key } as const;
  };
  app.get("/api/v1/leads", async (c) => {
    const found = await keyOf(c, "leads:read");
    if ("refusal" in found) return found.refusal;
    const limit = Number(c.req.query("limit") ?? "25");
    const before = c.req.query("before");
    const isId = before !== undefined && /^[0-9a-f-]{36}$/i.test(before);
    return c.json(
      await apiListLeads(db, found.key.organizationId, {
        limit: Number.isFinite(limit) ? limit : 25,
        ...(isId && { before }),
      }),
    );
  });
  app.post("/api/v1/leads", limitBody(LEAD_BODY_LIMIT), async (c) => {
    const found = await keyOf(c, "leads:write");
    if ("refusal" in found) return found.refusal;
    return answerOf(c, await apiAddLead(intake, found.key.organizationId, found.key.name, await jsonBody(c)));
  });

  app.get("/webhooks/meta", (c) => {
    const token = dependencies.metaVerifyToken;
    const ok = token !== null && c.req.query("hub.mode") === "subscribe" && c.req.query("hub.verify_token") === token;
    return ok ? c.text(c.req.query("hub.challenge") ?? "") : c.text("Forbidden", 403);
  });

  return app;
}
