// What the Meta screens send (spec 6.3): a Page is named by its row id alone, except in the connect steps, which name
// Meta's own ids. Inputs are z.strictObject: unknown keys get a 400.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { metaQuestionField } from "./meta-form.js";
import { metaId } from "./meta-page.js";

export const metaPageIdInput = z.strictObject({ pageId: recordId });
export type MetaPageIdInput = z.infer<typeof metaPageIdInput>;

/** Connect again for a Page that needs it; without a Page it is a new connection. */
export const metaConnectStartInput = z.strictObject({ reconnectPageId: recordId.optional() });
export type MetaConnectStartInput = z.infer<typeof metaConnectStartInput>;

/** The code and state Facebook's dialog sent back, read once and posted by the callback page. */
export const metaConnectFinishInput = z.strictObject({
  code: z.string().min(1).max(2000),
  state: z.string().min(1).max(2000),
});
export type MetaConnectFinishInput = z.infer<typeof metaConnectFinishInput>;

/** The Pages the person ticked, by Meta's ids. */
export const metaConnectPagesInput = z.strictObject({ pageIds: z.array(metaId).min(1).max(20) });
export type MetaConnectPagesInput = z.infer<typeof metaConnectPagesInput>;

export const metaFormInput = z.strictObject({ pageId: recordId, formId: recordId });
export type MetaFormInput = z.infer<typeof metaFormInput>;

const questionMatches = z
  .array(z.strictObject({ key: z.string().min(1).max(200), field: metaQuestionField.nullable() }))
  .max(100);

/** Earlier leads (spec Q3): only new ones, or also the last 30 days, through an import's preview. */
export const metaEarlierLeadChoices = ["only_new", "last_30_days"] as const;
export const metaEarlierLeadChoice = z.enum(metaEarlierLeadChoices);
export type MetaEarlierLeadChoice = z.infer<typeof metaEarlierLeadChoice>;

export const metaBringInInput = z.strictObject({
  pageId: recordId,
  formId: recordId,
  questions: questionMatches,
  earlierLeads: metaEarlierLeadChoice,
});
export type MetaBringInInput = z.infer<typeof metaBringInInput>;

export const metaSaveQuestionsInput = z.strictObject({
  pageId: recordId,
  formId: recordId,
  questions: questionMatches,
});
export type MetaSaveQuestionsInput = z.infer<typeof metaSaveQuestionsInput>;

export const metaProblemInput = z.strictObject({ pageId: recordId, leadRowId: recordId });
export type MetaProblemInput = z.infer<typeof metaProblemInput>;

export const metaProblemsInput = z.strictObject({
  pageId: recordId,
  after: recordId.optional(),
  limit: z.int().min(1).max(100).default(50),
});
export type MetaProblemsInput = z.input<typeof metaProblemsInput>;
