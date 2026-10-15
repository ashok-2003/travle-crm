// What the files module is built from, and the shapes its operations share.
import type { Database } from "@travel-crm/db";
import type { ObjectStorage } from "@travel-crm/integrations/storage";

export interface FilesDependencies {
  db: Database;
  storage: ObjectStorage;
  /** The organization's storage limit in bytes, or null for none. Plan 4 passes its plan's limit; unset means none. */
  storageLimitBytes?: ((organizationId: string) => Promise<number | null>) | undefined;
}

/** A file the server made itself, such as a rendered PDF. */
export interface GeneratedFile {
  recordType: string;
  recordId: string;
  fileName: string;
  contentType: string;
  body: Uint8Array;
  sensitive?: boolean | undefined;
  /**
   * A UUID the caller chooses, so a retried job stores the file once: a file already stored under it for the same
   * record is returned as it is. The first run's file name and sensitive flag win: a retry with others changes neither.
   */
  attachmentId?: string | undefined;
}

/** A stored file's bytes and the type it was stored as, for server code that draws it into something it makes. */
export interface StoredFile {
  body: Uint8Array;
  contentType: string;
}

/** A short-lived link that downloads a file. */
export interface DownloadLink {
  url: string;
  expiresAt: Date;
}
