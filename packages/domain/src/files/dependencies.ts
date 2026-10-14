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
}

/** A short-lived link that downloads a file. */
export interface DownloadLink {
  url: string;
  expiresAt: Date;
}
