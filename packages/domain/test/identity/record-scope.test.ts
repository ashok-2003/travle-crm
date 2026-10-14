// Check 5 (spec 6.5): "own" limits a member to records assigned to them; outside it, a record does not exist.
import { describe, expect, it } from "vitest";
import { assertRecordInScope, scopeFilter } from "../../src/identity/record-scope.js";
import { memberWithStarterRole, refusalOf } from "./rule-helpers.js";

describe("record scope", () => {
  const sales = memberWithStarterRole("sales");
  const admin = memberWithStarterRole("org-admin");

  it("filters lists to the member's own records, or not at all", () => {
    expect(scopeFilter(sales, "leads:view", "assignedToId")).toEqual({ assignedToId: sales.userId });
    expect(scopeFilter(admin, "leads:view", "assignedToId")).toEqual({});
  });

  it("refuses to build a filter for a view permission the member lacks", () => {
    expect(refusalOf(scopeFilter, memberWithStarterRole("operations"), "leads:view", "assignedToId")).toBe(
      "MISSING_PERMISSION",
    );
  });

  it("reports someone else's record as not found", () => {
    expect(refusalOf(assertRecordInScope, sales, "leads:view", sales.userId)).toBeNull();
    expect(refusalOf(assertRecordInScope, admin, "leads:view", "someone-else")).toBeNull();
    expect(refusalOf(assertRecordInScope, sales, "leads:view", "someone-else")).toBe("NOT_FOUND");
    expect(refusalOf(assertRecordInScope, sales, "leads:view", null)).toBe("NOT_FOUND");
  });
});
