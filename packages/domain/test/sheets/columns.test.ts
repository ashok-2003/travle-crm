// What a sheet row needs to become a lead (S13).
import { describe, expect, it } from "vitest";
import { matchedFields } from "../../src/sheets/index.js";

describe("matchedFields", () => {
  it("needs a Name and one of Phone, Email and Instagram", () => {
    expect(matchedFields([{ field: "name" }, { field: "phone" }])).toEqual({ complete: true, missing: [] });
    expect(matchedFields([{ field: "name" }, { field: "instagram" }]).complete).toBe(true);
    expect(matchedFields([{ field: "name" }, { field: null }])).toEqual({ complete: false, missing: ["contact"] });
    expect(matchedFields([{ field: "email" }])).toEqual({ complete: false, missing: ["name"] });
    expect(matchedFields([])).toEqual({ complete: false, missing: ["name", "contact"] });
  });
});
