// POST /webhooks/<provider> (spec 9.7): the generic intake's HTTP side. It reads the raw body, since signatures are
// computed over the exact bytes sent, and answers with the intake's status and an empty body. A provider that signs
// nothing is posted to at /webhooks/<provider>/<token> (Brevo): the token reaches its `verify` as an internal header.
import { createHash, timingSafeEqual } from "node:crypto";
import type { WebhookReceipt, WebhookRequest } from "@travel-crm/domain/webhooks";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";

/** Providers send small JSON events; anything larger is refused before it is read in full. */
export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

/** The header the route sets from the path's token, overwriting or removing anything a caller sent under the name. */
export const PATH_TOKEN_HEADER = "x-internal-path-token";

const digest = (text: string) => createHash("sha256").update(text).digest();

/** A provider's secret compared in constant time (over digests, so the length tells nothing either); none never matches. */
export const sameSecret = (given: string | null, expected: string): boolean =>
  given !== null && timingSafeEqual(digest(given), digest(expected));

export interface WebhookRouteOptions {
  /** receiveWebhook from @travel-crm/domain/webhooks, bound to the database, job queue and providers. */
  receive: (providerName: string, request: WebhookRequest) => Promise<WebhookReceipt>;
}

/** The /webhooks routes, to mount with app.route("/webhooks", webhookRoutes(...)) behind a rate limit. */
export function webhookRoutes(options: WebhookRouteOptions): Hono {
  const app = new Hono();
  const limit = bodyLimit({ maxSize: MAX_WEBHOOK_BODY_BYTES, onError: (c) => c.json({}, 413) });

  const receive = async (c: Context, provider: string, token: string | null) => {
    const headers = new Headers(c.req.raw.headers);
    if (token === null) headers.delete(PATH_TOKEN_HEADER);
    else headers.set(PATH_TOKEN_HEADER, token);
    const receipt = await options.receive(provider, { headers, rawBody: await c.req.text() });
    return c.json({}, receipt.status);
  };

  app.post("/:provider", limit, (c) => receive(c, c.req.param("provider"), null));
  app.post("/:provider/:token", limit, (c) => receive(c, c.req.param("provider"), c.req.param("token")));

  return app;
}
