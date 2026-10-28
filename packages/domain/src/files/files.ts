// Builds the files module (spec 9.2): files attached to any record, kept in object storage, counted per
// organization. Callers check that the actor may see or change the record itself; this module checks the rest.
import type { AttachmentRefInput, AttachmentSummary, RequestUploadInput } from "@travel-crm/contracts/files";
import type { PresignedUpload } from "@travel-crm/integrations/storage";
import type { MemberAccess } from "../identity/index.js";
import type { Actor } from "../kernel/index.js";
import { listAttachments, listAttachmentsOfRecords, removeAttachment, storageUsedBytes } from "./attachments.js";
import type { DownloadLink, FilesDependencies, GeneratedFile, StoredFile } from "./dependencies.js";
import { downloadLink, systemDownloadLink, systemFile } from "./downloads.js";
import { copyFile } from "./copies.js";
import { confirmUpload, requestUpload, storeGeneratedFile, type StoredBytesCheck } from "./uploads.js";

export interface Files {
  /**
   * Records a pending file and gives the URL the browser uploads it to (10 minutes). The URL can be used once: a
   * retried PUT answered 412 means the first one arrived, so the client should call confirmUpload, which is idempotent.
   */
  requestUpload(
    actor: Actor,
    input: RequestUploadInput,
  ): Promise<{ attachment: AttachmentSummary; upload: PresignedUpload }>;
  /**
   * Marks the upload ready once storage holds the promised size and type, and `check` (when given) passes on the
   * stored bytes. Like downloadLink and remove, it names the record the file belongs to: a file of another record is
   * "not found".
   */
  confirmUpload(actor: Actor, input: AttachmentRefInput, check?: StoredBytesCheck): Promise<AttachmentSummary>;
  /** A 5-minute link to a ready file. Sensitive files need documents:view_sensitive. With `inline`, the browser may open it in place. */
  downloadLink(actor: MemberAccess, input: AttachmentRefInput, options?: { inline?: boolean }): Promise<DownloadLink>;
  /** The record's ready files, sensitive ones marked; their names only for members with documents:view_sensitive. */
  list(actor: Actor, record: { recordType: string; recordId: string }): Promise<AttachmentSummary[]>;
  /** `list` for many records of one type in one query, by record id. */
  listForRecords(
    actor: Actor,
    recordType: string,
    recordIds: readonly string[],
  ): Promise<Map<string, AttachmentSummary[]>>;
  /** Soft-deletes the file. Only members with documents:view_sensitive may remove a sensitive file. */
  remove(actor: Actor, input: AttachmentRefInput): Promise<void>;
  /** Stores a file the server made and returns it ready; with a chosen attachmentId, a retry stores it once. */
  storeGeneratedFile(actor: Actor, file: GeneratedFile): Promise<AttachmentSummary>;
  /** A ready file copied onto another record inside storage (a trip's file sent as a WhatsApp message's). */
  copyFile(
    actor: Actor,
    from: AttachmentRefInput,
    to: { recordType: string; recordId: string },
  ): Promise<AttachmentSummary>;
  /** A link for trusted server code (share links) to an ordinary file; sensitive files are refused. */
  systemDownloadLink(organizationId: string, input: { attachmentId: string }): Promise<DownloadLink>;
  /** An ordinary file's bytes, named by its record, for server code that draws it (a logo on a PDF). */
  systemFile(organizationId: string, input: AttachmentRefInput): Promise<StoredFile>;
  /** Bytes the organization keeps in storage, deleted files included until a purge. */
  storageUsedBytes(organizationId: string): Promise<number>;
}

export function createFiles(dependencies: FilesDependencies): Files {
  return {
    requestUpload: (actor, input) => requestUpload(dependencies, actor, input),
    confirmUpload: (actor, input, check) => confirmUpload(dependencies, actor, input, check),
    downloadLink: (actor, input, options) => downloadLink(dependencies, actor, input, options),
    list: (actor, record) => listAttachments(dependencies, actor, record),
    listForRecords: (actor, recordType, recordIds) =>
      listAttachmentsOfRecords(dependencies, actor, recordType, recordIds),
    remove: (actor, input) => removeAttachment(dependencies, actor, input),
    storeGeneratedFile: (actor, file) => storeGeneratedFile(dependencies, actor, file),
    copyFile: (actor, from, to) => copyFile(dependencies, actor, from, to),
    systemDownloadLink: (organizationId, input) => systemDownloadLink(dependencies, organizationId, input),
    systemFile: (organizationId, input) => systemFile(dependencies, organizationId, input),
    storageUsedBytes: (organizationId) => storageUsedBytes(dependencies, organizationId),
  };
}
