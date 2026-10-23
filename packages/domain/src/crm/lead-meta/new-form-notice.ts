// A lead from a form that was not brought in (Q4): never brought in silently. It is not saved, it is counted, and the
// Owner is told once for the form ("A lead came from 'Diwali offers', a form you haven't brought in. Bring it in?");
// bringing the form in matches its questions and then catches up what it skipped, because the form's cursor was left
// before its first skipped lead.
import { createHash } from "node:crypto";
import { ownMessage } from "@travel-crm/integrations/jobs";
import {
  callGraph,
  formByMetaId,
  metaServices,
  noticeSourceOf,
  openPageToken,
  type MetaDependencies,
  type MetaFormRow,
  type MetaPageRow,
} from "../../meta-leads/index.js";
import { notify } from "../../notifications/index.js";
import { systemActor } from "../../kernel/index.js";

const NAMELESS = "A new form";

/** The form's row, made from what Meta says of it when the lead came from a form never seen (a new form on a connected Page). */
async function knownForm(dependencies: MetaDependencies, page: MetaPageRow, formId: string): Promise<MetaFormRow> {
  const { db } = dependencies;
  const existing = await db.forOrg(page.organizationId, (tx) => formByMetaId(tx, formId));
  if (existing !== null) return existing;
  const services = metaServices(dependencies);
  const token = services === null ? null : openPageToken(services.secretBox, page);
  let name = NAMELESS;
  if (services !== null && token !== null) {
    const described = await callGraph(dependencies, page.organizationId, "webhook", () =>
      services.graph.describeForm(formId, token),
    );
    if (described.ok) name = described.value.name.slice(0, 200);
  }
  return db.forOrg(page.organizationId, async (tx) => {
    await tx.metaForm.createMany({ data: [{ metaPageId: page.id, formId, formName: name }], skipDuplicates: true });
    const made = await formByMetaId(tx, formId);
    if (made === null) throw ownMessage(new Error("The form row was not found after making it"));
    return made;
  });
}

/** A uuid made from the form's row, the source of its one notice. */
const noticeIdOf = (formRowId: string) =>
  noticeSourceOf("new-form", createHash("sha256").update(formRowId).digest("hex"));

export interface SkipDependencies extends MetaDependencies {
  ownerOf(organizationId: string): Promise<string | null>;
}

/** Counts the skipped lead, leaves the cursor before it, and tells the Owner once for the form. */
export async function skipLeadOfUnbroughtForm(
  dependencies: SkipDependencies,
  page: MetaPageRow,
  change: { formId: string; createdTime: number | null },
  now: Date,
): Promise<void> {
  const form = await knownForm(dependencies, page, change.formId);
  if (form.state !== "not_brought_in") return;
  const owner = await dependencies.ownerOf(page.organizationId);
  const before = BigInt(Math.floor((change.createdTime ?? now.getTime() / 1000) - 1));
  await dependencies.db.forOrg(page.organizationId, async (tx) => {
    const cursor = form.catchupCursor === null || before < form.catchupCursor ? before : form.catchupCursor;
    await tx.metaForm.update({
      where: { id: form.id },
      data: { skippedLeads: { increment: 1 }, catchupCursor: cursor },
    });
    // The notice goes once: whoever flips the flag from empty is the one that sends it.
    const flagged = await tx.metaForm.updateMany({
      where: { id: form.id, noticeSentAt: null },
      data: { noticeSentAt: now },
    });
    if (flagged.count === 0 || owner === null) return;
    await notify(tx, systemActor(page.organizationId), {
      recipientUserIds: [owner],
      sourceEventId: noticeIdOf(form.id),
      kind: "meta.new-form",
      title: `A lead came from '${form.formName.slice(0, 80)}', a form you haven't brought in`,
      body: "Bring it in?",
      link: `/settings/lead-sources/meta/pages/${page.id}`,
      channels: ["push"],
    });
  });
}
