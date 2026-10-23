// A Page's lead forms (spec 3.3, 3.4, 4.4): known from first sight and not brought in until the person matches their
// questions; brought in, they are saved from webhooks and read by the catch-up. Questions are matched by Meta's question
// key (M14), and the match is the person's to change; a change affects only the leads after it.
import { createHash } from "node:crypto";
import type {
  MetaFormList,
  MetaFormQuestionsView,
  MetaFormView,
  MetaQuestionView,
} from "@travel-crm/contracts/meta-leads";
import type { OrgTx } from "@travel-crm/db";
import type { MetaFormDescription, MetaFormQuestion } from "@travel-crm/integrations/meta-graph";
import { callGraph, lacksPermission, needsReconnect } from "./graph-calls.js";
import { metaServices, type MetaDependencies } from "./dependencies.js";
import { formsCacheSeconds } from "./limits.js";
import { type MetaPageRow } from "./page-row.js";
import { checklistOf, defaultMatches, type QuestionMatch } from "./question-fields.js";
import * as refuse from "./refusals.js";
import { openPageToken } from "./tokens.js";

export interface MetaFormRow {
  organizationId: string;
  id: string;
  metaPageId: string;
  formId: string;
  formName: string;
  metaStatus: string;
  state: "not_brought_in" | "running" | "paused" | "needs_attention";
  catchupCursor: bigint | null;
  skippedLeads: number;
  questionsHash: Uint8Array | null;
  broughtInAt: Date | null;
  noticeSentAt: Date | null;
}

type StoredForm = NonNullable<Awaited<ReturnType<OrgTx["metaForm"]["findFirst"]>>>;

export const toFormRow = (row: StoredForm): MetaFormRow => ({ ...row, state: row.state as MetaFormRow["state"] });

/** The form by Meta's id in this agency; null when it was never seen. */
export async function formByMetaId(tx: OrgTx, formId: string): Promise<MetaFormRow | null> {
  const row = await tx.metaForm.findFirst({ where: { formId } });
  return row === null ? null : toFormRow(row);
}

/** The Page's form by our id; a form of another Page, another agency or none is not found. */
export async function formOfPage(tx: OrgTx, pageRowId: string, formRowId: string): Promise<MetaFormRow> {
  const row = await tx.metaForm.findFirst({ where: { id: formRowId, metaPageId: pageRowId } });
  if (row === null) throw refuse.formNotFound();
  return toFormRow(row);
}

/** SHA-256 over the question keys and types in order: a change in the form's questions changes it (spec 3.4). */
export function questionsHashOf(questions: readonly Pick<MetaFormQuestion, "key" | "type">[]): Uint8Array<ArrayBuffer> {
  const digest = createHash("sha256")
    .update(JSON.stringify(questions.map((q) => [q.key, q.type])))
    .digest();
  return new Uint8Array(digest);
}

const MAX_FORM_PAGES = 10;

/** The Page's token, or a refusal that it must be connected again. */
function tokenOf(dependencies: MetaDependencies, page: MetaPageRow): string {
  const services = metaServices(dependencies);
  if (services === null) throw refuse.notConfigured();
  const token = openPageToken(services.secretBox, page);
  if (token === null) throw refuse.unavailable();
  return token;
}

/**
 * Reads the Page's forms from Meta when they were last read more than five minutes ago (or `force`), and keeps a row for
 * each, with the name and Meta's own status. Reading is outside any transaction; the rows are written in one.
 */
