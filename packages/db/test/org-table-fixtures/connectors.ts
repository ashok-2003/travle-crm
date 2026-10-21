// Isolation fixtures for the connectors module (release D): forms and lead links, API keys, webhook subscriptions and
// their deliveries, connections to other services, and the receipts of their leads.
import { randomUUID } from "node:crypto";
import type { OrgTableFixtures } from "../org-table-fixture.js";

const unique = () => randomUUID().replaceAll("-", "");

export const fixtures: OrgTableFixtures = {
  lead_capture: {
    create: (tx) => tx.leadCapture.create({ data: { kind: "link", name: "Zapier", tokenHash: unique() } }),
  },
  api_key: {
    create: (tx) =>
      tx.apiKey.create({ data: { name: "Website", prefix: "tc_1234", keyHash: unique(), scopes: ["leads:read"] } }),
  },
  webhook_subscription: {
    create: (tx) =>
      tx.webhookSubscription.create({
        data: { url: "https://example.in/hook", events: ["lead.created"], secret: unique() },
      }),
  },
  webhook_delivery: {
    create: async (tx) => {
      const subscription = await tx.webhookSubscription.create({
        data: { url: "https://example.in/hook", events: ["lead.created"], secret: unique() },
      });
      return tx.webhookDelivery.create({
        data: { subscriptionId: subscription.id, eventId: randomUUID(), eventType: "lead.created" },
      });
    },
  },
  connection: {
    create: (tx) =>
      tx.connection.create({
        data: { provider: "indiamart", externalId: unique(), name: "IndiaMART", credentials: "sealed" },
      }),
  },
  lead_receipt: {
    create: (tx) => tx.leadReceipt.create({ data: { provider: "indiamart", externalId: unique() } }),
  },
};
