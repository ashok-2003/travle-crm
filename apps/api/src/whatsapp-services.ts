// The WhatsApp services, built once per process when the three settings are set (ADR 0035): the real MSG91 provider, and the
// inbox module's dependencies. Null when WhatsApp is off: no webhook route exists, nothing is sent, and the inbox says so.
import type { Database } from "@travel-crm/db";
import type { Files } from "@travel-crm/domain/files";
import type { Identity } from "@travel-crm/domain/identity";
import type { InboxDependencies } from "@travel-crm/domain/inbox";
import type { RateLimiter } from "@travel-crm/domain/rate-limits";
import type { SubscriptionAccess } from "@travel-crm/domain/subscriptions";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import type { Logger } from "@travel-crm/integrations/logging";
import { createRealWhatsAppProvider, type WhatsAppProvider } from "@travel-crm/integrations/whatsapp";
import type { Environment } from "./environment.js";
import { whatsappSettingsOf, type WhatsAppSettings } from "./whatsapp-settings.js";

export interface WhatsAppServices {
  settings: WhatsAppSettings;
  provider: WhatsAppProvider;
}

export function createWhatsAppServices(environment: Environment): WhatsAppServices | null {
  const settings = whatsappSettingsOf(environment);
  if (settings === null) return null;
  return {
    settings,
    provider: createRealWhatsAppProvider({
      authKey: settings.authKey,
      ...(settings.testServerUrl === null ? {} : { baseUrl: settings.testServerUrl }),
    }),
  };
}

/** What the inbox module's webhook work, copier and jobs run on. */
export function inboxDependenciesOf(
  whatsapp: WhatsAppServices | null,
  parts: {
    db: Database;
    files: Files;
    queue: JobQueue;
    logger: Logger;
    limiter: Pick<RateLimiter, "hit">;
    identity: Pick<Identity, "firstOwner" | "leadWorkers" | "organizationProfile" | "membersHolding">;
    subscriptions: Pick<SubscriptionAccess, "entitlementsOf">;
  },
): InboxDependencies {
  return {
    ...parts,
    provider: whatsapp?.provider ?? null,
    managers: (organizationId) => parts.identity.membersHolding(organizationId, "leads:assign"),
  };
}
