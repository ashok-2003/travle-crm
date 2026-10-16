// @vitest-environment node
// The audit log's words for what happened, and the one record whose history the address asks for: an action with its
// sentence is told apart from one recorded before its sentence was written, which still reads as words, and an
// address the api would refuse names no record.
import { describe, expect, it } from "vitest";
import { isKnownAction, readableAction } from "@/audit/audit-words";
import { recordFilterOf, recordHistoryHref } from "@/audit/record-filter";

const roleId = "0199a000-0000-7000-8000-0000000000b1";

describe("isKnownAction", () => {
  it("knows an action by both halves of its name", () => {
    expect(isKnownAction("staff.removed")).toBe(true);
    expect(isKnownAction("organization-profile.saved")).toBe(true);
    expect(isKnownAction("staff.promoted")).toBe(false);
    expect(isKnownAction("staff")).toBe(false);
    expect(isKnownAction("staff.removed.twice")).toBe(false);
    // Not a prototype's property either.
    expect(isKnownAction("staff.constructor")).toBe(false);
  });
});

describe("readableAction", () => {
  it("reads an action without a sentence as its own words", () => {
    expect(readableAction("share-link.revoked")).toBe("Share link revoked");
    expect(readableAction("organization-logo.uploaded")).toBe("Organization logo uploaded");
    expect(readableAction("subscription.trial-end.moved")).toBe("Subscription trial end moved");
  });
});

describe("recordFilterOf", () => {
  it("reads one record from the address, by its kind and id", () => {
    expect(recordFilterOf(new URLSearchParams({ entityType: "role", entityId: roleId }))).toEqual({
      entityType: "role",
      entityId: roleId,
    });
  });

  it("names no record when the address leaves half out or breaks the api's rules", () => {
    for (const search of [
      "",
      `entityType=role`,
      `entityId=${roleId}`,
      `entityType=Role&entityId=${roleId}`,
      "entityType=role&entityId=not-an-id",
    ]) {
      expect(recordFilterOf(new URLSearchParams(search)), search).toBeNull();
    }
  });

  it("is what one record's history link leads to", () => {
    const record = { entityType: "issued_document", entityId: roleId };
    const href = recordHistoryHref(record);
    expect(href).toBe(`/settings/audit?entityType=issued_document&entityId=${roleId}`);
    expect(recordFilterOf(new URL(href, "https://app.invalid").searchParams)).toEqual(record);
  });
});
