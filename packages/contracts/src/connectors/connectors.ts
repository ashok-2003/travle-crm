// Integrations and the developer panel (release D): an agency's website forms and incoming lead links, the lead they
// take, its API keys, the webhooks it hears our events on, and its connections to other services (Meta lead ads,
// IndiaMART; WhatsApp in release E).
import { z } from "zod";
import { destinationName } from "../catalog/index.js";
import { calendarMonth, noteBody, personName, shortText } from "../crm/index.js";
import { emailAddress, recordId } from "../identity/index.js";
import { phoneNumber } from "../kernel/index.js";

// --- The lead another system sends: a form's, a link's, an API call's ---

/**
 * A lead as a form, another tool or an API call sends it: a name and a phone or an email, and whatever else is known.
 * Unknown keys are dropped (a tool sends what it sends); each value is checked as the lead form checks it.
 */
export const incomingLead = z
  .object({
    name: personName,
    phone: phoneNumber.optional(),
    email: emailAddress.optional(),
    destination: destinationName.optional(),
    /** The month they want to travel, "2026-12". */
    travelMonth: calendarMonth.optional(),
    adults: z.coerce.number().int().min(1).max(99).optional(),
    message: noteBody.optional(),
    /** Where it came from in their words: a campaign, a page. */
    sourceDetail: shortText.optional(),
  })
  .refine((lead) => lead.phone !== undefined || lead.email !== undefined, {
    message: "Give a phone or an email",
    path: ["phone"],
  });
export type IncomingLead = z.infer<typeof incomingLead>;

/** The answer to whoever posted a lead: taken, or why not (a bad token, a field that doesn't pass, no Owner yet). */
export const intakeLeadResult = z.discriminatedUnion("taken", [
  z.object({ taken: z.literal(true) }),
  z.object({
    taken: z.literal(false),
    reason: z.enum(["not_found", "invalid", "not_set_up"]),
    /** The fields that didn't pass, for "invalid". */
    fields: z.array(z.string()).optional(),
  }),
]);
export type IntakeLeadResult = z.infer<typeof intakeLeadResult>;

/** What a form asks besides the name and phone, and the words it shows. */
export const formSettings = z.strictObject({
  title: z.string().trim().min(1).max(120).default("Plan your trip with us"),
  intro: z.string().trim().max(400).default(""),
  thankYou: z.string().trim().min(1).max(400).default("Thank you! We'll call you shortly."),
  ask: z
    .strictObject({
      email: z.boolean().default(true),
      destination: z.boolean().default(true),
      travelMonth: z.boolean().default(true),
      adults: z.boolean().default(true),
      message: z.boolean().default(true),
    })
    .default({ email: true, destination: true, travelMonth: true, adults: true, message: true }),
});
export type FormSettings = z.infer<typeof formSettings>;

export const leadCaptureKinds = ["form", "link"] as const;
export const leadCaptureKind = z.enum(leadCaptureKinds);

export const leadCapture = z.object({
  id: recordId,
  kind: leadCaptureKind,
  name: z.string(),
  settings: formSettings,
  createdAt: z.iso.datetime(),
  disabled: z.boolean(),
});
export type LeadCapture = z.infer<typeof leadCapture>;

export const createLeadCaptureInput = z.strictObject({
  kind: leadCaptureKind,
  name: z.string().trim().min(1).max(120),
  settings: formSettings.optional(),
});
export type CreateLeadCaptureInput = z.infer<typeof createLeadCaptureInput>;

/** A new form or link, with its token: shown once, never stored. */
export const createdLeadCapture = z.object({ capture: leadCapture, token: z.string() });

export const updateFormInput = z.strictObject({
  id: recordId,
  name: z.string().trim().min(1).max(120),
  settings: formSettings,
});
export const captureIdInput = z.strictObject({ id: recordId });

/** A form as the public page shows it: its words and what it asks, nothing of the agency's data. */
export const publicForm = z.object({ organizationName: z.string(), settings: formSettings });
export type PublicForm = z.infer<typeof publicForm>;

// --- API keys ---

export const apiKeyScopes = ["leads:read", "leads:write"] as const;
export const apiKeyScope = z.enum(apiKeyScopes);
export type ApiKeyScope = z.infer<typeof apiKeyScope>;

export const apiKey = z.object({
  id: recordId,
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(apiKeyScope),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
  revoked: z.boolean(),
});
export type ApiKey = z.infer<typeof apiKey>;

export const createApiKeyInput = z.strictObject({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(apiKeyScope).min(1),
});
export const createdApiKey = z.object({ apiKey, key: z.string() });

// --- Outgoing webhooks ---

/** The events an agency's webhook can hear. Payloads carry the lead's id and its public fields. */
export const webhookEventTypes = ["lead.created", "lead.stage-changed", "lead.reassigned"] as const;
export const webhookEventType = z.enum(webhookEventTypes);
export type WebhookEventType = z.infer<typeof webhookEventType>;

export const webhookSubscription = z.object({
  id: recordId,
  url: z.string(),
  events: z.array(webhookEventType),
  secret: z.string(),
  createdAt: z.iso.datetime(),
  disabled: z.boolean(),
});
export type WebhookSubscription = z.infer<typeof webhookSubscription>;

export const createWebhookInput = z.strictObject({
  url: z
    .url()
    .max(2000)
    .refine((url) => url.startsWith("https://"), "Use an https:// address"),
  events: z.array(webhookEventType).min(1),
});

export const webhookDelivery = z.object({
  id: recordId,
  eventType: z.string(),
  status: z.enum(["pending", "delivered", "failed"]),
  attempts: z.int(),
  responseStatus: z.int().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.iso.datetime(),
  deliveredAt: z.iso.datetime().nullable(),
});
export type WebhookDelivery = z.infer<typeof webhookDelivery>;

/** A delivery job's data: ids alone. */
export const webhookDeliveryJob = z.strictObject({ organizationId: recordId, deliveryId: recordId });

// --- Connections to other services ---

export const connectionProviders = ["meta_lead_ads", "indiamart", "whatsapp"] as const;
export const connectionProvider = z.enum(connectionProviders);
export type ConnectionProvider = z.infer<typeof connectionProvider>;

export const connection = z.object({
  id: recordId,
  provider: connectionProvider,
  name: z.string(),
  externalId: z.string(),
  status: z.enum(["connected", "needs_attention", "disconnected"]),
  lastSyncedAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Connection = z.infer<typeof connection>;

/** A Facebook page whose lead ads become leads: its id and a page access token with leads_retrieval. */
export const connectMetaInput = z.strictObject({
  pageId: z
    .string()
    .trim()
    .regex(/^\d{5,30}$/, "Use the page's number id"),
  pageAccessToken: z.string().trim().min(20).max(1000),
});

/** An IndiaMART seller account's CRM key, from IndiaMART's Lead Manager settings. */
export const connectIndiaMartInput = z.strictObject({
  name: z.string().trim().min(1).max(120),
  crmKey: z.string().trim().min(10).max(200),
});

export const connectionIdInput = z.strictObject({ id: recordId });

/** One connection's check, as a job: ids alone. */
export const connectionCheckJob = z.strictObject({ organizationId: recordId, connectionId: recordId });
