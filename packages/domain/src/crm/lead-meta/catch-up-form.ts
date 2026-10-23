// Reading one brought-in form's recent leads from its cursor (M15, M16): `since = cursor - 10 minutes`, a page of 50 at a
// time, the ledger making the overlap free. Leads not yet settled come back oldest first, so they are saved in the order
// they arrived and the cursor can move past a lead only when it and the ones before it are handled.
import type { MetaGraph, MetaLead } from "@travel-crm/integrations/meta-graph";
import {
  callGraph,
  leadsPerReadPage,
  maxReadPagesPerForm,
  type GraphFailure,
  type MetaDependencies,
  type MetaFormRow,
  type MetaPageRow,
} from "../../meta-leads/index.js";

export type FormRead = { ok: true; leads: MetaLead[]; settled: Set<string> } | { ok: false; failure: GraphFailure };

/** Every lead of the form created after `since` (Unix seconds), oldest first, and which of them the ledger already settled. */
export async function readFormLeads(
  dependencies: MetaDependencies,
  graph: MetaGraph,
  page: Pick<MetaPageRow, "organizationId">,
  form: Pick<MetaFormRow, "formId">,
  token: string,
  since: number,
): Promise<FormRead> {
  const leads: MetaLead[] = [];
  let after: string | undefined;
  for (let pages = 0; pages < maxReadPagesPerForm; pages += 1) {
    const read = await callGraph(dependencies, page.organizationId, "catchup", () =>
      graph.listLeads(form.formId, token, {
        since,
        limit: leadsPerReadPage,
        ...(after === undefined ? {} : { after }),
      }),
    );
    if (!read.ok) return { ok: false, failure: read.failure };
    leads.push(...read.value.items);
    if (read.value.next === null) break;
    after = read.value.next;
  }
  leads.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const known = await dependencies.db.forOrg(page.organizationId, (tx) =>
    tx.metaLead.findMany({
      where: {
        metaLeadId: { in: leads.map((lead) => lead.id) },
        status: { in: ["added", "merged", "duplicate", "erased", "not_added"] },
      },
      select: { metaLeadId: true },
    }),
  );
  return { ok: true, leads, settled: new Set(known.map((row) => row.metaLeadId)) };
}
