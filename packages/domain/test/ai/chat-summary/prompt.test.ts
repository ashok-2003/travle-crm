// The chat summary's prompt: the built-in text equals the spec's Appendix A, it fills the agency's name, and it comes
// from Langfuse's chat-summary prompt (production label), else the built-in text.
import { readFileSync } from "node:fs";
import { createMemoryPrompts } from "@travel-crm/integrations/prompts";
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_SUMMARY_PROMPT,
  renderSummaryPrompt,
  SUMMARY_PROMPT_NAME,
  summaryPromptOf,
} from "../../../src/ai/chat-summary/prompt.js";
import { SUMMARY_PROMPT_TEXT } from "../../../src/ai/chat-summary/prompt-text.js";

function appendixA(): string {
  const file = new URL(
    "../../../../../docs/superpowers/specs/2026-11-17-one-whatsapp-agent-design.md",
    import.meta.url,
  );
  const lines = readFileSync(file, "utf8").split("\n");
  const start = lines.indexOf("```text", lines.indexOf("## Appendix A: the summary prompt's starting text"));
  return lines.slice(start + 1, lines.indexOf("```", start + 1)).join("\n");
}

describe("the chat summary's prompt", () => {
  it("holds Appendix A's text exactly and fills the agency's name", () => {
    expect(SUMMARY_PROMPT_TEXT).toBe(appendixA());
    expect(BUILT_IN_SUMMARY_PROMPT).toEqual({ version: "built-in-summary-2", text: SUMMARY_PROMPT_TEXT });
    // What a customer's photo or file showed is kept, and an ask it answered is not open (the owner, 2026-11-25).
    expect(SUMMARY_PROMPT_TEXT).toContain('whose message says seen: "…", what it was');
    expect(SUMMARY_PROMPT_TEXT).toContain("An ask answered by a photo or file is answered");
    const text = renderSummaryPrompt(BUILT_IN_SUMMARY_PROMPT, "Sharma Holidays");
    expect(text).toContain("# Chat summary for Sharma Holidays");
    expect(text).not.toMatch(/\{\{/);
  });

  it("reads Langfuse's production prompt, else the built-in text", async () => {
    const kept = (label: string, text: string) => ({ name: SUMMARY_PROMPT_NAME, version: 2, label, text });
    expect(await summaryPromptOf(createMemoryPrompts([kept("production", "Live notes")]))).toMatchObject({
      text: "Live notes",
      source: { name: SUMMARY_PROMPT_NAME, version: 2, label: "production" },
    });
    expect(await summaryPromptOf(createMemoryPrompts([kept("latest", "Draft")]))).toEqual(BUILT_IN_SUMMARY_PROMPT);
    expect(await summaryPromptOf(undefined)).toEqual(BUILT_IN_SUMMARY_PROMPT);
  });
});
