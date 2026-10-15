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
      await expect(subject.upload(upload, bytes("hello, world"), "image/png")).rejects.toThrow(
        /403|not the signed one/,
      );
      expect(await subject.storage.head(key)).toBeNull();
    });

    it("refuses an upload of another type", async () => {
      const key = freshKey();
      const upload = await subject.storage.presignUpload({ key, contentType: "image/png", sizeBytes: 5 }, 60);
      await expect(subject.upload(upload, bytes("hello"), "text/html")).rejects.toThrow(/403|not the signed one/);
      expect(await subject.storage.head(key)).toBeNull();
    });

    it("stores a file the server made", async () => {
      const key = freshKey();
      await subject.storage.put({ key, contentType: "application/pdf", body: bytes("%PDF-1.3") });
      expect(await subject.storage.head(key)).toEqual({ sizeBytes: 8, contentType: "application/pdf" });
      expect(text(await subject.storage.get(key))).toBe("%PDF-1.3");
    });

    it("deletes a stored file for good, and deleting again or nothing at all succeeds", async () => {
      const key = freshKey();
      await subject.storage.put({ key, contentType: "text/plain", body: bytes("gone soon") });
      await subject.storage.delete(key);
      expect(await subject.storage.head(key)).toBeNull();
      expect(await subject.storage.get(key)).toBeNull();
      await subject.storage.delete(key);
      await subject.storage.delete(freshKey());
      await expect(subject.storage.delete("../escape")).rejects.toThrow(RangeError);
    });

    it("answers null, not an error, for a key with nothing stored", async () => {
      expect(await subject.storage.head("organizations/contract/attachments/missing")).toBeNull();
      expect(await subject.storage.get("organizations/contract/attachments/missing")).toBeNull();
    });

    it("refuses a second upload to a key that already holds a file", async () => {
      const key = freshKey();
      const upload = await subject.storage.presignUpload({ key, contentType: "application/pdf", sizeBytes: 5 }, 60);
      expect(upload.headers).toMatchObject({ "if-none-match": "*" });
      await subject.upload(upload, bytes("hello"), "application/pdf");
      await expect(subject.upload(upload, bytes("HELLO"), "application/pdf")).rejects.toThrow(/412|already stored/);
      expect(text(await subject.storage.get(key))).toBe("hello");
    });

    it("refuses keys that are empty, too long, absolute, dotted, or hold control characters", async () => {
      const badKeys = [
        "",
        "a".repeat(1025),
        "/organizations/x",
        "organizations//x",
        "organizations/./x",
        "organizations/../x",
        "organizations/x/",
        "organizations/a\\b",
        "organizations/a\nb",
        "organizations/a\u0000b",
        "organizations/a\u007fb",
      ];
      for (const key of badKeys) {
        const label = JSON.stringify(key.slice(0, 40));
        const object = { key, contentType: "application/pdf", sizeBytes: 5 };
        await expect(subject.storage.presignUpload(object, 60), label).rejects.toBeInstanceOf(RangeError);
        await expect(subject.storage.presignDownload({ key, fileName: "a.pdf" }, 60), label).rejects.toBeInstanceOf(
          RangeError,
        );
        await expect(
          subject.storage.put({ key, contentType: "application/pdf", body: bytes("x") }),
          label,
        ).rejects.toBeInstanceOf(RangeError);
        await expect(subject.storage.head(key), label).rejects.toBeInstanceOf(RangeError);
        await expect(subject.storage.get(key), label).rejects.toBeInstanceOf(RangeError);
      }
    });

    it("refuses sizes that are not positive safe integers, and expiries outside 1 second to 7 days", async () => {
      const key = freshKey();
      for (const sizeBytes of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
        await expect(
          subject.storage.presignUpload({ key, contentType: "application/pdf", sizeBytes }, 60),
          String(sizeBytes),
        ).rejects.toBeInstanceOf(RangeError);
      }
      for (const seconds of [0, -5, 1.5, Number.NaN, 604_801]) {
        await expect(
          subject.storage.presignUpload({ key, contentType: "application/pdf", sizeBytes: 5 }, seconds),
          String(seconds),
        ).rejects.toBeInstanceOf(RangeError);
        await expect(
          subject.storage.presignDownload({ key, fileName: "a.pdf" }, seconds),
          String(seconds),
        ).rejects.toBeInstanceOf(RangeError);
      }
      await expect(subject.storage.presignDownload({ key, fileName: "a.pdf" }, 604_800)).resolves.toEqual(
        expect.any(String),
      );
    });

    it("presigns a download URL", async () => {
      const url = await subject.storage.presignDownload({ key: freshKey(), fileName: "Quote.pdf" }, 60);
      expect(typeof url).toBe("string");
      expect(url.length).toBeGreaterThan(0);
    });

    it("copies a stored file to another key, with its type, replacing what was there; nothing from an empty key", async () => {
      const from = freshKey();
      const to = `platform/exports/contract/${String((next += 1))}/files/copy`;
      await subject.storage.put({ key: from, contentType: "application/pdf", body: bytes("%PDF-1.4 passport") });
      await subject.storage.put({ key: to, contentType: "text/plain", body: bytes("old") });

      expect(await subject.storage.copy(from, to)).toBe(true);
      expect(await subject.storage.head(to)).toEqual({ sizeBytes: 17, contentType: "application/pdf" });
      expect(text(await subject.storage.get(to))).toBe("%PDF-1.4 passport");
      // The original stays, and the copy outlives it.
      await subject.storage.delete(from);
      expect(text(await subject.storage.get(to))).toBe("%PDF-1.4 passport");

      expect(await subject.storage.copy(freshKey(), `${to}-none`)).toBe(false);
      expect(await subject.storage.head(`${to}-none`)).toBeNull();
      await expect(subject.storage.copy("../escape", to)).rejects.toThrow(RangeError);
      await expect(subject.storage.copy(from, "/absolute")).rejects.toThrow(RangeError);
    });
  });
}
