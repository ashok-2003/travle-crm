// An in-memory ObjectStorage for tests: it keeps files in a Map and checks a simulated browser upload the way S3
// checks a presigned one (same size and type, before it expires).
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
        const expiresAt = new Date(now().getTime() + expiresInSeconds * 1000);
        return {
          url: `memory://upload/${encodeURIComponent(key)}`,
          method: "PUT" as const,
          headers: { "content-type": contentType, "content-length": String(sizeBytes) },
          expiresAt,
        };
      }),
    presignDownload: ({ key, fileName }, expiresInSeconds) =>
      promised(() => {
        const expires = String(now().getTime() + expiresInSeconds * 1000);
        return `memory://download/${encodeURIComponent(key)}?name=${encodeURIComponent(fileName)}&expires=${expires}`;
      }),
    put: ({ key, contentType, body }) =>
      promised(() => {
        objects.set(key, { body: body.slice(), contentType });
      }),
    head: (key) =>
      promised((): StoredObject | null => {
        const object = objects.get(key);
        return object ? { sizeBytes: object.body.byteLength, contentType: object.contentType } : null;
      }),
    get: (key) => promised(() => objects.get(key)?.body.slice() ?? null),
    upload: (upload, body, contentType) =>
      promised(() => {
        if (now() > upload.expiresAt) throw new Error("The upload URL has expired");
        if (contentType !== upload.headers["content-type"]) throw new Error("The content type is not the signed one");
        if (String(body.byteLength) !== upload.headers["content-length"])
          throw new Error("The size is not the signed one");
        const key = decodeURIComponent(new URL(upload.url).pathname.slice(1));
        objects.set(key, { body: body.slice(), contentType });
      }),
  };
}
