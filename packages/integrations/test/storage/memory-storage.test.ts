// The in-memory storage behaves like S3 where tests depend on it: signed uploads must match, files read back.
import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../../src/storage/index.js";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("memory storage", () => {
  it("accepts an upload that matches its signature and reads it back", async () => {
    const storage = createMemoryStorage();
    const upload = await storage.presignUpload(
      { key: "organizations/a/1", contentType: "image/png", sizeBytes: 5 },
      60,
    );
    expect(upload.headers).toEqual({ "content-type": "image/png", "content-length": "5" });

    await storage.upload(upload, bytes("hello"), "image/png");

    expect(await storage.head("organizations/a/1")).toEqual({ sizeBytes: 5, contentType: "image/png" });
    expect(new TextDecoder().decode((await storage.get("organizations/a/1")) ?? new Uint8Array())).toBe("hello");
  });

  it("refuses an upload of another size or type, or after it expires", async () => {
    let time = new Date("2026-10-15T10:00:00Z");
    const storage = createMemoryStorage(() => time);
    const upload = await storage.presignUpload({ key: "k", contentType: "image/png", sizeBytes: 5 }, 60);

    await expect(storage.upload(upload, bytes("hello!"), "image/png")).rejects.toThrow(/size/);
    await expect(storage.upload(upload, bytes("hello"), "application/pdf")).rejects.toThrow(/content type/);
    time = new Date("2026-10-15T10:01:01Z");
    await expect(storage.upload(upload, bytes("hello"), "image/png")).rejects.toThrow(/expired/);
    expect(await storage.head("k")).toBeNull();
  });

  it("stores server-made files and names downloads", async () => {
    const storage = createMemoryStorage();
    await storage.put({ key: "doc", contentType: "application/pdf", body: bytes("%PDF") });
    expect(await storage.head("doc")).toEqual({ sizeBytes: 4, contentType: "application/pdf" });
    expect(await storage.presignDownload({ key: "doc", fileName: "Quote QT-1.pdf" }, 60)).toContain(
      "name=Quote%20QT-1.pdf",
    );
    expect(await storage.get("missing")).toBeNull();
  });
});
