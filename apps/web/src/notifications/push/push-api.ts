// What turning push on and off needs of the api (notifications.push.*), apart from React so signing out can use it
// too: the VAPID public key, and saving or removing this browser's subscription.
import type { PushSubscriptionInput } from "@travel-crm/contracts/notifications";
import { createApiClient, type ApiClient } from "@/data/trpc";

export interface PushApi {
  publicKey(): Promise<string>;
  subscribe(subscription: PushSubscriptionInput): Promise<void>;
  unsubscribe(endpoint: string): Promise<void>;
}

export function pushApi(client: ApiClient = createApiClient()): PushApi {
  return {
    publicKey: () => client.notifications.push.publicKey.query(),
    subscribe: async (subscription) => {
      await client.notifications.push.subscribe.mutate(subscription);
    },
    unsubscribe: async (endpoint) => {
      await client.notifications.push.unsubscribe.mutate({ endpoint });
    },
  };
}
