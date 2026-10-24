// WhatsApp for the api's tests: the in-memory MSG91, the webhook provider built as the api builds it on the server's database,
// and the calls MSG91 would make to the webhook.
import type { Database } from "@travel-crm/db";
import type { Identity } from "@travel-crm/domain/identity";
import type { SubscriptionAccess } from "@travel-crm/domain/subscriptions";
import type { WebhookProvider } from "@travel-crm/domain/webhooks";
import type { Files } from "@travel-crm/domain/files";
import { createMemoryJobQueue, type MemoryJobQueue } from "@travel-crm/integrations/jobs";
import type { MemoryLogger } from "@travel-crm/integrations/logging";
import {
  createMemoryWhatsAppProvider,
  msg91Signer,
  type MemoryWhatsAppProvider,
} from "@travel-crm/integrations/whatsapp";
import { inboxDependenciesOf } from "../../src/whatsapp-services.js";
import { whatsappWebhookProvider } from "../../src/whatsapp-webhook-provider.js";

export const WHATSAPP_TOKEN = "a1b2c3d4e5".repeat(4);
export const WHATSAPP_KEY = "k9j8h7g6f5".repeat(4);
export const signer = msg91Signer({ token: WHATSAPP_TOKEN, key: WHATSAPP_KEY });

export interface TestWhatsApp {
  memory: MemoryWhatsAppProvider;
  queue: MemoryJobQueue;
  provider: WebhookProvider;
}

export function aWhatsApp(server: {
  db: Database;
  files: Files;
  identity: Identity;
  subscriptions: SubscriptionAccess;
  logger: MemoryLogger;
}): TestWhatsApp {
  const memory = createMemoryWhatsAppProvider();
  const queue = createMemoryJobQueue();
  const dependencies = inboxDependenciesOf(
    {
      settings: {
        authKey: "x".repeat(10),
        webhookToken: WHATSAPP_TOKEN,
        webhookKey: WHATSAPP_KEY,
        testServerUrl: null,
      },
      provider: memory,
    },
    {
      db: server.db,
      files: server.files,
      queue,
      logger: server.logger,
      limiter: { hit: () => Promise.resolve({ allowed: true, remaining: 100, retryAfterSeconds: 0 }) },
      identity: server.identity,
      subscriptions: server.subscriptions,
    },
  );
  return {
    memory,
    queue,
    provider: whatsappWebhookProvider({
      settings: { webhookToken: WHATSAPP_TOKEN, webhookKey: WHATSAPP_KEY },
      dependencies,
    }),
  };
}
