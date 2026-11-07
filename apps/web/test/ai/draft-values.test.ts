// The review form's starting values: where the documents are silent on GST the prices are taken as the price paid.
import { describe, expect, it } from "vitest";
import { valuesOf } from "@/ai/drafts/draft-values";
import { draft } from "./package-draft-fixtures";

describe("valuesOf", () => {
  it("starts with 'prices include GST' on when the documents say nothing about GST", () => {
    expect(
      valuesOf({ ...draft, pricesIncludeGst: { value: null, evidence: [], checkThis: false } }).pricesIncludeGst,
    ).toBe(true);
  });

  it("keeps what the documents say about GST", () => {
    expect(valuesOf(draft).pricesIncludeGst).toBe(false);
  });
});
