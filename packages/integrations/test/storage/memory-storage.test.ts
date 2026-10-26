// The in-memory storage behaves like S3 where tests depend on it: the shared contract, plus its own extras (an
// expired upload URL, the download URL's file name).
import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../../src/storage/index.js";
import { describeObjectStorage } from "./object-storage-contract.js";

const bytes = (text: string) => new TextEncoder().encode(text);

describeObjectStorage("memory storage", () => {
  const storage = createMemoryStorage();
  return Promise.resolve({
    storage,
    upload: (upload, body, contentType) => storage.upload(upload, body, contentType),
    stop: () => Promise.resolve(),
  });
});

describe("memory storage", () => {
  it("refuses an upload after its URL expires", async () => {
    let time = new Date("2026-10-15T10:00:00Z");
    const storage = createMemoryStorage(() => time);
    const upload = await storage.presignUpload({ key: "k", contentType: "image/png", sizeBytes: 5 }, 60);
    time = new Date("2026-10-15T10:01:01Z");
    await expect(storage.upload(upload, bytes("hello"), "image/png")).rejects.toThrow(/expired/);
    expect(await storage.head("k")).toBeNull();
  });

  it("names the file in its download URL", async () => {
    const storage = createMemoryStorage();
    expect(await storage.presignDownload({ key: "doc", fileName: "Quote QT-1.pdf" }, 60)).toContain(
      "name=Quote%20QT-1.pdf",
    );
  });

  it("makes a download link that opens in place only when asked", async () => {
    const storage = createMemoryStorage();
    expect(await storage.presignDownload({ key: "doc", fileName: "a.pdf" }, 60)).not.toContain("inline=1");
    expect(await storage.presignDownload({ key: "doc", fileName: "a.pdf", inline: true }, 60)).toContain("inline=1");
  });
});
