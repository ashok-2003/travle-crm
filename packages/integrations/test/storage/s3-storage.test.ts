// The S3 adapter against a real S3 server (MinIO in a container): the shared contract, and downloads that save
// under the file's own name, whatever its script or punctuation.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createS3Storage, type ObjectStorage, type PresignedUpload } from "../../src/storage/index.js";
import { startMinio, type TestMinio } from "../support/minio.js";
import { describeObjectStorage } from "./object-storage-contract.js";

/** The browser's PUT to a presigned URL. fetch sets content-length from the body itself, as browsers do. */
async function browserUpload(upload: PresignedUpload, body: Uint8Array, contentType: string): Promise<void> {
  const response = await fetch(upload.url, { method: upload.method, headers: { "content-type": contentType }, body });
  if (!response.ok) throw new Error(`Storage refused the upload with ${String(response.status)}`);
}

describeObjectStorage("S3 on MinIO", async () => {
  const minio = await startMinio();
  return { storage: createS3Storage(minio.settings), upload: browserUpload, stop: () => minio.stop() };
});

describe("S3 storage downloads", () => {
  let minio: TestMinio;
  let storage: ObjectStorage;

  beforeAll(async () => {
    minio = await startMinio("downloads");
    storage = createS3Storage(minio.settings);
  });

  afterAll(async () => {
    await minio.stop();
  });

  it("downloads the bytes, saved under the file's name in any script", async () => {
    const key = "organizations/o1/attachments/a1";
    await storage.put({ key, contentType: "application/pdf", body: new TextEncoder().encode("%PDF-1.3 visa") });
    const fileName = 'वीज़ा "Asha" (2026).pdf';

    const response = await fetch(await storage.presignDownload({ key, fileName }, 60));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("%PDF-1.3 visa");
    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).toMatch(/^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
    expect(disposition).not.toMatch(/filename="[^"]*"[^;]*"/);
    const encoded = /filename\*=UTF-8''(.+)$/.exec(disposition)?.[1] ?? "";
    expect(decodeURIComponent(encoded)).toBe(fileName);
  });

  it("refuses a download URL once it has expired", async () => {
    const key = "organizations/o1/attachments/a2";
    await storage.put({ key, contentType: "application/pdf", body: new TextEncoder().encode("%PDF") });
    const url = await storage.presignDownload({ key, fileName: "a.pdf" }, 1);
    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect((await fetch(url)).status).toBe(403);
  });
});
