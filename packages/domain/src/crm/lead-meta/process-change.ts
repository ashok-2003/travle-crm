// The webhook's work for one change (M7, M8): a lead's ids arrive, the worker fetches the lead with the Page's token inside
// the organization's Graph budget, and saves it through the one save path, keyed on the Meta lead id in the ledger. Each
// change of a delivery is handled on its own, so one bad change never blocks its neighbours. Runs at least once per event.
import type { MetaLeadgenChange } from "@travel-crm/contracts/meta-leads";
import { ownMessage } from "@travel-crm/integrations/jobs";
import {
  callGraph,
  enterNeedsReconnect,
  formByMetaId,
  isSettled,
  claimLedger,
  isTransient,
  lacksPermission,
  livePageByMetaId,
  metaServices,
  needsReconnect,
  openPageToken,
  storedMatches,
  writeOutcome,
} from "../../meta-leads/index.js";
import { agencyFactsOf, mayBringIn, type AgencyDependencies } from "./agency-facts.js";
import { skipLeadOfUnbroughtForm, type SkipDependencies } from "./new-form-notice.js";
import { saveFetchedLead } from "./save-fetched-lead.js";

export type MetaProcessDependencies = SkipDependencies & AgencyDependencies;

export type ChangeResult =
  | "page_inactive"
  | "closed"
  | "form_not_brought_in"
  | "settled"
  | "added"
  | "merged"
  | "not_added"
  | "needs_reconnect"
  | "lead_gone";

/** Handles one change of a delivery for the organization its Page belongs to. Throws only to be retried (a transient failure). */
export async function processLeadgenChange(
  dependencies: MetaProcessDependencies,
  organizationId: string,
  change: MetaLeadgenChange,
  now: Date,
): Promise<ChangeResult> {
  const { db } = dependencies;
  const services = metaServices(dependencies);
  if (services === null) throw ownMessage(new Error("Meta is not set up on this process"));
  const read = await db.forOrg(organizationId, async (tx) => {
    const page = await livePageByMetaId(tx, change.pageId);
    // A paused Page or one that needs a reconnect is ignored on purpose: the catch-up finds the lead once it runs again (M7).
    if (page?.status !== "running") return { stop: "page_inactive" as const };
    const form = await formByMetaId(tx, change.formId);
    if (form === null || form.state === "not_brought_in") return { stop: "form_not_brought_in" as const, page };
    return { page, form, matches: await storedMatches(tx, form.id) };
  });
  if ("stop" in read) {
    if (read.stop === "page_inactive") return "page_inactive";
    if (!(await mayBringIn(dependencies, organizationId))) return "closed";
    await skipLeadOfUnbroughtForm(dependencies, read.page, change, now);
    return "form_not_brought_in";
  }
  const { page, form, matches } = read;
  if (!(await mayBringIn(dependencies, organizationId))) return "closed";
  // A lead already settled ends here, and a repeat delivery is counted as the duplicate it is (M11, M7 step 3).
  const row = await db.forOrg(organizationId, async (tx) => {
    const claimed = await claimLedger(tx, { metaLeadId: change.leadgenId, formId: form.formId, now });
    if (isSettled(claimed))
      await tx.metaPage.update({ where: { id: page.id }, data: { leadsDuplicate: { increment: 1 } } });
    return claimed;
  });
  if (isSettled(row)) return "settled";
  const token = openPageToken(services.secretBox, page);
  if (token === null) {
    await db.forOrg(organizationId, (tx) => enterNeedsReconnect(tx, page, now));
    return "needs_reconnect";
  }
  // Outside any transaction: a request to Meta must not hold a database connection.
  const fetched = await callGraph(dependencies, organizationId, "webhook", () =>
    services.graph.getLead(change.leadgenId, token),
  );
  if (!fetched.ok) {
    const { failure } = fetched;
    if (needsReconnect(failure)) {
      await db.forOrg(organizationId, (tx) => enterNeedsReconnect(tx, page, now));
      return "needs_reconnect";
    }
    if (isTransient(failure)) throw ownMessage(new Error(`Meta lead fetch failed: ${failure.reason}`));
    // Permanent for this lead (deleted, or no permission to it): written down, never retried by itself (M8).
    await db.forOrg(organizationId, (tx) =>
      writeOutcome(
        tx,
        row,
        {
          status: "not_added",
          reasons: [lacksPermission(failure) ? "lead_not_allowed" : "lead_not_found"],
          exampleName: null,
        },
        { createdAtMeta: now, platform: "other", now },
      ),
    );
    return "lead_gone";
  }
  const agency = await agencyFactsOf(dependencies, organizationId);
  if (agency === null) return "closed";
  const saved = await saveFetchedLead(db, { page, form, matches, agency, notify: "each" }, fetched.value, now);
  if (saved.kind === "settled") return "settled";
  return saved.kind === "saved" ? saved.status : "not_added";
}
