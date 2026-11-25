// The one agent's prompt: the built-in text equals the prompt file's v5, it fills the three placeholders, and it comes
// from Langfuse's real-agent prompt (production for live turns and Try it, or draft when Try it asks), else the
// built-in text.
import { readFileSync } from "node:fs";
import { onePromptLabels } from "@travel-crm/contracts/ai";
import { createMemoryPrompts } from "@travel-crm/integrations/prompts";
import { describe, expect, it } from "vitest";
import { renderNaturalPrompt } from "../../../src/ai/natural/prompt.js";
import { BUILT_IN_ONE_PROMPT, ONE_PROMPT_NAME, onePromptOf, oneTryItPrompt } from "../../../src/ai/one/prompt.js";
import { ONE_PROMPT_TEXT } from "../../../src/ai/one/prompt-text.js";

const voice = { agentName: "Riya", agencyName: "Sharma Holidays", tone: "friendly" } as const;
const kept = (version: number, label: string, text: string) => ({ name: ONE_PROMPT_NAME, version, label, text });

function promptFileText(): string {
  const file = new URL(
    "../../../../../docs/superpowers/specs/2026-11-17-one-whatsapp-agent-prompt.md",
    import.meta.url,
  );
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.indexOf("```text");
  const end = lines.indexOf("```", start + 1);
  return lines.slice(start + 1, end).join("\n");
}

describe("the one agent's prompt", () => {
  it("holds the prompt file's v5 text exactly", () => {
    expect(ONE_PROMPT_TEXT).toBe(promptFileText());
    expect(BUILT_IN_ONE_PROMPT).toEqual({ version: "built-in-one-5", text: ONE_PROMPT_TEXT });
  });

  it("fills the agency, the agent and the tone, and leaves no placeholder", () => {
    const text = renderNaturalPrompt(BUILT_IN_ONE_PROMPT, voice);
    expect(text).toContain("**Sharma Holidays**");
    expect(text).toContain("Riya");
    expect(text).toContain("friendly");
    expect(text).not.toMatch(/\{\{/);
  });

  it("runs live turns on Langfuse's production label, else the built-in text", async () => {
    const prompts = createMemoryPrompts([kept(3, "production", "Live words")]);
    expect(await onePromptOf(prompts)).toEqual({
      version: "langfuse:whatsapp-agent/real-agent@3",
      text: "Live words",
      source: { name: ONE_PROMPT_NAME, version: 3, label: "production" },
    });
    expect(prompts.asked).toEqual([{ name: ONE_PROMPT_NAME, label: onePromptLabels.live, fresh: false }]);
    // Only `latest` exists (the owner's v2 has no production label yet): live turns still use the built-in text.
    expect(await onePromptOf(createMemoryPrompts([kept(2, "latest", "Draft")]))).toEqual(BUILT_IN_ONE_PROMPT);
    expect(await onePromptOf(undefined)).toEqual(BUILT_IN_ONE_PROMPT);
  });

  it("runs Try it's draft on Langfuse's draft label, read past the cache, and the live prompt when there is none", async () => {
    const both = createMemoryPrompts([kept(4, "production", "Live words"), kept(5, "draft", "Draft words")]);
    expect(await oneTryItPrompt(both, "draft")).toMatchObject({ text: "Draft words", source: { label: "draft" } });
    expect(both.asked).toContainEqual({ name: ONE_PROMPT_NAME, label: onePromptLabels.draft, fresh: true });
    expect(await oneTryItPrompt(both, "live")).toMatchObject({ text: "Live words", source: { label: "production" } });
    const liveOnly = createMemoryPrompts([kept(4, "production", "Live words")]);
    expect(await oneTryItPrompt(liveOnly, "draft")).toMatchObject({
      text: "Live words",
      source: { label: "production" },
    });
    expect(await oneTryItPrompt(undefined, "draft")).toEqual(BUILT_IN_ONE_PROMPT);
  });
});
