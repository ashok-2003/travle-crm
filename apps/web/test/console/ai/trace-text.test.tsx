// The console's long recorded text: JSON is shown indented, anything else as it is.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readableJson, TraceText } from "@/console/ai/trace-text";

describe("readableJson", () => {
  it("indents JSON and leaves other text", () => {
    expect(readableJson('{"a":[1]}')).toBe('{\n  "a": [\n    1\n  ]\n}');
    expect(readableJson("not json")).toBe("not json");
  });
});

describe("TraceText", () => {
  it("wraps a 30,000-character unbroken line instead of scrolling", () => {
    render(<TraceText text={"x".repeat(30_000)} label="Answer" />);
    const text = screen.getByRole("group", { name: "Answer" });
    expect(text).toHaveTextContent("x".repeat(30_000));
    expect(text.className).toContain("whitespace-pre-wrap");
    expect(text.className).toContain("wrap-anywhere");
    expect(text.className).not.toMatch(/overflow|whitespace-pre(?!-)|whitespace-nowrap/);
    expect(text).toHaveAttribute("dir", "auto");
  });
});
