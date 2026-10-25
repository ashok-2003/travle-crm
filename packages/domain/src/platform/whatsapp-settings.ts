// What the console reads of the MSG91 settings (a type of its own, so services.ts and whatsapp.ts do not import each other).
import type { WhatsAppProvider } from "@travel-crm/integrations/whatsapp";

/** What the console shows of the MSG91 settings: whether they are set, the webhook block, and the provider for checks. */
export interface PlatformWhatsApp {
  provider: WhatsAppProvider;
  webhookUrl: string;
  webhookHeaderName: string;
  webhookHeaderValue: string;
}