export async function refreshForms(
  dependencies: MetaDependencies,
  page: MetaPageRow,
  now: Date,
  options: { force?: boolean } = {},
): Promise<boolean> {
  const services = metaServices(dependencies);
  if (services === null) throw refuse.notConfigured();
  if (
    options.force !== true &&
    page.formsReadAt !== null &&
    now.getTime() - page.formsReadAt.getTime() < formsCacheSeconds * 1000
  ) {
    return false;
  }
  const token = tokenOf(dependencies, page);
  const summaries: { id: string; name: string; status: string }[] = [];
  let after: string | undefined;
  for (let pages = 0; pages < MAX_FORM_PAGES; pages += 1) {
    const read = await callGraph(dependencies, page.organizationId, "interactive", () =>
      services.graph.listForms(page.pageId, token, after === undefined ? {} : { after }),
    );
    if (!read.ok) {
      if (needsReconnect(read.failure) || lacksPermission(read.failure)) throw refuse.permissionMissing();
      throw refuse.unavailable();
    }
    summaries.push(...read.value.items);
    if (read.value.next === null) break;
    after = read.value.next;
  }
  await dependencies.db.forOrg(page.organizationId, async (tx) => {
    for (const summary of summaries) {
      const name = summary.name.slice(0, 200);
      const known = await tx.metaForm.findFirst({
        where: { formId: summary.id },
        select: { id: true, metaPageId: true },
      });
      if (known === null) {
        await tx.metaForm.create({
          data: { metaPageId: page.id, formId: summary.id, formName: name, metaStatus: summary.status.slice(0, 40) },
        });
      } else if (known.metaPageId === page.id) {
        await tx.metaForm.update({
          where: { id: known.id },
          data: { formName: name, metaStatus: summary.status.slice(0, 40) },
        });
      }
    }
    await tx.metaPage.update({ where: { id: page.id }, data: { formsReadAt: now } });
  });
  return true;
}

/** A form's questions as Meta describes them now. */
export async function describeForm(
  dependencies: MetaDependencies,
  page: MetaPageRow,
  form: Pick<MetaFormRow, "formId">,
): Promise<MetaFormDescription> {
  const services = metaServices(dependencies);
  if (services === null) throw refuse.notConfigured();
  const token = tokenOf(dependencies, page);
  const described = await callGraph(dependencies, page.organizationId, "interactive", () =>
    services.graph.describeForm(form.formId, token),
  );
  if (!described.ok) {
    if (described.failure.reason === "not_found") throw refuse.formNotFound();
    if (needsReconnect(described.failure) || lacksPermission(described.failure)) throw refuse.permissionMissing();
    throw refuse.unavailable();
  }
  return described.value;
}

/** The questions of a brought-in form with the match the person made. */
export async function storedMatches(tx: OrgTx, formRowId: string): Promise<QuestionMatch[]> {
  const rows = await tx.metaFormQuestion.findMany({ where: { formRowId }, orderBy: { id: "asc" } });
  return rows.map((row) => ({
    key: row.questionKey,
    type: row.questionType as QuestionMatch["type"],
    label: row.label,
    field: row.field as QuestionMatch["field"],
    guessedBy: null,
  }));
}

export interface FormCounts {
  leadsAdded: number;
  lastLeadAt: Date | null;
  earlierImportId: string | null;
}

const noCounts: FormCounts = { leadsAdded: 0, lastLeadAt: null, earlierImportId: null };

export function formViewOf(form: MetaFormRow, counts: FormCounts): MetaFormView {
  return {
    id: form.id,
    formId: form.formId,
    name: form.formName,
    metaStatus: form.metaStatus,
    state: form.state,
    leadsAdded: counts.leadsAdded,
    lastLeadAt: counts.lastLeadAt?.toISOString() ?? null,
    skippedLeads: form.skippedLeads,
    earlierImportId: counts.earlierImportId,
  };
}

