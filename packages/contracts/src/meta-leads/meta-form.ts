// A Page's lead forms and their questions (spec 3.3, 3.4, 4.4): a form is known from first sight, brought in when its
// questions are matched. A question is matched by Meta's question key, never its wording (M14).
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { sheetField, sheetFields } from "../sheets/sheet-connection.js";
import { metaId } from "./meta-page.js";

export const metaFormStates = ["not_brought_in", "running", "paused", "needs_attention"] as const;
export const metaFormState = z.enum(metaFormStates);
export type MetaFormState = z.infer<typeof metaFormState>;

/** Meta's question types, as the adapter normalises them (integrations' metaQuestionTypes). */
export const metaQuestionTypes = [
  "full_name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "city",
  "state",
  "zip",
  "custom",
  "other",
] as const;
export const metaQuestionType = z.enum(metaQuestionTypes);
export type MetaQuestionType = z.infer<typeof metaQuestionType>;

/** A question holds a lead import field without stage, or "note" (already one of them): null is Don't import (M14). */
export const metaQuestionFields = sheetFields;
export const metaQuestionField = sheetField;
export type MetaQuestionField = z.infer<typeof metaQuestionField>;

/** Where a question's field came from: Meta's standard type, a word in the label, or the person. */
export const metaGuessSources = ["standard", "label", "last-time"] as const;

const timestamp = z.iso.datetime();

export const metaFormView = z.object({
  id: recordId,
  formId: metaId,
  name: z.string(),
  /** Meta's own status text: ACTIVE, ARCHIVED, ... */
  metaStatus: z.string(),
  state: metaFormState,
  leadsAdded: z.int(),
  lastLeadAt: timestamp.nullable(),
  /** Leads that came while the form was not brought in (spec Q4). */
  skippedLeads: z.int(),
});
export type MetaFormView = z.infer<typeof metaFormView>;

export const metaFormList = z.object({ items: z.array(metaFormView), readAt: timestamp });
export type MetaFormList = z.infer<typeof metaFormList>;

export const metaQuestionView = z.object({
  key: z.string(),
  type: metaQuestionType,
  label: z.string(),
  /** An answer from Meta's last lead, shown only for a form already brought in; otherwise null. */
  example: z.string().nullable(),
  field: metaQuestionField.nullable(),
  guessedBy: z.enum(metaGuessSources).nullable(),
  /** The form gained this question after it was matched and nobody has seen it. */
  isNew: z.boolean(),
});
export type MetaQuestionView = z.infer<typeof metaQuestionView>;

export const metaFormQuestionsView = z.object({
  form: metaFormView,
  questions: z.array(metaQuestionView),
  /** The checklist: a name, and a phone, an email or an Instagram handle. */
  hasName: z.boolean(),
  hasContact: z.boolean(),
});
export type MetaFormQuestionsView = z.infer<typeof metaFormQuestionsView>;

/** What bringIn answers: the import behind the second choice, or null when only new leads are brought in. */
export const metaFormBroughtIn = z.object({ importId: recordId.nullable() });
export type MetaFormBroughtIn = z.infer<typeof metaFormBroughtIn>;
