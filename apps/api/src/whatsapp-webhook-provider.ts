// The webhook provider `msg91-whatsapp` (ADR 0035, spec 4.2): POST /webhooks/msg91-whatsapp/<token>. MSG91 signs nothing, so the
// path token and a static header (`x-travel-crm-key`) are the credentials, both compared in constant time; anyone without both
// gets a bare 401 and nothing is stored. Everything that does carry them is stored and answered 200, whatever the body says,
// because one 4xx pauses MSG91's webhook for every agency: `identify` never returns null. The stored payload holds personal data
// and is blanked after 7 days by the console's sweep. The worker's `process` handles each event of a batch on its own.
import { createHash, timingSafeEqual } from "node:crypto";
import { processWhatsAppBody, WHATSAPP_PROVIDER, type InboxDependencies } from "@travel-crm/domain/inbox";
import type { WebhookProvider } from "@travel-crm/domain/webhooks";
import { parseMsg91Event, WHATSAPP_WEBHOOK_HEADER } from "@travel-crm/integrations/whatsapp";
import type { WhatsAppSettings } from "./whatsapp-settings.js";

/** The header the route sets from the path, overwriting anything a caller sent under the name. */
export const PATH_TOKEN_HEADER = "x-internal-path-token";

const digest = (text: string) => createHash("sha256").update(text).digest();
const sameSecret = (given: string | null, expected: string) =>
  given !== null && timingSafeEqual(digest(given), digest(expected));

export function whatsappWebhookProvider(options: {
  settings: Pick<WhatsAppSettings, "webhookToken" | "webhookKey">;
  dependencies: InboxDependencies;
}): WebhookProvider {
  const { settings, dependencies } = options;
  return {
    name: WHATSAPP_PROVIDER,
    keptHeaders: [],
    verify: ({ headers }) =>
      // Both are always compared, so the time taken does not say which one was wrong.
      [
        sameSecret(headers.get(PATH_TOKEN_HEADER), settings.webhookToken),
        sameSecret(headers.get(WHATSAPP_WEBHOOK_HEADER), settings.webhookKey),
      ].every(Boolean),
    identify: ({ rawBody }) => {
      const first = parseMsg91Event(rawBody)[0];
      const eventType =
        first === undefined
          ? "unknown"
          : first.type === "inbound" || first.type === "echo"
            ? first.kind
            : first.type === "status"
              ? first.status
              : "unknown";
      return { eventId: createHash("sha256").update(rawBody).digest("hex").slice(0, 64), eventType };
    },
    process: (event, processing) => processWhatsAppBody(dependencies, processing, event.payload, new Date()),
  };
}
