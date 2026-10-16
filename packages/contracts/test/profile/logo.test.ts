// The logo's contract: a PNG or JPEG of at most 1 MB, the only images React-PDF draws, named like any file, and of at
// most 4096 pixels a side and 16 megapixels.
import { describe, expect, it } from "vitest";
import { isLogoSizeAllowed, MAX_LOGO_BYTES, logoRefInput, requestLogoUploadInput } from "../../src/profile/index.js";

const logo = { fileName: "Sharma Holidays.png", contentType: "image/png", sizeBytes: 48_213 };

describe("logo contracts", () => {
  it("takes a PNG or a JPEG of at most 1 MB", () => {
    expect(requestLogoUploadInput.parse(logo)).toEqual(logo);
    expect(requestLogoUploadInput.safeParse({ ...logo, contentType: "image/jpeg" }).success).toBe(true);
    expect(requestLogoUploadInput.safeParse({ ...logo, sizeBytes: MAX_LOGO_BYTES }).success).toBe(true);
    expect(MAX_LOGO_BYTES).toBe(1024 * 1024);
  });

  it("refuses other images, a larger file, an empty one, and unknown keys", () => {
    for (const contentType of ["image/svg+xml", "image/webp", "image/heic", "application/pdf"]) {
      expect(requestLogoUploadInput.safeParse({ ...logo, contentType }).success, contentType).toBe(false);
    }
    expect(requestLogoUploadInput.safeParse({ ...logo, sizeBytes: MAX_LOGO_BYTES + 1 }).success).toBe(false);
    expect(requestLogoUploadInput.safeParse({ ...logo, sizeBytes: 0 }).success).toBe(false);
    expect(requestLogoUploadInput.safeParse({ ...logo, sensitive: true }).success).toBe(false);
    expect(requestLogoUploadInput.safeParse({ ...logo, recordType: "lead" }).success).toBe(false);
  });

  it("names the file as any upload must: no folders, no direction marks", () => {
    expect(requestLogoUploadInput.safeParse({ ...logo, fileName: "../logo.png" }).success).toBe(false);
    expect(requestLogoUploadInput.safeParse({ ...logo, fileName: "logo\u202Egnp.exe" }).success).toBe(false);
  });

  it("allows at most 4096 pixels a side and 16 million in all", () => {
    for (const [width, height] of [
      [1, 1],
      [4096, 3906],
      [4000, 4000],
      [4096, 1],
    ] as const) {
      expect(isLogoSizeAllowed({ width, height }), `${String(width)}×${String(height)}`).toBe(true);
    }
    for (const [width, height] of [
      [4097, 1],
      [1, 4097],
      [4096, 4096],
      [8000, 8000],
    ] as const) {
      expect(isLogoSizeAllowed({ width, height }), `${String(width)}×${String(height)}`).toBe(false);
    }
  });

  it("names an uploaded logo by its attachment id alone", () => {
    const attachmentId = "0199e7a0-0000-7000-8000-000000000001";
    expect(logoRefInput.parse({ attachmentId })).toEqual({ attachmentId });
    expect(logoRefInput.safeParse({ attachmentId: "logo" }).success).toBe(false);
    expect(logoRefInput.safeParse({ attachmentId, recordId: attachmentId }).success).toBe(false);
  });
});
