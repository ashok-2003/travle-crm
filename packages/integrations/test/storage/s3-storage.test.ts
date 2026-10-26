// The S3 adapter against a real S3 server (MinIO in a container): the shared contract, and downloads that save
// under the file's own name, whatever its script or punctuation.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  attachmentDisposition,
  createS3Storage,
  type ObjectStorage,
  type PresignedUpload,
} from "../../src/storage/index.js";
import { startMinio, type TestMinio } from "../support/minio.js";
import { describeObjectStorage } from "./object-storage-contract.js";

/** The browser's PUT to a presigned URL. fetch sets content-length from the body itself, as browsers do. */
async function browserUpload(upload: PresignedUpload, body: Uint8Array, contentType: string): Promise<void> {
  // The browser sends the signed headers as given (content-length comes from the body); the file's own type is what it has.
  const signed = Object.fromEntries(Object.entries(upload.headers).filter(([name]) => name !== "content-length"));
  const response = await fetch(upload.url, {
    method: upload.method,
    headers: { ...signed, "content-type": contentType },
    body,
  });
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

  it("opens a file in place when the link is inline, and saves it otherwise", async () => {
    const key = "organizations/o1/attachments/a3";
    await storage.put({ key, contentType: "image/png", body: new TextEncoder().encode("png") });
    const inline = await fetch(await storage.presignDownload({ key, fileName: "Photo.png", inline: true }, 60));
    expect(inline.headers.get("content-disposition")).toMatch(
      /^inline; filename="Photo.png"; filename\*=UTF-8''Photo\.png$/,
    );
    const saved = await fetch(await storage.presignDownload({ key, fileName: "Photo.png" }, 60));
    expect(saved.headers.get("content-disposition")).toMatch(/^attachment; /);
  });

  it("refuses a download URL once it has expired", async () => {
    const key = "organizations/o1/attachments/a2";
    await storage.put({ key, contentType: "application/pdf", body: new TextEncoder().encode("%PDF") });
    const url = await storage.presignDownload({ key, fileName: "a.pdf" }, 1);
    await new Promise((resolve) => setTimeout(resolve, 2100));
    expect((await fetch(url)).status).toBe(403);
  });
});

describe("S3 storage on a server with no such bucket", () => {
  let minio: TestMinio;

  beforeAll(async () => {
    minio = await startMinio("real-bucket");
  });

  afterAll(async () => {
    await minio.stop();
  });

  it("throws, rather than answering 'no such key', and checkBucket names the bucket", async () => {
    const storage = createS3Storage({ ...minio.settings, bucket: "wrong-bucket" });
    await expect(storage.get("organizations/o1/attachments/a1")).rejects.toMatchObject({ name: "NoSuchBucket" });
    await expect(storage.checkBucket()).rejects.toThrow(/wrong-bucket/);
    await expect(storage.checkBucket()).rejects.not.toThrow(/minio-test-password/);
  });

  it("passes checkBucket for a bucket that exists", async () => {
    await expect(createS3Storage(minio.settings).checkBucket()).resolves.toBeUndefined();
  });
});

describe("S3 storage refusals", () => {
  let minio: TestMinio;
  let storage: ObjectStorage;

  beforeAll(async () => {
    minio = await startMinio("refusals");
    storage = createS3Storage(minio.settings);
  });

  afterAll(async () => {
    await minio.stop();
  });

  it("refuses (MinIO answers 400, S3 403) an upload that leaves out the signed if-none-match header", async () => {
    const key = "organizations/o1/attachments/r2";
    const upload = await storage.presignUpload({ key, contentType: "image/png", sizeBytes: 5 }, 60);
    const response = await fetch(upload.url, {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: new TextEncoder().encode("hello"),
    });
    expect([400, 403]).toContain(response.status);
    expect(await response.text()).toContain("<Code>AccessDenied</Code>");
    expect(await storage.head(key)).toBeNull();
  });

  it("answers 403 to an upload of another size or type, and 412 to a second upload", async () => {
    const key = "organizations/o1/attachments/r1";
    const upload = await storage.presignUpload({ key, contentType: "image/png", sizeBytes: 5 }, 60);
    await expect(browserUpload(upload, new TextEncoder().encode("hello, world"), "image/png")).rejects.toThrow(/403/);
    await expect(browserUpload(upload, new TextEncoder().encode("hello"), "text/html")).rejects.toThrow(/403/);
    await browserUpload(upload, new TextEncoder().encode("hello"), "image/png");
    await expect(browserUpload(upload, new TextEncoder().encode("HELLO"), "image/png")).rejects.toThrow(/412/);
  });
});

describe("attachmentDisposition", () => {
  it("strips CR and LF so a name can't add headers", () => {
    const header = attachmentDisposition("a\r\nSet-Cookie: x=1.pdf");
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toContain('filename="a__Set-Cookie: x=1.pdf"');
  });

  it("gives an empty name a plain fallback", () => {
    expect(attachmentDisposition("")).toBe("attachment; filename=\"\"; filename*=UTF-8''");
  });

  it("escapes the characters encodeURIComponent leaves alone", () => {
    expect(attachmentDisposition("it's (a) *file*.pdf")).toContain(
      "filename*=UTF-8''it%27s%20%28a%29%20%2Afile%2A.pdf",
    );
  });

  it("does not throw on a lone surrogate", () => {
    const header = attachmentDisposition("a\ud800b.pdf");
    expect(header).toContain('filename="a_b.pdf"');
    expect(header).toContain("filename*=UTF-8''a%EF%BF%BDb.pdf");
  });
});
