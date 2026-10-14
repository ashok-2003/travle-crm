// Builds the files module (spec 9.2): files attached to any record, kept in object storage, counted per
// organization. Callers check that the actor may see or change the record itself; this module checks the rest.
import type { AttachmentRefInput, AttachmentSummary, RequestUploadInput } from "@travel-crm/contracts/files";
import type { PresignedUpload } from "@travel-crm/integrations/storage";
import type { MemberAccess } from "../identity/index.js";
import type { Actor } from "../kernel/index.js";
import { listAttachments, removeAttachment, storageUsedBytes } from "./attachments.js";
import type { DownloadLink, FilesDependencies, GeneratedFile } from "./dependencies.js";
import { downloadLink, systemDownloadLink } from "./downloads.js";
import { confirmUpload, requestUpload, storeGeneratedFile } from "./uploads.js";

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
   * Marks the upload ready once storage holds the promised size and type. Like downloadLink and remove, it names the
   * record the file belongs to: a file of another record is "not found".
   */
  confirmUpload(actor: Actor, input: AttachmentRefInput): Promise<AttachmentSummary>;
  /** A 5-minute link to a ready file. Sensitive files need documents:view_sensitive. */
  downloadLink(actor: MemberAccess, input: AttachmentRefInput): Promise<DownloadLink>;
  /** The record's ready files, sensitive ones marked; their names only for members with documents:view_sensitive. */
  list(actor: Actor, record: { recordType: string; recordId: string }): Promise<AttachmentSummary[]>;
  /** Soft-deletes the file. Only members with documents:view_sensitive may remove a sensitive file. */
  remove(actor: Actor, input: AttachmentRefInput): Promise<void>;
  /** Stores a file the server made and returns it ready; with a chosen attachmentId, a retry stores it once. */
  storeGeneratedFile(actor: Actor, file: GeneratedFile): Promise<AttachmentSummary>;
  /** A link for trusted server code (share links) to an ordinary file; sensitive files are refused. */
  systemDownloadLink(organizationId: string, input: { attachmentId: string }): Promise<DownloadLink>;
  /** Bytes the organization keeps in storage, deleted files included until a purge. */
  storageUsedBytes(organizationId: string): Promise<number>;
}

export function createFiles(dependencies: FilesDependencies): Files {
  return {
    requestUpload: (actor, input) => requestUpload(dependencies, actor, input),
    confirmUpload: (actor, input) => confirmUpload(dependencies, actor, input),
    downloadLink: (actor, input) => downloadLink(dependencies, actor, input),
    list: (actor, record) => listAttachments(dependencies, actor, record),
    remove: (actor, input) => removeAttachment(dependencies, actor, input),
    storeGeneratedFile: (actor, file) => storeGeneratedFile(dependencies, actor, file),
    systemDownloadLink: (organizationId, input) => systemDownloadLink(dependencies, organizationId, input),
    storageUsedBytes: (organizationId) => storageUsedBytes(dependencies, organizationId),
  };
}
