// Bringing a form in and changing its questions (spec 3.4, M14, M15, Q3, Q4). Bringing in stores the person's match,
// sets the form running with its cursor, and asks for the rest: the leads the form skipped while it was not brought in,
// and, if asked, the last 30 days through an import's preview. Changing a match affects only the leads after it.
import type { MetaBringInInput, MetaSaveQuestionsInput } from "@travel-crm/contracts/meta-leads";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError } from "../kernel/index.js";
import type { MetaDependencies } from "./dependencies.js";
import { describeForm, formOfPage, questionsHashOf, type MetaFormRow } from "./forms.js";
import { findPage, holdPage, pageNotReady } from "./page-row.js";
import { checklistOf, defaultMatches, type QuestionMatch } from "./question-fields.js";

const incomplete = () =>
  new DomainError(
    "VALIDATION",
    "META_FORM_INCOMPLETE",
    "A form needs a name, and a phone, an email or an Instagram handle",
  );

/** The questions of the form as Meta describes them, with the field the person chose for each (the default for one not named). */
function chosenMatches(
  described: readonly Parameters<typeof defaultMatches>[0][number][],
  chosen: MetaBringInInput["questions"],
): QuestionMatch[] {
  const defaults = defaultMatches(described);
  return defaults.map((fallback) => {
    const picked = chosen.find((question) => question.key === fallback.key);
    return picked === undefined ? fallback : { ...fallback, field: picked.field, guessedBy: null };
  });
}

/** Replaces the form's question rows with these matches. */
async function storeMatches(tx: OrgTx, formRowId: string, matches: readonly QuestionMatch[]): Promise<void> {
  await tx.metaFormQuestion.deleteMany({ where: { formRowId } });
  await tx.metaFormQuestion.createMany({
    data: matches.map((match) => ({
      formRowId,
      questionKey: match.key.slice(0, 200),
      questionType: match.type,
      label: match.label.slice(0, 500),
      field: match.field,
    })),
  });
}

/** The cursor a form starts reading from: the second before its first skipped lead, else now (M15). */
const startCursor = (form: MetaFormRow, now: Date): bigint =>
  form.catchupCursor ?? BigInt(Math.floor(now.getTime() / 1000));

/**
 * Brings the form in. `earlierLeads` "last_30_days" asks, with the event, for an import of the form's last 30 days that
 * reaches the preview and its "Already in your CRM" group; the cursor then starts at now, since the import covers the rest.
 */
export async function bringInForm(
  dependencies: MetaDependencies,
  access: MemberAccess,
  input: MetaBringInInput,
  now: Date,
): Promise<void> {
  const { db } = dependencies;
  const { page, form } = await db.forOrg(access.organizationId, async (tx) => ({
    page: await findPage(tx, input.pageId),
    form: await formOfPage(tx, input.pageId, input.formId),
  }));
  if (page.status !== "running") throw pageNotReady();
  if (form.state !== "not_brought_in") throw pageNotReady();
  const described = await describeForm(dependencies, page, form);
  const matches = chosenMatches(described.questions, input.questions);
  const checklist = checklistOf(matches);
  if (!checklist.hasName || !checklist.hasContact) throw incomplete();
  const earlier = input.earlierLeads === "last_30_days";
  await db.forOrg(access.organizationId, async (tx) => {
    if ((await holdPage(tx, page.id))?.status !== "running") throw pageNotReady();
    const held = await formOfPage(tx, page.id, form.id);
    if (held.state !== "not_brought_in") throw pageNotReady();
    await storeMatches(tx, held.id, matches);
    await tx.metaForm.update({
      where: { id: held.id },
      data: {
        state: "running",
        broughtInAt: now,
        questionsHash: questionsHashOf(described.questions),
        catchupCursor: earlier ? BigInt(Math.floor(now.getTime() / 1000)) : startCursor(held, now),
        formName: described.name.slice(0, 200),
        metaStatus: described.status.slice(0, 40),
      },
    });
    await recordAudit(tx, access, {
      action: "meta.form-brought-in",
      entityType: "meta_page",
      entityId: page.id,
      after: { formId: held.formId, questions: matches.length, earlierLeads: input.earlierLeads },
    });
    await publishEvent(tx, {
      type: "meta.form-brought-in",
      payload: { pageId: page.id, formId: held.id, earlierLeads: earlier },
    });
  });
}

/** Edit questions (M14): the match is replaced; the leads already added are not rewritten. */
export async function saveQuestions(
  dependencies: MetaDependencies,
  access: MemberAccess,
  input: MetaSaveQuestionsInput,
  now: Date,
): Promise<void> {
  const { db } = dependencies;
  const { page, form } = await db.forOrg(access.organizationId, async (tx) => ({
    page: await findPage(tx, input.pageId),
    form: await formOfPage(tx, input.pageId, input.formId),
  }));
  if (form.state === "not_brought_in") throw pageNotReady();
  const described = await describeForm(dependencies, page, form);
  const matches = chosenMatches(described.questions, input.questions);
  const checklist = checklistOf(matches);
  if (!checklist.hasName || !checklist.hasContact) throw incomplete();
  await db.forOrg(access.organizationId, async (tx) => {
    const held = await formOfPage(tx, page.id, form.id);
    await storeMatches(tx, held.id, matches);
    // Having looked at the questions and matched them again, the form is running again (spec 3.4).
    await tx.metaForm.update({
      where: { id: held.id },
      data: {
        questionsHash: questionsHashOf(described.questions),
        ...(held.state === "needs_attention" ? { state: "running" } : {}),
      },
    });
    await recordAudit(tx, access, {
      action: "meta.form-questions-changed",
      entityType: "meta_page",
      entityId: page.id,
      after: { formId: held.formId, questions: matches.length, at: now.toISOString() },
    });
  });
}
