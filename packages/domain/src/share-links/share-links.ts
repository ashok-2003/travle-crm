// Share links (spec 9.3): /p/<token> opens one record for someone who isn't signed in. Links expire, can be revoked,
// and every open is recorded and announced (share-link.opened), so staff can see a customer looked.
import type { ShareLinkSummary } from "@travel-crm/contracts/share-links";
import type { Database, OrgTx } from "@travel-crm/db";
import { publishEvent } from "../jobs/index.js";
import { DomainError, type Actor } from "../kernel/index.js";
import { newShareLinkToken, parseShareLinkToken } from "./token.js";
import { shortenUserAgent, truncateIpAddress } from "./visitor.js";

const DEFAULT_LIFETIME_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;
const RECORD_TYPE_PATTERN = /^[a-z][a-z_]{1,39}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The record a link opens. */
export interface SharedRecord {
  recordType: string;
  recordId: string;
}

export interface NewShareLink extends SharedRecord {
  label: string;
  /** Leave out for 30 days from now; null for a link that never expires. */
  expiresAt?: Date | null | undefined;
}

/** What /p/<token> needs to show the record, once the link has been opened and the open recorded. */
export interface OpenedShareLink extends SharedRecord {
  organizationId: string;
  shareLinkId: string;
  label: string;
  createdBy: string | null;
}

export interface ShareLinkVisitor {
  ipAddress: string | null;
  userAgent: string | null;
}

const notFound = (reason: "LINK_NOT_FOUND" | "LINK_EXPIRED" | "LINK_REVOKED", message: string) =>
  new DomainError("NOT_FOUND", reason, message);

/**
 * Makes a link to a record and returns its token, which is shown once. The caller checks that the actor may share
 * the record; tx must be the actor's organization.
 */
export async function createShareLink(
  tx: OrgTx,
  actor: Actor,
  input: NewShareLink,
  now: Date = new Date(),
): Promise<{ shareLinkId: string; token: string; path: string }> {
  if (!RECORD_TYPE_PATTERN.test(input.recordType)) {
    throw new DomainError("VALIDATION", "INVALID_RECORD_TYPE", "Use a record type like issued_document");
  }
  if (!UUID_PATTERN.test(input.recordId)) {
    throw new DomainError("VALIDATION", "INVALID_RECORD_ID", "The record id must be a UUID");
  }
  const label = input.label.trim();
  if (label.length === 0 || label.length > 200) {
    throw new DomainError("VALIDATION", "INVALID_LABEL", "Give the link a label of 1 to 200 characters");
  }
  const expiresAt =
    input.expiresAt === undefined ? new Date(now.getTime() + DEFAULT_LIFETIME_MILLISECONDS) : input.expiresAt;
  if (expiresAt !== null && expiresAt <= now) {
    throw new DomainError("VALIDATION", "EXPIRY_IN_THE_PAST", "A link must expire in the future");
  }
  const { token, secretHash } = newShareLinkToken(actor.organizationId);
  const link = await tx.shareLink.create({
    // organizationId is set, not defaulted: the token names actor.organizationId, so row-level security must agree.
    data: {
      organizationId: actor.organizationId,
      tokenHash: secretHash,
      recordType: input.recordType,
      recordId: input.recordId,
      label,
      createdBy: actor.userId,
      expiresAt,
    },
    select: { id: true },
  });
  return { shareLinkId: link.id, token, path: `/p/${token}` };
}

/** Turns a link off for good. Revoking a revoked link changes nothing. */
export async function revokeShareLink(tx: OrgTx, actor: Actor, input: { shareLinkId: string }): Promise<void> {
  const link = UUID_PATTERN.test(input.shareLinkId)
    ? await tx.shareLink.findUnique({ where: { id: input.shareLinkId }, select: { revokedAt: true } })
    : null;
  if (!link) throw notFound("LINK_NOT_FOUND", "No such link");
  if (link.revokedAt) return;
  await tx.shareLink.update({
    where: { id: input.shareLinkId },
    data: { revokedAt: new Date(), revokedBy: actor.userId },
  });
}

/**
 * Opens a link for a visitor: checks it, records the open and publishes share-link.opened in one transaction, and
 * says which record to show. Unknown, expired and revoked links are NOT_FOUND with a reason the page can explain.
 */
export async function openShareLink(
  db: Pick<Database, "forOrg">,
  token: string,
  visitor: ShareLinkVisitor,
  now: Date = new Date(),
): Promise<OpenedShareLink> {
  const parsed = parseShareLinkToken(token);
  if (!parsed) throw notFound("LINK_NOT_FOUND", "This link doesn't work");
  const { organizationId, secretHash } = parsed;
  return db.forOrg(organizationId, async (tx) => {
    const link = await tx.shareLink.findUnique({
      where: { organizationId_tokenHash: { organizationId, tokenHash: secretHash } },
    });
    if (!link) throw notFound("LINK_NOT_FOUND", "This link doesn't work");
    if (link.revokedAt) throw notFound("LINK_REVOKED", "This link has been turned off");
    if (link.expiresAt && link.expiresAt <= now) throw notFound("LINK_EXPIRED", "This link has expired");
    const open = await tx.shareLinkOpen.create({
      data: {
        shareLinkId: link.id,
        openedAt: now,
        ipAddress: truncateIpAddress(visitor.ipAddress),
        userAgent: shortenUserAgent(visitor.userAgent),
      },
      select: { id: true },
    });
    await publishEvent(tx, { type: "share-link.opened", payload: { shareLinkId: link.id, openId: open.id } });
    return {
      organizationId,
      shareLinkId: link.id,
      recordType: link.recordType,
      recordId: link.recordId,
      label: link.label,
      createdBy: link.createdBy,
    };
  });
}

/** A record's links, newest first, with how often and when they were last opened, for staff. */
export async function listShareLinks(tx: OrgTx, record: SharedRecord): Promise<ShareLinkSummary[]> {
  const links = await tx.shareLink.findMany({
    where: { recordType: record.recordType, recordId: record.recordId },
    include: {
      _count: { select: { opens: true } },
      opens: { orderBy: { openedAt: "desc" }, take: 1, select: { openedAt: true } },
    },
    // UUID v7 ids made in the same millisecond needn't sort in order; the creation time does.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return links.map((link) => ({
    id: link.id,
    recordType: link.recordType,
    recordId: link.recordId,
    label: link.label,
    createdBy: link.createdBy,
    createdAt: link.createdAt.toISOString(),
    expiresAt: link.expiresAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    openCount: link._count.opens,
    lastOpenedAt: link.opens[0]?.openedAt.toISOString() ?? null,
  }));
}
