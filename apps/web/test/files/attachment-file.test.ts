// A chosen file is checked with the api's own rules before anything is sent (ADR 0011): one of the allowed types
// (a HEIC photo known by its name where the browser can't tell its type), not empty, at most 25 MB, and a name
// without folders or direction characters.
import { MAX_ATTACHMENT_BYTES } from "@travel-crm/contracts/files";
import { describe, expect, it } from "vitest";
import { checkAttachmentFile, kindOf } from "@/files/attachment-file";

const file = (name: string, type: string, size = 2048) => ({ name, type, size });

describe("checkAttachmentFile", () => {
  it("takes PDFs and photos of papers", () => {
    for (const type of ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"]) {
      expect(checkAttachmentFile(file("paper", type))).toEqual({ ok: true, contentType: type });
    }
  });

  it("knows a HEIC photo by its name when the browser gives it no type", () => {
    expect(checkAttachmentFile(file("IMG_0042.HEIC", ""))).toEqual({ ok: true, contentType: "image/heic" });
  });

  it("refuses other types, which can carry scripts or aren't papers", () => {
    for (const [name, type] of [
      ["logo.svg", "image/svg+xml"],
      ["page.html", "text/html"],
      ["papers.zip", "application/zip"],
      ["notes", ""],
    ] as const) {
      expect(checkAttachmentFile(file(name, type)), name).toEqual({ ok: false, problem: "type" });
    }
  });

  it("refuses an empty file and one over 25 MB", () => {
    expect(checkAttachmentFile(file("blank.pdf", "application/pdf", 0))).toEqual({ ok: false, problem: "empty" });
    expect(checkAttachmentFile(file("scan.pdf", "application/pdf", MAX_ATTACHMENT_BYTES))).toMatchObject({ ok: true });
    expect(checkAttachmentFile(file("scan.pdf", "application/pdf", MAX_ATTACHMENT_BYTES + 1))).toEqual({
      ok: false,
      problem: "size",
    });
  });

  it("refuses a name that would show as something else", () => {
    // "invoice<RLO>fdp.exe" shows as "invoiceexe.pdf".
    expect(checkAttachmentFile(file("invoice\u202Efdp.pdf", "application/pdf"))).toEqual({
      ok: false,
      problem: "name",
    });
  });
});

describe("kindOf", () => {
  it("names a file's kind as people know it", () => {
    expect(kindOf("application/pdf")).toBe("pdf");
    expect(kindOf("image/heic")).toBe("heic");
    expect(kindOf("application/octet-stream")).toBe("other");
  });
});