/** Each form's leads added and the newest, from the ledger, and its import of earlier leads, by the form's Meta id. */
export async function countsByForm(
  tx: OrgTx,
  forms: readonly Pick<MetaFormRow, "id" | "formId">[],
): Promise<Map<string, FormCounts>> {
  const grouped = await tx.metaLead.groupBy({
    by: ["formId"],
    where: { formId: { in: forms.map((form) => form.formId) }, status: { in: ["added", "merged"] } },
    _count: { _all: true },
    _max: { createdAtMeta: true },
  });
  const imports = await tx.importBatch.findMany({
    where: { sourceMetaFormId: { in: forms.map((form) => form.id) } },
    orderBy: { id: "desc" },
    select: { id: true, sourceMetaFormId: true },
  });
  return new Map(
    forms.map((form) => {
      const group = grouped.find((candidate) => candidate.formId === form.formId);
      return [
        form.formId,
        {
          leadsAdded: group?._count._all ?? 0,
          lastLeadAt: group?._max.createdAtMeta ?? null,
          earlierImportId: imports.find((batch) => batch.sourceMetaFormId === form.id)?.id ?? null,
        },
      ];
    }),
  );
}

/** A Page's forms for its table (spec 3.3), read afresh when the cache is old. */
export async function listForms(dependencies: MetaDependencies, page: MetaPageRow, now: Date): Promise<MetaFormList> {
  await refreshForms(dependencies, page, now);
  return dependencies.db.forOrg(page.organizationId, async (tx) => {
    const forms = (
      await tx.metaForm.findMany({ where: { metaPageId: page.id }, orderBy: [{ formName: "asc" }, { id: "asc" }] })
    ).map(toFormRow);
    const counts = await countsByForm(tx, forms);
    return {
      items: forms.map((form) => formViewOf(form, counts.get(form.formId) ?? noCounts)),
      readAt: (page.formsReadAt ?? now).toISOString(),
    };
  });
}

/**
 * The questions of a form with the match: the person's own for a form brought in (new questions Meta added since are marked
 * new and default to the note), else the defaults. The example answer is the newest lead's, for a form brought in only.
 */
export async function formQuestions(
  dependencies: MetaDependencies,
  page: MetaPageRow,
  formRowId: string,
): Promise<MetaFormQuestionsView> {
  const form = await dependencies.db.forOrg(page.organizationId, (tx) => formOfPage(tx, page.id, formRowId));
  const described = await describeForm(dependencies, page, form);
  const stored =
    form.state === "not_brought_in"
      ? []
      : await dependencies.db.forOrg(page.organizationId, (tx) => storedMatches(tx, form.id));
  const defaults = defaultMatches(described.questions);
  const example = form.state === "not_brought_in" ? null : await newestLeadAnswers(dependencies, page, form);
  const questions: MetaQuestionView[] = described.questions.map((question, index) => {
    const kept = stored.find((match) => match.key === question.key);
    const fallback = defaults[index];
    const match = kept ?? fallback;
    const answers = example?.[question.key];
    return {
      key: question.key,
      type: question.type,
      label: question.label,
      example: answers === undefined || answers.length === 0 ? null : answers.join(", ").slice(0, 200),
      field: kept === undefined && stored.length > 0 ? "note" : (match?.field ?? null),
      guessedBy: kept === undefined ? (fallback?.guessedBy ?? null) : null,
      isNew: stored.length > 0 && kept === undefined,
    };
  });
  const counts = await dependencies.db.forOrg(page.organizationId, (tx) => countsByForm(tx, [form]));
  return {
    form: formViewOf(form, counts.get(form.formId) ?? noCounts),
    questions,
    ...checklistOf(questions),
  };
}

/** The newest lead's answers at Meta, to show as examples beside a brought-in form's questions. */
async function newestLeadAnswers(
  dependencies: MetaDependencies,
  page: MetaPageRow,
  form: Pick<MetaFormRow, "formId">,
): Promise<Readonly<Record<string, readonly string[]>> | null> {
  const services = metaServices(dependencies);
  if (services === null) return null;
  const token = openPageToken(services.secretBox, page);
  if (token === null) return null;
  const read = await callGraph(dependencies, page.organizationId, "interactive", () =>
    services.graph.listLeads(form.formId, token, { limit: 1 }),
  );
  return read.ok ? (read.value.items[0]?.answers ?? null) : null;
}
