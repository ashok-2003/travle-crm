// The body of Meta's leadgen webhook (spec 2): ids only, never the answers. Up to 1,000 changes come in one delivery, so
// each is read on its own and a malformed one is skipped.
import { z } from "zod";

const text = z.string().min(1).max(64);

export const metaLeadgenValue = z.object({
  leadgen_id: text,
  page_id: text,
  form_id: text,
  created_time: z.number().optional(),
});

const metaChange = z.object({ field: z.string(), value: z.unknown() });
export const metaWebhookBody = z.object({
  object: z.literal("page"),
  entry: z.array(z.object({ id: z.string().optional(), changes: z.array(metaChange).max(1000).default([]) })).max(1000),
});

export interface MetaLeadgenChange {
  leadgenId: string;
  pageId: string;
  formId: string;
  createdTime: number | null;
}

/** Every well-formed leadgen change in a delivery body, in order; anything else is dropped. */
export function leadgenChangesOf(body: unknown): MetaLeadgenChange[] {
  const parsed = metaWebhookBody.safeParse(body);
  if (!parsed.success) return [];
  const changes: MetaLeadgenChange[] = [];
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== "leadgen") continue;
      const value = metaLeadgenValue.safeParse(change.value);
      if (!value.success) continue;
      changes.push({
        leadgenId: value.data.leadgen_id,
        pageId: value.data.page_id,
        formId: value.data.form_id,
        createdTime: value.data.created_time ?? null,
      });
    }
  }
  return changes;
}
