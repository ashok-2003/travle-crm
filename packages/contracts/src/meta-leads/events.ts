// The payloads of the Meta lead ads' events (spec 4, 11, ADR 0009): ids and reason codes, never a Page name, a token or an
// answer.
import { z } from "zod";
import { recordId } from "../identity/fields.js";

/** meta.page-changed: the Page's route row is to be written or removed. */
export const metaPageChangedEvent = z.strictObject({ pageId: recordId });
export type MetaPageChangedEvent = z.infer<typeof metaPageChangedEvent>;

/** What a Page needs the Owner to look at (spec 11). */
export const metaAttentionKinds = ["needs_reconnect", "token_expiring", "form_changed"] as const;
export const metaAttentionKind = z.enum(metaAttentionKinds);
export type MetaAttentionKind = z.infer<typeof metaAttentionKind>;

/** meta.attention: the Page or a form changed into a state that stops leads; the Owner is told once. */
export const metaAttentionEvent = z.strictObject({
  pageId: recordId,
  kind: metaAttentionKind,
  formId: recordId.optional(),
});
export type MetaAttentionEvent = z.infer<typeof metaAttentionEvent>;

/** meta.check-requested: Check now, or a Page that was reconnected or resumed: read its forms' leads at once. */
export const metaCheckRequestedEvent = z.strictObject({ pageId: recordId });
export type MetaCheckRequestedEvent = z.infer<typeof metaCheckRequestedEvent>;

/** meta.form-brought-in: catch up the leads the form skipped while it was not brought in (spec Q4). */
export const metaFormBroughtInEvent = z.strictObject({ pageId: recordId, formId: recordId });
export type MetaFormBroughtInEvent = z.infer<typeof metaFormBroughtInEvent>;
