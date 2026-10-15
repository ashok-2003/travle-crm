// A webhook provider for tests: JSON bodies with an "id", signed with HMAC-SHA256 in x-example-signature, and a count
// of each event it processed.
import { createHmac } from "node:crypto";
import { hmacSha256Signature, type WebhookProvider } from "@travel-crm/domain/webhooks";

export interface CountingWebhookProvider {
  provider: WebhookProvider;
  /** The provider's event ids, once for every time one was processed. */
  processed: string[];
  /** The x-example-signature header for a body. */
  sign(body: string): string;
}

export function countingWebhookProvider(secret: string): CountingWebhookProvider {
  const processed: string[] = [];
  return {
    provider: {
      name: "example",
      keptHeaders: ["x-example-signature"],
      verify: hmacSha256Signature({ secret, header: "x-example-signature", encoding: "hex" }),
      identify: ({ rawBody }) => ({ eventId: (JSON.parse(rawBody) as { id: string }).id, eventType: "example.sent" }),
      process: (event) => {
        processed.push(event.providerEventId);
        return Promise.resolve();
      },
    },
    processed,
    sign: (body) => createHmac("sha256", secret).update(body).digest("hex"),
  };
}
