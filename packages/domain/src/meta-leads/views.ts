// What the Meta screens read about a Page (spec 3.1, 3.3): the list with its badges, the detail, and the leads that
// couldn't be added. Outputs are the contracts' shapes; none holds a token or an answer.
import type {
  MetaPageBadge,
  MetaPageDetail,
  MetaPageList,
  MetaProblemList,
  MetaProblemReason,
} from "@travel-crm/contracts/meta-leads";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { maxMetaPagesPerOrganization } from "./limits.js";
import { findPage, toPageRow, type MetaPageRow } from "./page-row.js";

/** The page is late when its last check is more than an hour old (two catch-up intervals), though it is running. */
const LATE_MS = 60 * 60 * 1000;

/** What the badge says (spec 3.1): a form that needs a look makes a running Page amber. */
export function badgeOf(
  page: Pick<MetaPageRow, "status" | "attentionSince">,
  formNeedsAttention: boolean,
): MetaPageBadge {
  if (page.status === "needs_reconnect") return "needs_reconnect";
  if (page.status === "paused") return "paused";
  return formNeedsAttention || page.attentionSince !== null ? "needs_attention" : "running";
}

/** The agency's Pages, newest first, with how many forms each has brought in. */
export async function listPages(tx: OrgTx, facts: { configured: boolean; demo: boolean }): Promise<MetaPageList> {
  const pages = (
    await tx.metaPage.findMany({
      where: { status: { in: ["running", "paused", "needs_reconnect"] } },
      orderBy: { id: "desc" },
    })
  ).map(toPageRow);
  const forms = await tx.metaForm.findMany({
    where: { metaPageId: { in: pages.map((page) => page.id) }, state: { not: "not_brought_in" } },
    select: { metaPageId: true, state: true },
  });
  return {
    items: pages.map((page) => {
      const own = forms.filter((form) => form.metaPageId === page.id);
      return {
        id: page.id,
        pageName: page.pageName,
        badge: badgeOf(
          page,
          own.some((form) => form.state === "needs_attention"),
        ),
        formsBroughtIn: own.length,
        lastCheckedAt: page.lastCheckedAt?.toISOString() ?? null,
      };
    }),
    limit: maxMetaPagesPerOrganization,
    configured: facts.configured,
    demo: facts.demo,
  };
}

/** A Page's detail but for the connector's name, which the api adds from identity. */
export type MetaPageDetailFacts = Omit<MetaPageDetail, "connectedBy"> & { connectedByUserId: string };

export async function pageDetailOf(
  tx: OrgTx,
  pageRowId: string,
  facts: { readOnly: boolean; now: Date },
): Promise<MetaPageDetailFacts> {
  const page = await findPage(tx, pageRowId);
  const attention = await tx.metaForm.count({ where: { metaPageId: page.id, state: "needs_attention" } });
  const problems = await tx.metaLead.count({
    where: { status: "not_added", resolvedAt: null, formId: { in: await formIdsOf(tx, page.id) } },
  });
  return {
    id: page.id,
    pageName: page.pageName,
    status: page.status,
    badge: badgeOf(page, attention > 0),
    attentionSince: page.attentionSince?.toISOString() ?? null,
    connectedByUserId: page.connectedBy,
    connectedAt: page.createdAt.toISOString(),
    lastCheckedAt: page.lastCheckedAt?.toISOString() ?? null,
    tokenExpiresAt: page.tokenExpiresAt?.toISOString() ?? null,
    checkRunning: false,
    late:
      page.status === "running" &&
      page.lastCheckedAt !== null &&
      facts.now.getTime() - page.lastCheckedAt.getTime() > LATE_MS,
    readOnly: facts.readOnly,
    counts: {
      added: page.leadsAdded,
      mergedIntoExisting: page.leadsMerged,
      duplicates: page.leadsDuplicate,
      couldntBeAdded: problems,
    },
  };
}

async function formIdsOf(tx: OrgTx, pageRowId: string): Promise<string[]> {
  return (await tx.metaForm.findMany({ where: { metaPageId: pageRowId }, select: { formId: true } })).map(
    (form) => form.formId,
  );
}

/** The leads that couldn't be added, oldest first, with their form's name; hidden ones are left out. */
export async function metaProblems(
  tx: OrgTx,
  pageRowId: string,
  options: { after?: string | undefined; limit: number },
): Promise<MetaProblemList> {
  const page = await findPage(tx, pageRowId);
  const forms = await tx.metaForm.findMany({
    where: { metaPageId: page.id },
    select: { formId: true, formName: true },
  });
  const rows = await tx.metaLead.findMany({
    where: {
      status: "not_added",
      resolvedAt: null,
      formId: { in: forms.map((form) => form.formId) },
      ...(options.after === undefined ? {} : { id: { gt: options.after } }),
    },
    orderBy: { id: "asc" },
    take: options.limit + 1,
  });
  const shown = rows.slice(0, options.limit);
  return {
    items: shown.map((row) => ({
      id: row.id,
      formName: forms.find((form) => form.formId === row.formId)?.formName ?? null,
      reasons: row.reasons as MetaProblemReason[],
      exampleName: row.exampleName,
      platform: row.platform as "facebook" | "instagram" | "other" | null,
      firstSeenAt: row.firstSeenAt.toISOString(),
    })),
    next: rows.length > options.limit ? (shown.at(-1)?.id ?? null) : null,
  };
}

/** Hide: the problem leaves the list and its example is emptied; the ledger row stays, so the lead is not tried again by itself. */
export async function hideProblem(
  tx: OrgTx,
  access: MemberAccess,
  pageRowId: string,
  leadRowId: string,
  now: Date,
): Promise<void> {
  const page = await findPage(tx, pageRowId);
  const forms = await formIdsOf(tx, page.id);
  const row = await tx.metaLead.findFirst({ where: { id: leadRowId, status: "not_added", formId: { in: forms } } });
  if (row === null) return;
  await tx.metaLead.update({ where: { id: row.id }, data: { resolvedAt: now, exampleName: null } });
  await recordAudit(tx, access, {
    action: "meta.problem-hidden",
    entityType: "meta_page",
    entityId: page.id,
    after: { metaLeadId: row.metaLeadId },
  });
}
