// The upload input refuses what must never reach storage: unknown file types, oversized or empty files, and names
// that hide folders or disguise their extension.
import { describe, expect, it } from "vitest";
import {
  attachmentIdInput,
  attachmentSummary,
  downloadLink,
  MAX_ATTACHMENT_BYTES,
  requestUploadInput,
} from "../../src/files/index.js";

const passport = {
  recordType: "lead",
  recordId: "0199e7a0-0000-7000-8000-0000000000f2",
  fileName: "Passport - Asha.pdf",
  contentType: "application/pdf",
  sizeBytes: 482_000,
};

describe("file inputs", () => {
  it("accepts a document upload, not sensitive unless said so, with the name trimmed", () => {
    expect(requestUploadInput.parse({ ...passport, fileName: "  Passport - Asha.pdf " })).toEqual({
      ...passport,
      sensitive: false,
    });
    expect(requestUploadInput.parse({ ...passport, sensitive: true }).sensitive).toBe(true);
    expect(
      requestUploadInput.parse({ ...passport, fileName: "पासपोर्ट.jpg", contentType: "image/jpeg" }).fileName,
    ).toBe("पासपोर्ट.jpg");
  });

  it("refuses names with folders, control characters or text-direction tricks", () => {
    for (const fileName of ["../passport.pdf", "a/b.pdf", "a\\b.pdf", "line\nbreak.pdf", "invoice‮fdp.exe", "   "]) {
      expect(requestUploadInput.safeParse({ ...passport, fileName }).success, JSON.stringify(fileName)).toBe(false);
    }
    expect(requestUploadInput.safeParse({ ...passport, fileName: `${"a".repeat(197)}.pdf` }).success).toBe(false);
  });

  it("takes PDFs and photos only", () => {
    for (const contentType of ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"]) {
      expect(requestUploadInput.safeParse({ ...passport, contentType }).success, contentType).toBe(true);
    }
    for (const contentType of ["text/html", "image/svg+xml", "application/octet-stream", "APPLICATION/PDF"]) {
      expect(requestUploadInput.safeParse({ ...passport, contentType }).success, contentType).toBe(false);
    }
  });

  it("takes files from 1 byte to 25 MB", () => {
    expect(requestUploadInput.safeParse({ ...passport, sizeBytes: 1 }).success).toBe(true);
    expect(requestUploadInput.safeParse({ ...passport, sizeBytes: MAX_ATTACHMENT_BYTES }).success).toBe(true);
    expect(requestUploadInput.safeParse({ ...passport, sizeBytes: MAX_ATTACHMENT_BYTES + 1 }).success).toBe(false);
    expect(requestUploadInput.safeParse({ ...passport, sizeBytes: 0 }).success).toBe(false);
    expect(requestUploadInput.safeParse({ ...passport, sizeBytes: 10.5 }).success).toBe(false);
  });

  it("refuses record types the table would refuse, other ids, and unknown keys", () => {
    expect(requestUploadInput.safeParse({ ...passport, recordType: "Issued-Document" }).success).toBe(false);
    expect(requestUploadInput.safeParse({ ...passport, recordId: "42" }).success).toBe(false);
    expect(requestUploadInput.safeParse({ ...passport, storageKey: "organizations/x" }).success).toBe(false);
    expect(attachmentIdInput.safeParse({ attachmentId: passport.recordId, sensitive: true }).success).toBe(false);
  });
});

describe("file outputs", () => {
  it("describe an attachment and a download link", () => {
    const summary = {
      id: "0199e7a0-0000-7000-8000-0000000000f3",
      recordType: "lead",
      recordId: passport.recordId,
      fileName: "Passport - Asha.pdf",
      contentType: "application/pdf",
      sizeBytes: 482_000,
      sensitive: true,
      status: "ready",
      createdAt: "2026-10-15T09:30:00.000Z",
    };
    expect(attachmentSummary.parse(summary)).toEqual(summary);
    expect(attachmentSummary.safeParse({ ...summary, status: "uploading" }).success).toBe(false);
    expect(
      downloadLink.safeParse({ url: "https://files.example/x", expiresAt: "2026-10-15T09:35:00.000Z" }).success,
    ).toBe(true);
    expect(downloadLink.safeParse({ url: "not a url", expiresAt: "2026-10-15T09:35:00.000Z" }).success).toBe(false);
  });
});
