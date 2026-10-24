// Message templates (spec 3.3, 3.4, 5): what Meta approved, what the agency writes for approval, and what staff send from one.
// Inputs are z.strictObject. The rules Meta enforces are checked here before anything is sent to MSG91.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { clientToken } from "./inputs.js";

export const templateStatuses = ["draft", "pending", "approved", "rejected", "paused", "disabled", "archived"] as const;
export const templateStatus = z.enum(templateStatuses);
export type TemplateStatus = z.infer<typeof templateStatus>;

export const templateCategories = ["utility", "marketing"] as const;
export const templateCategory = z.enum(templateCategories);

/** The languages an agency may write a template in (Meta's codes). */
export const templateLanguages = ["en", "en_US", "hi"] as const;

/** The CRM fact behind a marker, which the send dialog fills in; `custom` is typed by the person sending. */
export const templateVariables = ["customer_name", "destination", "agent_name", "travel_month", "custom"] as const;
export const templateVariable = z.enum(templateVariables);
export type TemplateVariable = z.infer<typeof templateVariable>;

export const MAX_TEMPLATE_BODY = 1024;
export const MAX_TEMPLATE_FOOTER = 60;

/** The numbers inside {{1}}, {{2}}... in the order they appear. */
export function markersOf(body: string): number[] {
  return [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
}

/** What is wrong with a body by Meta's rules, as a reason; null when it is fine. */
export function bodyProblem(body: string): "empty" | "too_long" | "markers" | "edge" | "adjacent" | null {
  if (body.trim() === "") return "empty";
  if (body.length > MAX_TEMPLATE_BODY) return "too_long";
  const markers = markersOf(body);
  if (markers.some((marker, index) => marker !== index + 1)) return "markers";
  if (/^\s*\{\{\d+\}\}/.test(body) || /\{\{\d+\}\}\s*$/.test(body)) return "edge";
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(body)) return "adjacent";
  return null;
}

export const templateDraftInput = z
  .strictObject({
    name: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{1,59}$/),
    language: z.enum(templateLanguages),
    category: templateCategory,
    body: z.string().trim().min(1).max(MAX_TEMPLATE_BODY),
    footer: z.string().trim().min(1).max(MAX_TEMPLATE_FOOTER).nullable(),
    variables: z.array(templateVariable).max(10),
    samples: z.array(z.string().trim().min(1).max(100)).max(10),
  })
  .check((context) => {
    const draft = context.value;
    if (bodyProblem(draft.body) !== null)
      context.issues.push({ code: "custom", message: "body", input: draft, path: ["body"] });
    const count = markersOf(draft.body).length;
    if (draft.samples.length !== count || draft.variables.length !== count) {
      context.issues.push({ code: "custom", message: "samples", input: draft, path: ["samples"] });
    }
  });
export type TemplateDraftInput = z.infer<typeof templateDraftInput>;

export const editTemplateInput = z.strictObject({ templateId: recordId, draft: templateDraftInput });
export const templateIdInput = z.strictObject({ templateId: recordId });

export const templateSummary = z.object({
  id: recordId,
  name: z.string(),
  language: z.string(),
  category: templateCategory,
  body: z.string(),
  footer: z.string().nullable(),
  variables: z.array(z.string()),
  samples: z.array(z.string()),
  status: templateStatus,
  reason: z.string().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  /** Written here (editable when rejected) or made in the provider's panel and picked up. */
  madeHere: z.boolean(),
});
export type TemplateSummary = z.infer<typeof templateSummary>;

export const templateList = z.object({
  items: z.array(templateSummary),
  /** The month's marketing messages sent, and the agency's cap. */
  marketingUsed: z.number().int(),
  marketingCap: z.number().int(),
  syncedAt: z.iso.datetime().nullable(),
});
export type TemplateList = z.infer<typeof templateList>;

/** Send an approved template to a chat. `agreed` is the "they agreed to WhatsApp messages" tick. */
export const sendTemplateInput = z.strictObject({
  conversationId: recordId,
  templateId: recordId,
  clientToken,
  parameters: z.array(z.string().trim().min(1).max(200)).max(10),
  agreed: z.boolean().default(false),
});
export type SendTemplateInput = z.infer<typeof sendTemplateInput>;

/** Begin a chat with a lead's person who never wrote to us: the chat exists, then a template goes in it. */
export const startChatInput = z.strictObject({ leadId: recordId });
