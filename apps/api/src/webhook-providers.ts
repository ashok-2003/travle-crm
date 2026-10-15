// The webhook providers the api accepts at /webhooks/<name> and the worker processes. The Foundation ships the
// generic intake and none; later steps add theirs here (Razorpay in step 6, Meta's WhatsApp in step 2).
import type { WebhookProvider } from "@travel-crm/domain/webhooks";

export const webhookProviders: readonly WebhookProvider[] = [];
