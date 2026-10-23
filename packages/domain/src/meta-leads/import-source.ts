// A Meta lead form as the source of an import of its earlier leads (Q3): the form's name is the detail every lead carries,
// to which the platform of each is added as the live leads' detail adds it. Handed to the imports as a function, since
// imports never call meta-leads.
import type { OrgTx } from "@travel-crm/db";

export async function metaImportSource(
  tx: OrgTx,
  formRowId: string,
): Promise<{ source: "meta_lead_ad"; detail: string } | null> {
  const form = await tx.metaForm.findUnique({ where: { id: formRowId }, select: { formName: true } });
  return form === null ? null : { source: "meta_lead_ad", detail: form.formName.slice(0, 120) };
}
