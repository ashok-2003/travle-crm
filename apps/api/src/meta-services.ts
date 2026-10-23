// The Meta lead ads' services, built once per process when the five settings are set (ADR 0034): the real Graph adapter,
// the box that seals Page tokens, and the module's dependencies on the process's database, rate limiter and log. Null
// when Meta is off: nothing of it runs, and the Lead sources page says so.
import type { Database } from "@travel-crm/db";
import type { MetaProcessDependencies } from "@travel-crm/domain/crm";
import type { Identity } from "@travel-crm/domain/identity";
import type { MetaDependencies } from "@travel-crm/domain/meta-leads";
import type { RateLimiter } from "@travel-crm/domain/rate-limits";
import type { SubscriptionAccess } from "@travel-crm/domain/subscriptions";
import type { Logger } from "@travel-crm/integrations/logging";
import { createRealMetaGraph } from "@travel-crm/integrations/meta-graph";
import { createAesSecretBox } from "@travel-crm/integrations/secret-box";
import type { Environment } from "./environment.js";
import { metaSettingsOf, type MetaSettings } from "./meta-settings.js";

export interface MetaServices {
  settings: MetaSettings;
  dependencies: MetaDependencies;
}

/** Where Facebook sends the browser back after its dialog: a page of the web app (spec 3.2). */
export const metaCallbackPath = "/settings/lead-sources/meta/callback";

export function createMetaServices(
  environment: Environment,
  parts: { db: Database; rateLimiter: RateLimiter; logger: Logger },
): MetaServices | null {
  const settings = metaSettingsOf(environment);
  if (settings === null) return null;
  const graph = createRealMetaGraph({
    appId: settings.appId,
    appSecret: settings.appSecret,
    ...(settings.graphTestServerUrl === null ? {} : { baseUrl: settings.graphTestServerUrl }),
  });
  return {
    settings,
    dependencies: {
      db: parts.db,
      graph,
      secretBox: createAesSecretBox(settings.tokenKeys),
      limiter: parts.rateLimiter,
      login: {
        appId: settings.appId,
        appSecret: settings.appSecret,
        loginConfigId: settings.loginConfigId,
        redirectUri: `${environment.APP_URL.replace(/\/$/, "")}${metaCallbackPath}`,
      },
      logger: parts.logger,
    },
  };
}

/** What the webhook's work, the catch-up and Check again run on: the module's dependencies and the agency's facts. */
export function metaProcessDependencies(
  meta: MetaDependencies,
  parts: {
    identity: Pick<Identity, "firstOwner" | "leadWorkers" | "organizationProfile">;
    subscriptions: Pick<SubscriptionAccess, "entitlementsOf">;
  },
): MetaProcessDependencies {
  return {
    ...meta,
    ownerOf: (organizationId) => parts.identity.firstOwner(organizationId),
    identity: parts.identity,
    subscriptions: parts.subscriptions,
  };
}
