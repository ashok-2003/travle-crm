// POST /webhooks/msg91-whatsapp/<token> (ADR 0035, W1, W3): the generic intake takes one path segment, so this small route
// hands the token to the provider as an internal header (overwriting any a caller sent) and then the intake runs. A body over
// 64 KB is answered 200 and dropped with a log line counting it, because a 413 would pause MSG91's webhook for every agency.
import type { WebhookReceipt, WebhookRequest } from "@travel-crm/domain/webhooks";
import type { Logger } from "@travel-crm/integrations/logging";
import { WHATSAPP_PROVIDER } from "@travel-crm/domain/inbox";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { PATH_TOKEN_HEADER } from "./whatsapp-webhook-provider.js";

export const MAX_WHATSAPP_BODY_BYTES = 64 * 1024;

export function whatsappWebhookRoute(options: {
  receive: (providerName: string, request: WebhookRequest) => Promise<WebhookReceipt>;
  logger: Logger;
  /** Counts a caller that failed the secrets check, and says whether it is over its limit. */
  strangerOverLimit: (request: Request) => Promise<boolean>;
}): Hono {
  const app = new Hono();
  app.post(
    "/:token",
    bodyLimit({
      maxSize: MAX_WHATSAPP_BODY_BYTES,
      onError: (c) => {
        options.logger.warn({}, "A WhatsApp webhook body over 64 KB was dropped");
        return c.json({}, 200);
      },
    }),
    async (c) => {
      const headers = new Headers(c.req.raw.headers);
      headers.set(PATH_TOKEN_HEADER, c.req.param("token"));
      const receipt = await options.receive(WHATSAPP_PROVIDER, { headers, rawBody: await c.req.text() });
      // Only a stranger is ever limited: anything carrying both secrets is stored and answered 200, however many there are.
      if (receipt.status === 401 && (await options.strangerOverLimit(c.req.raw))) return c.json({}, 429);
      return c.json({}, receipt.status);
    },
  );
  return app;
}
