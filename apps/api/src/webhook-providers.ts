// The webhook providers the api accepts at /webhooks/<name> and the worker processes, built from the process's
// services and settings: Meta's lead ads (release D) whenever META_APP_SECRET is set; Razorpay (step 6) and
// WhatsApp (release E) join here.
import { metaLeadsProvider } from "@travel-crm/domain/connectors";
import type { WebhookProvider } from "@travel-crm/domain/webhooks";
import type { Environment } from "./environment.js";
import { intakePeople } from "./intake-people.js";
import type { Services } from "./services.js";

export function webhookProvidersFor(
  environment: Pick<Environment, "META_APP_SECRET">,
  services: Pick<Services, "db" | "identity" | "connectors">,
): WebhookProvider[] {
  const providers: WebhookProvider[] = [];
  if (environment.META_APP_SECRET !== undefined) {
    providers.push(
      metaLeadsProvider({
        db: services.db,
        withoutOrg: (work) => services.db.withoutOrg(work),
        meta: services.connectors.meta,
        box: services.connectors.box,
        people: intakePeople(services.identity),
        appSecret: environment.META_APP_SECRET,
      }),
    );
  }
  return providers;
}
