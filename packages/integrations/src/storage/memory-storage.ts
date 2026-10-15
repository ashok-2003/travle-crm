// An in-memory ObjectStorage for tests: it keeps files in a Map and checks a simulated browser upload the way S3
// checks a presigned one (same size and type, before it expires).
import { assertExpiry, assertPositiveSize, assertSafeKey } from "./checks.js";
import type { ObjectStorage, PresignedUpload, StoredObject } from "./object-storage.js";

interface MemoryObject {
  body: Uint8Array;
  contentType: string;
}

export interface MemoryStorage extends ObjectStorage {
  /** Everything stored, by key. */
  readonly objects: ReadonlyMap<string, MemoryObject>;
  /** Plays the browser: PUTs body to a URL from presignUpload. Rejects as S3 would refuse it. */
  upload(upload: PresignedUpload, body: Uint8Array, contentType: string): Promise<void>;
}

/** Runs fn as a promise, so a throw becomes a rejection, as with a real network call. */
function promised<T>(fn: () => T): Promise<T> {
  return new Promise((resolve) => {
    resolve(fn());
  });
}

export function createMemoryStorage(now: () => Date = () => new Date()): MemoryStorage {
  const objects = new Map<string, MemoryObject>();

  return {
    objects,
    presignUpload: ({ key, contentType, sizeBytes }, expiresInSeconds) =>
      promised(() => {
        assertSafeKey(key);
        assertPositiveSize(sizeBytes);
        assertExpiry(expiresInSeconds);
        const expiresAt = new Date(now().getTime() + expiresInSeconds * 1000);
        return {
          url: `memory://upload/${encodeURIComponent(key)}`,
          method: "PUT" as const,
          headers: { "content-type": contentType, "content-length": String(sizeBytes), "if-none-match": "*" },
          expiresAt,
        };
      }),
    presignDownload: ({ key, fileName }, expiresInSeconds) =>
      promised(() => {
        assertSafeKey(key);
        assertExpiry(expiresInSeconds);
        const expires = String(now().getTime() + expiresInSeconds * 1000);
        return `memory://download/${encodeURIComponent(key)}?name=${encodeURIComponent(fileName)}&expires=${expires}`;
      }),
    put: ({ key, contentType, body }) =>
      promised(() => {
        assertSafeKey(key);
        objects.set(key, { body: body.slice(), contentType });
      }),
    copy: (from, to) =>
      promised(() => {
        assertSafeKey(from);
        assertSafeKey(to);
        const object = objects.get(from);
        if (!object) return false;
        objects.set(to, { body: object.body.slice(), contentType: object.contentType });
        return true;
      }),
    head: (key) =>
      promised((): StoredObject | null => {
        assertSafeKey(key);
        const object = objects.get(key);
        return object ? { sizeBytes: object.body.byteLength, contentType: object.contentType } : null;
      }),
    get: (key) =>
      promised(() => {
        assertSafeKey(key);
        return objects.get(key)?.body.slice() ?? null;
      }),
    delete: (key) =>
      promised(() => {
        assertSafeKey(key);
        objects.delete(key);
      }),
    upload: (upload, body, contentType) =>
      promised(() => {
        if (now() > upload.expiresAt) throw new Error("The upload URL has expired");
        if (contentType !== upload.headers["content-type"]) throw new Error("The content type is not the signed one");
        if (String(body.byteLength) !== upload.headers["content-length"])
          throw new Error("The size is not the signed one");
        const key = decodeURIComponent(new URL(upload.url).pathname.slice(1));
        if (objects.has(key)) throw new Error("A file is already stored under this key");
        objects.set(key, { body: body.slice(), contentType });
      }),
  };
}
