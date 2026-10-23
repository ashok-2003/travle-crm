// The webhook providers the api accepts at /webhooks/<name> and the worker processes: Meta's lead ads when its settings
// are set, WhatsApp's when its three are (Razorpay adds its here).
import type { WebhookProvider } from "@travel-crm/domain/webhooks";
import type { Logger } from "@travel-crm/integrations/logging";
import { metaLeadsProvider } from "./meta-webhook-provider.js";
import { metaProcessDependencies } from "./meta-services.js";
import type { Services } from "./services.js";
import { inboxDependenciesOf } from "./whatsapp-services.js";
import { whatsappWebhookProvider } from "./whatsapp-webhook-provider.js";

export function webhookProvidersOf(services: Services, logger: Logger): readonly WebhookProvider[] {
  const { meta, whatsapp } = services;
  const providers: WebhookProvider[] = [];
  if (whatsapp !== null) {
    providers.push(
      whatsappWebhookProvider({
        settings: whatsapp.settings,
        dependencies: inboxDependenciesOf(whatsapp, {
          db: services.db,
          files: services.files,
          queue: services.jobs,
          logger,
          identity: services.identity,
          subscriptions: services.subscriptions,
        }),
      }),
    );
  }
  if (meta === null) return providers;
  return [
    ...providers,
    metaLeadsProvider({
      appSecret: meta.settings.appSecret,
      dependencies: metaProcessDependencies(meta.dependencies, {
        identity: services.identity,
        subscriptions: services.subscriptions,
      }),
    }),
  ];
}
