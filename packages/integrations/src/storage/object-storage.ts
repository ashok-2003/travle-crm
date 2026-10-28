// The storage port (spec 9.2): what the domain needs from an S3-compatible object store. Files go straight between
// the browser and storage through short-lived presigned URLs; the api never streams them.

/** An upload the browser makes itself, straight to storage. */
export interface PresignedUpload {
  url: string;
  method: "PUT";
  /** Headers the browser must send exactly as given: they are signed, so a different size or type is refused. */
  headers: Record<string, string>;
  expiresAt: Date;
}

/** What storage knows about a stored file. */
export interface StoredObject {
  sizeBytes: number;
  contentType: string | null;
}

export interface ObjectStorage {
  /**
   * A URL the browser PUTs exactly this file to: its size and content type are part of the signature, and it
   * refuses to replace a file already stored under key (the returned headers include `if-none-match: *`).
   * Keys are refused with a RangeError when empty, over 1024 bytes, absolute, dotted, or holding control characters
   * or backslashes; sizeBytes must be a positive safe integer and expiresInSeconds a positive integer up to 7 days.
   */
  presignUpload(
    object: { key: string; contentType: string; sizeBytes: number },
    expiresInSeconds: number,
  ): Promise<PresignedUpload>;
  /**
   * A URL that downloads the file and saves it under fileName. With `inline`, one the browser may open in place, which needs the
   * file's `contentType` from our own record: the adapter refuses (RangeError) any type that is not a photo, video, voice note
   * or PDF, so an SVG or an HTML page is only ever saved, and it tells the browser that type, not the object's own.
   */
  presignDownload(
    object: { key: string; fileName: string; inline?: boolean; contentType?: string },
    expiresInSeconds: number,
  ): Promise<string>;
  /** Stores a file the server made itself, such as a rendered PDF. */
  put(object: { key: string; contentType: string; body: Uint8Array }): Promise<void>;
  /**
   * Copies the file stored under `from` to `to`, with its content type, replacing whatever `to` held: inside the
   * store (S3's CopyObject), so the bytes never pass through the api. Returns false, copying nothing, when `from`
   * holds nothing. The platform's export uses it, to keep an organization's files beside the export (spec 5).
   */
  copy(from: string, to: string): Promise<boolean>;
  /** The stored file's size and type, or null when nothing is stored under key. */
  head(key: string): Promise<StoredObject | null>;
  /** The stored file's bytes, or null when nothing is stored under key. */
  get(key: string): Promise<Uint8Array | null>;
  /**
   * Deletes the file stored under key, for good: the platform's purge and erasure only (spec 5). Deleting a key that
   * holds nothing succeeds, so a purge that stopped halfway can run again.
   */
  delete(key: string): Promise<void>;
  /**
   * Deletes every file stored under prefix, for good, and returns how many: the platform's purge of one organization's
   * folder (spec 5). The prefix ends in "/" and is at least two folders deep ("organizations/<id>/"); anything else is
   * a RangeError. Safe to repeat: an empty folder deletes nothing.
   */
  deletePrefix(prefix: string): Promise<number>;
}
