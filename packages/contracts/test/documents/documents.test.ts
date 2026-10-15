// What issuing a document accepts: the sample template's content and branding, strictly, and the stored render
// input and event payload the worker reads back.
import { describe, expect, it } from "vitest";
import {
  documentIssuedEvent,
  issuedDocumentRenderInput,
  issueDocumentInput,
  type IssueDocumentInput,
} from "../../src/documents/index.js";

const valid: IssueDocumentInput = {
  template: "sample",
  content: {
    title: "Quotation",
    recipient: { name: "Meera Iyer", lines: ["14 Marine Drive", "Mumbai 400002"] },
    rows: [{ description: "Andaman islands, 6 nights", detail: "2 adults", amount: "₹12,50,000.00" }],
    totals: [{ label: "Total", amount: "₹12,50,000.00", emphasis: true }],
    notes: "Prices hold for seven days.\nFerry times depend on the weather.",
  },
  branding: { organizationName: "Sharma Holidays", accentColour: "#034f46", terms: "50% to book." },
};

describe("documents contracts", () => {
  it("accepts a sample document and trims its text", () => {
    const parsed = issueDocumentInput.parse({
      ...valid,
      content: { ...valid.content, title: "  Quotation  " },
    });
    expect(parsed.content.title).toBe("Quotation");
    expect(parsed.content.notes).toContain("\n");
  });

  it("refuses unknown keys, unknown templates, and documents with no rows", () => {
    expect(issueDocumentInput.safeParse({ ...valid, extra: true }).success).toBe(false);
    expect(issueDocumentInput.safeParse({ ...valid, template: "invoice" }).success).toBe(false);
    expect(issueDocumentInput.safeParse({ ...valid, content: { ...valid.content, rows: [] } }).success).toBe(false);
  });

  it("only takes an accent colour written #rrggbb", () => {
    const branding = (accentColour: string) => ({ ...valid, branding: { ...valid.branding, accentColour } });
    expect(issueDocumentInput.safeParse(branding("#6A4BBD")).success).toBe(true);
    expect(issueDocumentInput.safeParse(branding("red")).success).toBe(false);
    expect(issueDocumentInput.safeParse(branding("#034f46; font-size: 99")).success).toBe(false);
  });

  it("carries the organization's logo as its attachment's id", () => {
    const withLogo = (logoAttachmentId: string) => ({ ...valid, branding: { ...valid.branding, logoAttachmentId } });
    const logoAttachmentId = "0199e7a0-0000-7000-8000-00000000a001";
    expect(issueDocumentInput.parse(withLogo(logoAttachmentId)).branding.logoAttachmentId).toBe(logoAttachmentId);
    expect(issueDocumentInput.safeParse(withLogo("logo.png")).success).toBe(false);
    expect(issueDocumentInput.safeParse({ ...valid, branding: { ...valid.branding, logo: "x" } }).success).toBe(false);
  });

  it("refuses control characters, except line breaks in notes and terms", () => {
    const withTitle = (title: string) => ({ ...valid, content: { ...valid.content, title } });
    expect(issueDocumentInput.safeParse(withTitle("Quo\u0000tation")).success).toBe(false);
    expect(issueDocumentInput.safeParse(withTitle("Quo\ntation")).success).toBe(false);
    const withTerms = (terms: string) => ({ ...valid, branding: { ...valid.branding, terms } });
    expect(issueDocumentInput.safeParse(withTerms("Line one\nLine two")).success).toBe(true);
    expect(issueDocumentInput.safeParse(withTerms("Bell\u0007")).success).toBe(false);
  });

  it("reads back the stored render input and the event payload, refusing anything else", () => {
    const stored = {
      data: { ...valid.content, number: "DOC-2026-0001", issuedOn: "15 Oct 2026" },
      branding: valid.branding,
    };
    expect(issuedDocumentRenderInput.parse(stored)).toEqual(stored);
    expect(issuedDocumentRenderInput.safeParse({ ...stored, data: valid.content }).success).toBe(false);
    expect(documentIssuedEvent.parse({ documentId: "0199e7a0-0000-7000-8000-000000000001" })).toEqual({
      documentId: "0199e7a0-0000-7000-8000-000000000001",
    });
    expect(documentIssuedEvent.safeParse({ documentId: "d1" }).success).toBe(false);
  });
});
