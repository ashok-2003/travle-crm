// Outgoing webhooks (release D, the developer panel): an agency's own address hears our lead events. Each event that a
// live subscription hears becomes one delivery (keyed on the event, so a listener that runs twice queues it once),
// sent by the worker with the lead's public fields and an HMAC-SHA256 signature over the timestamp and the body, and
// retried with backoff up to five times. Every attempt's result is kept for the panel's log.
import { createHmac, randomBytes } from "node:crypto";
import {
  webhookDeliveryJob,
  webhookEventTypes,
  type WebhookDelivery,
  type WebhookEventType,
  type WebhookSubscription,
} from "@travel-crm/contracts/connectors";
import { leadEvent } from "@travel-crm/contracts/crm";
import type { Database, OrgTx } from "@travel-crm/db";
import type { HttpOut } from "@travel-crm/integrations/http-out";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import { recordAudit } from "../audit/index.js";
import { defineListener, type EventListener, type JsonValue } from "../jobs/index.js";
import { DomainError, type Actor } from "../kernel/index.js";

export const WEBHOOK_DELIVERY_QUEUE = "connectors.deliver-webhook";
/** Attempts before a delivery is given up as failed. */
export const WEBHOOK_ATTEMPTS = 5;

interface SubscriptionRow {
  id: string;
  url: string;
  events: string[];
  secret: string;
  createdAt: Date;
  disabledAt: Date | null;
}

const isEventType = (value: string): value is WebhookEventType => webhookEventTypes.some((type) => type === value);

function subscriptionOf(row: SubscriptionRow): WebhookSubscription {
  return {
    id: row.id,
    url: row.url,
    events: row.events.filter(isEventType),
    secret: row.secret,
    createdAt: row.createdAt.toISOString(),
    disabled: row.disabledAt !== null,
  };
}

export async function listWebhooks(tx: OrgTx): Promise<WebhookSubscription[]> {
  return (await tx.webhookSubscription.findMany({ orderBy: { createdAt: "desc" } })).map(subscriptionOf);
}

export async function createWebhook(
  tx: OrgTx,
  actor: Actor,
  input: { url: string; events: readonly WebhookEventType[] },
): Promise<WebhookSubscription> {
  const row = await tx.webhookSubscription.create({
    data: {
      url: input.url,
      events: [...new Set(input.events)],
      secret: `whsec_${randomBytes(24).toString("base64url")}`,
      createdBy: actor.userId,
    },
  });
  await recordAudit(tx, actor, {
    action: "webhook.added",
    entityType: "webhook_subscription",
    entityId: row.id,
    after: { url: input.url, events: row.events },
  });
  return subscriptionOf(row);
}

export async function setWebhookDisabled(tx: OrgTx, actor: Actor, id: string, disabled: boolean): Promise<void> {
  const found = await tx.webhookSubscription.findUnique({ where: { id } });
  if (!found) throw new DomainError("NOT_FOUND", "WEBHOOK_NOT_FOUND", "No such webhook");
  await tx.webhookSubscription.update({ where: { id }, data: { disabledAt: disabled ? new Date() : null } });
  await recordAudit(tx, actor, {
    action: disabled ? "webhook.turned-off" : "webhook.turned-on",
    entityType: "webhook_subscription",
    entityId: id,
  });
}

export async function listDeliveries(tx: OrgTx, subscriptionId: string): Promise<WebhookDelivery[]> {
  const rows = await tx.webhookDelivery.findMany({
    where: { subscriptionId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((row) => ({
    id: row.id,
    eventType: row.eventType,
    status: row.status === "delivered" ? "delivered" : row.status === "failed" ? "failed" : "pending",
    attempts: row.attempts,
    responseStatus: row.responseStatus,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
  }));
}

/** The lead as a webhook sends it: what the agency's own systems need, nothing internal. */
interface LeadHookPayload {
  id: string;
  stage: string;
  source: string;
  sourceDetail: string | null;
  ownerUserId: string | null;
  createdAt: string;
  destination: string | null;
  adults: number | null;
  person: { name: string; phone: string | null; email: string | null };
}

async function leadPayload(tx: OrgTx, leadId: string): Promise<LeadHookPayload | null> {
  const lead = await tx.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      stage: true,
      source: true,
      sourceDetail: true,
      ownerUserId: true,
      createdAt: true,
      adults: true,
      destination: { select: { name: true } },
      person: { select: { name: true, phoneE164: true, email: true } },
    },
  });
  if (lead === null) return null;
  return {
    id: lead.id,
    stage: lead.stage,
    source: lead.source,
    sourceDetail: lead.sourceDetail,
    ownerUserId: lead.ownerUserId,
    createdAt: lead.createdAt.toISOString(),
    destination: lead.destination?.name ?? null,
    adults: lead.adults,
    person: { name: lead.person.name, phone: lead.person.phoneE164, email: lead.person.email },
  };
}

