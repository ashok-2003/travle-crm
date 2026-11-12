// The schema sent to the model has no `examples` anywhere and is otherwise the form's own.
import { describe, expect, it } from "vitest";
import { understandFormJsonSchema, understandFormWireSchema, withoutExamples } from "../../src/ai/lite.js";

const keysOf = (value: unknown): string[] =>
  typeof value !== "object" || value === null
    ? []
    : Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);

describe("the wire schema", () => {
  it("has no examples anywhere, and the full schema does", () => {
    expect(keysOf(understandFormJsonSchema)).toContain("examples");
    expect(keysOf(understandFormWireSchema)).not.toContain("examples");
  });

  it("keeps everything else identical", () => {
    const text = JSON.stringify(understandFormJsonSchema, (key, inner: unknown) =>
      key === "examples" ? undefined : inner,
    );
    expect(understandFormWireSchema).toEqual(JSON.parse(text) as unknown);
    expect(JSON.stringify(understandFormWireSchema)).toContain("additionalProperties");
    expect(JSON.stringify(understandFormWireSchema)).toContain("required");
    expect(JSON.stringify(understandFormWireSchema)).toContain("description");
  });

  it("removes examples at any depth, in arrays too", () => {
    expect(withoutExamples({ a: { examples: [1], b: [{ examples: [2], c: 1 }] } })).toEqual({ a: { b: [{ c: 1 }] } });
  });
});
