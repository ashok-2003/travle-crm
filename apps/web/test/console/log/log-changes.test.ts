// What a platform log entry changed, field by field, as stored: the fields that differ between its before and after
// snapshots (a plan's change keeps the whole plan on both sides), and every field of a side the other lacks.
import { describe, expect, it } from "vitest";
import { changesOf } from "@/console/log/log-changes";

describe("changesOf", () => {
  it("lists only the fields that differ, in the order they were stored", () => {
    expect(
      changesOf(
        { name: "Growth", monthlyPricePaise: 499_900, modules: ["crm"], archived: false },
        { name: "Growth", monthlyPricePaise: 599_900, modules: ["crm", "quotes"], archived: false },
      ),
    ).toEqual([
      { field: "monthlyPricePaise", before: "499900", after: "599900" },
      { field: "modules", before: '["crm"]', after: '["crm","quotes"]' },
    ]);
  });

  it("shows a side the other lacks whole, and a stored null as null", () => {
    expect(changesOf(null, { code: "SHARMA", planId: null })).toEqual([
      { field: "code", before: null, after: "SHARMA" },
      { field: "planId", before: null, after: "null" },
    ]);
    expect(changesOf({ level: "support" }, { level: "super-admin", nameChanged: true })).toEqual([
      { field: "level", before: "support", after: "super-admin" },
      { field: "nameChanged", before: null, after: "true" },
    ]);
  });

  it("is empty without snapshots", () => {
    expect(changesOf(null, null)).toEqual([]);
  });
});
