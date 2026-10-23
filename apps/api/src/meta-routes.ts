// The two plain HTTP routes Meta calls (spec M6, section 10, ADR 0034): the webhook's GET verification, and the data
// deletion callback. Meta is the caller, so neither is under the trusted-origin rule; each is authenticated by what it
// carries alone (the verify token, the signed request), rate-limited by address like the other public routes, and says
// nothing about the app otherwise.
import { createHash, timingSafeEqual } from "node:crypto";
import { handleDeletionRequest, type MetaDependencies } from "@travel-crm/domain/meta-leads";
import { Hono } from "hono";
import { limitBody } from "./body-limit.js";

/** Both sides hashed, so the comparison takes the same time whatever the lengths. */
function sameSecret(given: string, expected: string): boolean {
  const digest = (text: string) => createHash("sha256").update(text).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/**
 * GET /webhooks/meta-leads: when the callback is saved at Meta, `hub.mode=subscribe` with our verify token is answered with
 * `hub.challenge` as plain text; anything else is a bare 403.
 */
export function metaVerifyRoute(options: { verifyToken: string }): Hono {
  const app = new Hono();
  app.get("/", (c) => {
    const mode = c.req.query("hub.mode");
    const token = c.req.query("hub.verify_token");
    const challenge = c.req.query("hub.challenge");
    if (
      mode !== "subscribe" ||
      token === undefined ||
      challenge === undefined ||
      !sameSecret(token, options.verifyToken)
    ) {
      return c.body(null, 403);
    }
    return c.text(challenge, 200);
  });
  return app;
}

/** The status page the callback's answer points at, under the web app (spec 10). */
export const metaDeletionStatusPath = "/meta/deletion";

/**
 * POST /api/meta/data-deletion: Meta sends a form body, `signed_request=<signature>.<payload>`. A request that is not Meta's
 * is a 400 with nothing done and nothing stored; a valid one disconnects the user's Pages, deletes their tokens, and answers
 * `{ url, confirmation_code }`. Body limit 4 KB.
 */
export function metaDeletionRoute(options: {
  dependencies: MetaDependencies;
  appSecret: string;
  appUrl: string;
}): Hono {
  const app = new Hono();
  app.post("/data-deletion", limitBody(4 * 1024), async (c) => {
    const form = new URLSearchParams(await c.req.text());
    const signedRequest = form.get("signed_request");
    if (signedRequest === null || signedRequest === "") return c.json({}, 400);
    const answer = await handleDeletionRequest(
      options.dependencies,
      { signedRequest, appSecret: options.appSecret, appUrl: options.appUrl },
      new Date(),
    );
    return answer === null ? c.json({}, 400) : c.json(answer, 200);
  });
  return app;
}
