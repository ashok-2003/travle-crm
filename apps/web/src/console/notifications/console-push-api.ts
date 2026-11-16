// What the console's push needs of its api (push.*, super admins only), as the agency's push api has it
// (notifications/push/push-api.ts): the VAPID public key, and saving or removing this browser's subscription.
import type { PushApi } from "@/notifications/push/push-api";
import type { createConsoleClient } from "../data/console-trpc";

export function consolePushApi(client: ReturnType<typeof createConsoleClient>): PushApi {
  return {
    publicKey: () => client.push.publicKey.query(),
    subscribe: async (subscription) => {
      await client.push.subscribe.mutate(subscription);
    },
    unsubscribe: async (endpoint) => {
      await client.push.unsubscribe.mutate({ endpoint });
    },
  };
}
