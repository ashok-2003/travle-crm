// Share-link inputs and outputs: strict, with record types, labels and expiry checked at the boundary.
import { describe, expect, it } from "vitest";
import {
  createShareLinkInput,
  createdShareLink,
  listShareLinksInput,
  shareLinkOpenedEvent,
  shareLinkSummary,
} from "../../src/share-links/index.js";

const recordId = "0199e7a0-0000-7000-8000-0000000000d1";

describe("share-link contracts", () => {
  it("accepts a link to a record, with an optional expiry or none at all", () => {
    expect(
      createShareLinkInput.parse({ recordType: "issued_document", recordId, label: "  Quotation QT-2026-0042 " }),
    ).toEqual({ recordType: "issued_document", recordId, label: "Quotation QT-2026-0042" });
    expect(
      createShareLinkInput.parse({ recordType: "issued_document", recordId, label: "Q", expiresAt: null }).expiresAt,
    ).toBeNull();
    expect(
      createShareLinkInput.parse({
        recordType: "issued_document",
        recordId,
        label: "Q",
        expiresAt: "2026-11-15T10:00:00+05:30",
      }).expiresAt,
    ).toBe("2026-11-15T10:00:00+05:30");
  });

  it("lists one record's links, named strictly", () => {
    const record = { recordType: "issued_document", recordId };
    expect(listShareLinksInput.parse(record)).toEqual(record);
    expect(listShareLinksInput.safeParse({ ...record, recordId: "42" }).success).toBe(false);
    expect(listShareLinksInput.safeParse({ recordType: "issued_document" }).success).toBe(false);
    expect(listShareLinksInput.safeParse({ ...record, label: "x" }).success).toBe(false);
  });

  it("refuses odd record types, empty or invisible labels, and unknown keys", () => {
    const valid = { recordType: "issued_document", recordId, label: "Quote" };
    expect(createShareLinkInput.safeParse({ ...valid, recordType: "Issued-Document" }).success).toBe(false);
    expect(createShareLinkInput.safeParse({ ...valid, label: " " }).success).toBe(false);
    for (const invisible of [
      "\u202e",
      "\u202a",
      "\u2066",
      "\u2069",
      "\u200e",
      "\u200f",
      "\u061c",
      "\u2028",
      "\u2029",
    ]) {
      expect(createShareLinkInput.safeParse({ ...valid, label: `a${invisible}b` }).success).toBe(false);
    }
    expect(createShareLinkInput.safeParse({ ...valid, label: "x".repeat(201) }).success).toBe(false);
    expect(createShareLinkInput.safeParse({ ...valid, organizationId: recordId }).success).toBe(false);
    expect(createShareLinkInput.safeParse({ ...valid, expiresAt: "next week" }).success).toBe(false);
  });

  it("allows the joiners that Indic scripts need in a label", () => {
    const label = "\u0915\u094d\u200d\u0937 \u0915\u094d\u200c\u0937 Trip";
    expect(createShareLinkInput.safeParse({ recordType: "issued_document", recordId, label }).success).toBe(true);
  });

  it("describes a made link, a listed link and the opened event", () => {
    const token = "A".repeat(65);
    expect(createdShareLink.parse({ shareLinkId: recordId, token, path: `/p/${token}` }).path).toBe(`/p/${token}`);
    expect(createdShareLink.safeParse({ shareLinkId: recordId, token: "short", path: "/p/short" }).success).toBe(false);
    expect(
      shareLinkSummary.parse({
        id: recordId,
        recordType: "issued_document",
        recordId,
        label: "Quote",
        createdBy: null,
        createdAt: "2026-10-15T04:30:00.000Z",
        expiresAt: null,
        revokedAt: null,
        openCount: 2,
        lastOpenedAt: "2026-10-15T05:00:00.000Z",
      }).openCount,
    ).toBe(2);
    expect(shareLinkOpenedEvent.parse({ shareLinkId: recordId, openId: recordId })).toEqual({
      shareLinkId: recordId,
      openId: recordId,
    });
    expect(shareLinkOpenedEvent.safeParse({ shareLinkId: recordId }).success).toBe(false);
  });
});
