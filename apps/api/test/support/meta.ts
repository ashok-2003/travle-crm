// The Meta lead ads for the api's tests: the memory Graph, a box, the settings, and the module's dependencies on the server's
// database; a provider built as the api builds it; and a signed delivery to post.
import {
  leadgenDeliveryBody,
  createMemoryMetaGraph,
  signWebhookBody,
  type MemoryMetaGraph,
} from "@travel-crm/integrations/meta-graph";
import { createMemorySecretBox } from "@travel-crm/integrations/secret-box";
import type { WebhookProvider } from "@travel-crm/domain/webhooks";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import { metaLeadsProvider } from "../../src/meta-webhook-provider.js";
import { metaProcessDependencies, type MetaServices } from "../../src/meta-services.js";
import type { Identity } from "@travel-crm/domain/identity";
import type { SubscriptionAccess } from "@travel-crm/domain/subscriptions";
import type { Database } from "@travel-crm/db";
import type { MemoryLogger } from "@travel-crm/integrations/logging";

export const META_APP_SECRET = "0123456789abcdef0123456789abcdef";
export const META_VERIFY_TOKEN = "verify-token-with-at-least-32-characters-long";

export interface TestMeta {
  graph: MemoryMetaGraph;
  services: MetaServices;
  provider: WebhookProvider;
}

/** The services and a provider on the server's database; the server must then be built with `services` and `provider`. */
export function aMeta(server: {
  db: Database;
  identity: Identity;
  subscriptions: SubscriptionAccess;
  logger: MemoryLogger;
}): TestMeta {
  const graph = createMemoryMetaGraph();
  const services: MetaServices = {
    settings: {
      appId: "1234567890",
      appSecret: META_APP_SECRET,
      webhookVerifyToken: META_VERIFY_TOKEN,
      loginConfigId: "9876543210",
      tokenKeys: [],
      graphTestServerUrl: null,
    },
    dependencies: {
      db: server.db,
      graph,
      secretBox: createMemorySecretBox(),
      limiter: createRateLimiter(server.db, { keySecret: "meta-api-test-rate-limit-secret-of-32-bytes" }),
      login: {
        appId: "1234567890",
        appSecret: META_APP_SECRET,
        loginConfigId: "9876543210",
        redirectUri: "http://localhost:3000/settings/lead-sources/meta/callback",
      },
      logger: server.logger,
    },
  };
  const provider = metaLeadsProvider({
    appSecret: META_APP_SECRET,
    dependencies: metaProcessDependencies(services.dependencies, {
      identity: server.identity,
      subscriptions: server.subscriptions,
    }),
  });
  return { graph, services, provider };
}

export const signed = (body: string, secret = META_APP_SECRET) => ({
  "content-type": "application/json",
  "x-hub-signature-256": signWebhookBody(body, secret),
});

export const deliveryOf = (...changes: Parameters<typeof leadgenDeliveryBody>[0]) => leadgenDeliveryBody(changes);
