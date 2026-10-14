// POST /webhooks/<provider> (spec 9.7): the generic intake's HTTP side. It reads the raw body, since signatures are
// computed over the exact bytes sent, and answers with the intake's status and an empty body.
import type { WebhookReceipt, WebhookRequest } from "@travel-crm/domain/webhooks";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

/** Providers send small JSON events; anything larger is refused before it is read in full. */
export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

export interface WebhookRouteOptions {
  /** receiveWebhook from @travel-crm/domain/webhooks, bound to the database, job queue and providers. */
  receive: (providerName: string, request: WebhookRequest) => Promise<WebhookReceipt>;
}

/** The /webhooks routes, to mount with app.route("/webhooks", webhookRoutes(...)) behind a rate limit. */
export function webhookRoutes(options: WebhookRouteOptions): Hono {
  const app = new Hono();

  app.post("/:provider", bodyLimit({ maxSize: MAX_WEBHOOK_BODY_BYTES, onError: (c) => c.json({}, 413) }), async (c) => {
    const receipt = await options.receive(c.req.param("provider"), {
      headers: c.req.raw.headers,
      rawBody: await c.req.text(),
    });
    return c.json({}, receipt.status);
  });

  return app;
}
