// Check again, on a lead that couldn't be added (spec 3.3): the lead is read from Meta once more and goes through the same
// save, so a phone the agency has since fixed in the form's match, or a name Meta now returns, makes it a lead. Only a
// problem of the Page's own forms can be asked for again.
import { DomainError } from "../../kernel/index.js";
import type { MemberAccess } from "../../identity/index.js";
import {
  callGraph,
  findPage,
  formByMetaId,
  metaRefusals,
  metaServices,
  needsReconnect,
  openPageToken,
  storedMatches,
} from "../../meta-leads/index.js";
import { agencyFactsOf, mayBringIn } from "./agency-facts.js";
import type { MetaProcessDependencies } from "./process-change.js";
import { saveFetchedLead } from "./save-fetched-lead.js";

export type RetryResult = "added" | "merged" | "not_added" | "settled";

export async function retryMetaLead(
  dependencies: MetaProcessDependencies,
  access: MemberAccess,
  input: { pageId: string; leadRowId: string },
  now: Date,
): Promise<RetryResult> {
  const { db } = dependencies;
  const { organizationId } = access;
  const services = metaServices(dependencies);
  if (services === null) throw metaRefusals.notConfigured();
  const found = await db.forOrg(organizationId, async (tx) => {
    const page = await findPage(tx, input.pageId);
    const row = await tx.metaLead.findFirst({ where: { id: input.leadRowId, status: "not_added" } });
    const form = row === null ? null : await formByMetaId(tx, row.formId);
    if (row === null || form?.metaPageId !== page.id) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such lead");
    return { page, row, form, matches: await storedMatches(tx, form.id) };
  });
  const { page, row, form, matches } = found;
  if (!(await mayBringIn(dependencies, organizationId))) {
    throw new DomainError("FORBIDDEN", "ORGANIZATION_READ_ONLY", "This organization is read-only until it pays");
  }
  // One press per lead in half a minute: a loop of presses would burn Meta's limit for every agency.
  const pressed = await dependencies.limiter.hit(`meta-retry:${row.id}`, { limit: 1, windowSeconds: 30 }, now);
  if (!pressed.allowed) throw metaRefusals.checkedJustNow();
  const token = openPageToken(services.secretBox, page);
  if (token === null) throw metaRefusals.unavailable();
  const fetched = await callGraph(dependencies, organizationId, "interactive", () =>
    services.graph.getLead(row.metaLeadId, token),
  );
  if (!fetched.ok) {
    if (fetched.failure.reason === "not_found")
      throw new DomainError("NOT_FOUND", "NOT_FOUND", "Facebook no longer has this lead");
    throw needsReconnect(fetched.failure) ? metaRefusals.permissionMissing() : metaRefusals.unavailable();
  }
  const agency = await agencyFactsOf(dependencies, organizationId);
  if (agency === null) throw metaRefusals.unavailable();
  // The row is made pending again, in the save's own transaction by the ledger hold; a lead settled meanwhile is left alone.
  await db.forOrg(organizationId, (tx) =>
    tx.metaLead.update({ where: { id: row.id }, data: { status: "pending", resolvedAt: null, reasons: [] } }),
  );
  const saved = await saveFetchedLead(db, { page, form, matches, agency, notify: "each" }, fetched.value, now);
  if (saved.kind === "saved") return saved.status;
  return saved.kind;
}
