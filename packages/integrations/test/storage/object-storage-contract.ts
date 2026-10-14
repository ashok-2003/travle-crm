// The behaviour every ObjectStorage adapter shares, run against each one: the in-memory adapter that other tests
// rely on is proven to act like S3 where it matters.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ObjectStorage, PresignedUpload } from "../../src/storage/index.js";

export interface StorageUnderTest {
  storage: ObjectStorage;
  /** Plays the browser: sends the file to the presigned URL. Rejects when storage refuses it. */
  upload(upload: PresignedUpload, body: Uint8Array, contentType: string): Promise<void>;
  stop(): Promise<void>;
}

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (body: Uint8Array | null) => (body ? new TextDecoder().decode(body) : null);

/** Every adapter's test calls this once, with a way to start the adapter (and its server, if any). */
export function describeObjectStorage(name: string, start: () => Promise<StorageUnderTest>): void {
  describe(`${name}: the storage port`, () => {
    let subject: StorageUnderTest;
    let next = 0;
    const freshKey = () => `organizations/contract/attachments/${String((next += 1))}`;

    beforeAll(async () => {
      subject = await start();
    });

    afterAll(async () => {
      await subject.stop();
    });

    it("accepts an upload that matches its signature, and reads it back", async () => {
      const key = freshKey();
      const upload = await subject.storage.presignUpload({ key, contentType: "application/pdf", sizeBytes: 5 }, 60);
      expect(upload.method).toBe("PUT");
      expect(upload.headers).toMatchObject({ "content-type": "application/pdf", "content-length": "5" });
      expect(upload.expiresAt.getTime()).toBeGreaterThan(Date.now());

      await subject.upload(upload, bytes("hello"), "application/pdf");

      expect(await subject.storage.head(key)).toEqual({ sizeBytes: 5, contentType: "application/pdf" });
      expect(text(await subject.storage.get(key))).toBe("hello");
    });

    it("refuses an upload of another size", async () => {
      const key = freshKey();
      const upload = await subject.storage.presignUpload({ key, contentType: "image/png", sizeBytes: 5 }, 60);
      await expect(subject.upload(upload, bytes("hello, world"), "image/png")).rejects.toThrow();
      expect(await subject.storage.head(key)).toBeNull();
    });

    it("refuses an upload of another type", async () => {
      const key = freshKey();
      const upload = await subject.storage.presignUpload({ key, contentType: "image/png", sizeBytes: 5 }, 60);
      await expect(subject.upload(upload, bytes("hello"), "text/html")).rejects.toThrow();
      expect(await subject.storage.head(key)).toBeNull();
    });

    it("stores a file the server made", async () => {
      const key = freshKey();
      await subject.storage.put({ key, contentType: "application/pdf", body: bytes("%PDF-1.3") });
      expect(await subject.storage.head(key)).toEqual({ sizeBytes: 8, contentType: "application/pdf" });
      expect(text(await subject.storage.get(key))).toBe("%PDF-1.3");
    });

    it("answers null, not an error, for a key with nothing stored", async () => {
      expect(await subject.storage.head("organizations/contract/attachments/missing")).toBeNull();
      expect(await subject.storage.get("organizations/contract/attachments/missing")).toBeNull();
    });

    it("presigns a download URL", async () => {
      const url = await subject.storage.presignDownload({ key: freshKey(), fileName: "Quote.pdf" }, 60);
      expect(typeof url).toBe("string");
      expect(url.length).toBeGreaterThan(0);
    });
  });
}
