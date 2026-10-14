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
  /** A link preview, prefetch or HEAD request rather than a customer looking: nothing is recorded or announced. */
  preview: boolean;
}

/** share-link.opened is published at most once per link in this long; every open is still recorded. */
const EVENT_COALESCE_MILLISECONDS = 10 * 60 * 1000;

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
export async function revokeShareLink(
  tx: OrgTx,
  actor: Actor,
  input: { shareLinkId: string },
  now: Date = new Date(),
): Promise<void> {
  const link = UUID_PATTERN.test(input.shareLinkId)
    ? await tx.shareLink.findUnique({ where: { id: input.shareLinkId }, select: { revokedAt: true } })
    : null;
  if (!link) throw notFound("LINK_NOT_FOUND", "No such link");
  if (link.revokedAt) return;
  // Only an unrevoked link is written, so two concurrent revokes write once; the database refuses any other change.
  await tx.shareLink.updateMany({
    where: { id: input.shareLinkId, revokedAt: null },
    data: { revokedAt: now, revokedBy: actor.userId },
  });
}

/**
 * Checks a link and says which record to show, recording nothing. Unknown, expired and revoked links are NOT_FOUND
 * with a reason the page can explain. Record the open with recordShareLinkOpen once the record has been shown.
 */
export async function findShareLink(
  db: Pick<Database, "forOrg">,
  token: string,
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

/**
 * Records that a customer opened a link and publishes share-link.opened, in one transaction. Every open is recorded,
 * but the event goes out at most once per link in 10 minutes. A preview (link preview, prefetch, HEAD) records nothing.
 */
export async function recordShareLinkOpen(
  db: Pick<Database, "forOrg">,
  opened: OpenedShareLink,
  visitor: ShareLinkVisitor,
  now: Date = new Date(),
): Promise<void> {
  if (visitor.preview) return;
  await db.forOrg(opened.organizationId, async (tx) => {
    const latest = await tx.shareLinkOpen.findFirst({
      where: {
        shareLinkId: opened.shareLinkId,
        openedAt: { gt: new Date(now.getTime() - EVENT_COALESCE_MILLISECONDS) },
      },
      select: { id: true },
    });
    const open = await tx.shareLinkOpen.create({
      data: {
        shareLinkId: opened.shareLinkId,
        openedAt: now,
        ipAddress: truncateIpAddress(visitor.ipAddress),
        userAgent: shortenUserAgent(visitor.userAgent),
      },
      select: { id: true },
    });
    if (!latest) {
      await publishEvent(tx, {
        type: "share-link.opened",
        payload: { shareLinkId: opened.shareLinkId, openId: open.id },
      });
    }
  });
}

/** Checks a link and records the open (unless the visitor is a preview), in one call: findShareLink, then recordShareLinkOpen. */
export async function openShareLink(
  db: Pick<Database, "forOrg">,
  token: string,
  visitor: ShareLinkVisitor,
  now: Date = new Date(),
): Promise<OpenedShareLink> {
  const opened = await findShareLink(db, token, now);
  await recordShareLinkOpen(db, opened, visitor, now);
  return opened;
}

/** A record's links, newest first, with how often and when they were last opened, for staff. */
export async function listShareLinks(tx: OrgTx, record: SharedRecord): Promise<ShareLinkSummary[]> {
  if (!UUID_PATTERN.test(record.recordId)) {
    throw new DomainError("VALIDATION", "INVALID_RECORD_ID", "The record id must be a UUID");
  }
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
