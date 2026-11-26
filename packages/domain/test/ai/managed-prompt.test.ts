// A feature's instructions from Langfuse at label production, else the code's own text; {{placeholders}} filled by code.
import { createMemoryPrompts } from "@travel-crm/integrations/prompts";
import { describe, expect, it } from "vitest";
import { filled, managedPrompt } from "../../src/ai/managed-prompt.js";

describe("managedPrompt", () => {
  it("runs on Langfuse's production version when there is one, naming it", async () => {
    const prompts = createMemoryPrompts([
      { name: "write-up/system", version: 3, label: "production", text: "Langfuse words" },
    ]);
    const prompt = await managedPrompt(prompts, "write-up/system", "Built-in words");
    expect(prompt.text).toBe("Langfuse words");
    expect(prompt.source).toEqual({ name: "write-up/system", version: 3, label: "production" });
    expect(prompts.asked).toEqual([{ name: "write-up/system", label: "production", fresh: false }]);
  });

  it("runs on the built-in text when Langfuse is off or has no such prompt, with no Langfuse source", async () => {
    const off = await managedPrompt(undefined, "write-up/system", "Built-in words");
    expect(off).toEqual({ version: "built-in:write-up/system", text: "Built-in words" });
    const missing = await managedPrompt(createMemoryPrompts(), "write-up/system", "Built-in words");
    expect(missing.text).toBe("Built-in words");
    expect(missing.source).toBeUndefined();
  });
});

describe("filled", () => {
  it("fills each {{name}} with its value, spaces inside the braces allowed", () => {
    expect(filled("Hi {{agency}}, today is {{ today }}.", { agency: "Ghoomo", today: "26 Nov" })).toBe(
      "Hi Ghoomo, today is 26 Nov.",
    );
  });

  it("leaves a placeholder the code has no value for as written", () => {
    expect(filled("Hi {{someone}}.", {})).toBe("Hi {{someone}}.");
  });

  it("never reads a value's own braces as a placeholder", () => {
    expect(filled("Note: {{note}}", { note: "{{agency}}" })).toBe("Note: {{agency}}");
  });
});
