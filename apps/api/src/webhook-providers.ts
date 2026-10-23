// The webhook providers the api accepts at /webhooks/<name> and the worker processes: Meta's lead ads when its settings
// are set (Razorpay and WhatsApp add theirs here).
import type { WebhookProvider } from "@travel-crm/domain/webhooks";
import { metaLeadsProvider } from "./meta-webhook-provider.js";
import { metaProcessDependencies } from "./meta-services.js";
import type { Services } from "./services.js";

export function webhookProvidersOf(services: Services): readonly WebhookProvider[] {
  const { meta } = services;
  if (meta === null) return [];
  return [
    metaLeadsProvider({
      appSecret: meta.settings.appSecret,
      dependencies: metaProcessDependencies(meta.dependencies, {
        identity: services.identity,
        subscriptions: services.subscriptions,
      }),
    }),
  ];
}
