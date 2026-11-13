// The console's long recorded text: JSON is shown indented, anything else as it is.
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readableJson } from "@/console/ai/trace-text";

describe("readableJson", () => {
  it("indents JSON and leaves other text", () => {
    expect(readableJson('{"a":[1]}')).toBe('{\n  "a": [\n    1\n  ]\n}');
    expect(readableJson("not json")).toBe("not json");
  });
});