/** For each event a webhook can hear: its subscriptions' deliveries, queued for the worker. */
export function webhookListeners(dependencies: { queue: JobQueue }): EventListener[] {
  return webhookEventTypes.map((eventType) =>
    defineListener({
      name: `connectors.webhook-${eventType.replace(".", "-")}`,
      eventType,
      payload: leadEvent.loose(),
      handle: async (event, context) => {
        const queued = await context.forOrg(async (tx) => {
          const subscriptions = await tx.webhookSubscription.findMany({
            where: { disabledAt: null, events: { has: eventType } },
            select: { id: true },
          });
          if (subscriptions.length === 0) return [];
          const lead = await leadPayload(tx, event.payload.leadId);
          if (lead === null) return [];
          // As plain JSON, the shape the delivery keeps and sends.
          const payload = JSON.parse(
            JSON.stringify({
              id: event.id,
              type: eventType,
              occurredAt: new Date().toISOString(),
              // The event's own fields (a stage's from and to, an owner), as plain JSON.
              data: { lead, event: event.payload },
            }),
          ) as Record<string, JsonValue>;
          const ids: string[] = [];
          for (const subscription of subscriptions) {
            const existing = await tx.webhookDelivery.findUnique({
              where: {
                organizationId_subscriptionId_eventId: {
                  organizationId: event.organizationId,
                  subscriptionId: subscription.id,
                  eventId: event.id,
                },
              },
              select: { id: true },
            });
            if (existing) continue;
            const created = await tx.webhookDelivery.create({
              data: { subscriptionId: subscription.id, eventId: event.id, eventType, payload },
              select: { id: true },
            });
            ids.push(created.id);
          }
          return ids;
        });
        for (const deliveryId of queued) {
          await dependencies.queue.send(WEBHOOK_DELIVERY_QUEUE, { organizationId: event.organizationId, deliveryId });
        }
      },
    }),
  );
}

/** "t=<seconds>,v1=<hex>": the HMAC-SHA256 of "<seconds>.<body>" with the subscription's secret. */
export function webhookSignature(secret: string, body: string, at: Date): string {
  const seconds = Math.floor(at.getTime() / 1000);
  const digest = createHmac("sha256", secret)
    .update(`${String(seconds)}.${body}`)
    .digest("hex");
  return `t=${String(seconds)},v1=${digest}`;
}

/** Sends one delivery. A refusal or no answer counts an attempt and throws, so the queue retries it with backoff. */
export async function deliverWebhook(dependencies: { db: Database; http: HttpOut }, data: unknown): Promise<void> {
  const { organizationId, deliveryId } = webhookDeliveryJob.parse(data);
  const found = await dependencies.db.forOrg(organizationId, (tx) =>
    tx.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { subscription: true } }),
  );
  if (found?.status !== "pending" || found.subscription.disabledAt !== null) return;
  const body = JSON.stringify(found.payload);
  const sent = await dependencies.http.postJson(found.subscription.url, body, {
    "x-webhook-event": found.eventType,
    "x-webhook-id": found.eventId,
    "x-webhook-signature": webhookSignature(found.subscription.secret, body, new Date()),
  });
  const delivered = sent.status >= 200 && sent.status < 300;
  const attempts = found.attempts + 1;
  const gaveUp = !delivered && attempts >= WEBHOOK_ATTEMPTS;
  await dependencies.db.forOrg(organizationId, (tx) =>
    tx.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        attempts,
        responseStatus: sent.status === 0 ? null : sent.status,
        status: delivered ? "delivered" : gaveUp ? "failed" : "pending",
        lastError: delivered ? null : sent.status === 0 ? "No answer" : `Answered ${String(sent.status)}`,
        ...(delivered && { deliveredAt: new Date() }),
      },
    }),
  );
  if (!delivered && !gaveUp) throw new Error(`Webhook delivery ${deliveryId} not delivered yet`);
}
