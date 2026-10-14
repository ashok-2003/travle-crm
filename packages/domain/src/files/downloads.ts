// Getting files out of storage: short-lived links, and sensitive files only for those allowed to see them (spec 5).
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import type { AttachmentRefInput } from "@travel-crm/contracts/files";
import { findAttachment, findAttachmentById, storageKeyOf, type AttachmentRow } from "./attachment-row.js";
import type { DownloadLink, FilesDependencies } from "./dependencies.js";

/** Short: a link that leaks in a chat or a log stops working within minutes. */
const DOWNLOAD_URL_SECONDS = 5 * 60;

export async function downloadLink(
  { db, storage }: FilesDependencies,
  actor: MemberAccess,
  input: AttachmentRefInput,
): Promise<DownloadLink> {
  const row = await db.forOrg(actor.organizationId, (tx) => findAttachment(tx, input));
  assertReady(row);
  if (row.sensitive && !actor.permissions.has("documents:view_sensitive")) {
    throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Requires documents:view_sensitive");
  }
  return presign(storage, row);
}

/**
 * For server code that has already decided the viewer may see the file, such as a customer's share link. Sensitive
 * files are refused: they go only to staff who hold documents:view_sensitive.
 */
export async function systemDownloadLink(
  { db, storage }: FilesDependencies,
  organizationId: string,
  input: { attachmentId: string },
): Promise<DownloadLink> {
  const row = await db.forOrg(organizationId, (tx) => findAttachmentById(tx, input.attachmentId));
  assertReady(row);
  if (row.sensitive) {
    throw new DomainError("FORBIDDEN", "SENSITIVE_FILE", "Sensitive files are shown only to staff allowed to see them");
  }
  return presign(storage, row);
}

/** A pending upload hasn't arrived: as far as anyone downloading is concerned, it doesn't exist yet. */
function assertReady(row: AttachmentRow): void {
  if (row.status !== "ready") throw new DomainError("NOT_FOUND", "ATTACHMENT_NOT_FOUND", "No such file");
}

async function presign(storage: ObjectStorage, row: AttachmentRow): Promise<DownloadLink> {
  const expiresAt = new Date(Date.now() + DOWNLOAD_URL_SECONDS * 1000);
  const url = await storage.presignDownload({ key: storageKeyOf(row), fileName: row.fileName }, DOWNLOAD_URL_SECONDS);
  return { url, expiresAt };
}
