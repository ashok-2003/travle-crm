// A meta_page row as the module reads it, every fixed value typed by its contract's list (the table's CHECKs hold the same
// lists), and the ways to find a Page of the signed-in agency.
import type { MetaPageStatus } from "@travel-crm/contracts/meta-leads";
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";

export interface MetaPageRow {
  organizationId: string;
  /** Our id for the connection; Meta's is `pageId`. */
  id: string;
  pageId: string;
  pageName: string;
  status: MetaPageStatus;
  tokenCiphertext: Uint8Array | null;
  tokenNonce: Uint8Array | null;
  tokenKeyVersion: number | null;
  tokenKind: "user_long_lived" | "system_user" | null;
  tokenExpiresAt: Date | null;
  metaUserId: string;
  connectedBy: string;
  impersonatedBy: string | null;
  subscribedAt: Date | null;
  formsReadAt: Date | null;
  lastCheckedAt: Date | null;
  lastOkAt: Date | null;
  consecutiveFailures: number;
  attentionSince: Date | null;
  leadsAdded: number;
  leadsMerged: number;
  leadsDuplicate: number;
  createdAt: Date;
  disconnectedAt: Date | null;
}

type StoredPage = NonNullable<Awaited<ReturnType<OrgTx["metaPage"]["findFirst"]>>>;

export function toPageRow(row: StoredPage): MetaPageRow {
  return {
    ...row,
    status: row.status as MetaPageStatus,
    tokenKind: row.tokenKind as MetaPageRow["tokenKind"],
  };
}

export const pageNotFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "No such Page");

export const pageNotReady = () =>
  new DomainError("CONFLICT", "META_PAGE_NOT_READY", "This Page is at another step than the one asked for");

/** The agency's Page, not disconnected and not a draft; another agency's, a missing one and the rest are not found. */
export async function findPage(tx: OrgTx, pageRowId: string): Promise<MetaPageRow> {
  const row = await tx.metaPage.findFirst({
    where: { id: pageRowId, status: { notIn: ["disconnected", "connecting"] } },
  });
  if (row === null) throw pageNotFound();
  return toPageRow(row);
}

/** The Page as it stands, whatever its status, for a job's first look; null when there is none. */
export async function pageOf(tx: OrgTx, pageRowId: string): Promise<MetaPageRow | null> {
  const row = await tx.metaPage.findUnique({ where: { id: pageRowId } });
  return row === null ? null : toPageRow(row);
}

/** The agency's live connection of a Meta Page id (not disconnected), or null. */
export async function livePageByMetaId(tx: OrgTx, metaPageId: string): Promise<MetaPageRow | null> {
  const row = await tx.metaPage.findFirst({ where: { pageId: metaPageId, status: { not: "disconnected" } } });
  return row === null ? null : toPageRow(row);
}

/**
 * The Page's row, locked until the transaction ends, so two runs of one step take turns. FOR NO KEY UPDATE, not FOR
 * UPDATE: a ledger row inserted meanwhile needs no wait.
 */
export async function holdPage(tx: OrgTx, pageRowId: string): Promise<MetaPageRow | null> {
  await tx.$queryRaw`SELECT id FROM meta_page WHERE id = ${pageRowId}::uuid FOR NO KEY UPDATE`;
  return pageOf(tx, pageRowId);
}

/** The statuses whose Pages have a route and are read: a paused Page keeps its route so the webhook is ignored on purpose. */
export const routedStatuses: readonly MetaPageStatus[] = ["running", "paused", "needs_reconnect"];
