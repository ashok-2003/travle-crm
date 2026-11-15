// The natural agent's system prompt: Appendix A as written, its placeholders, its size, and the seam to the editor.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { estimateTokens } from "../../../src/ai/natural/context/tokens.js";
import { BUILT_IN_NATURAL_PROMPT, renderNaturalPrompt } from "../../../src/ai/natural/prompt.js";
import { naturalPromptOf, draftNaturalPrompt } from "../../../src/ai/natural/prompt-source.js";
import { NATURAL_PROMPT_TEXT } from "../../../src/ai/natural/prompt-text.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";

describe("the natural agent's prompt", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("holds Appendix A as written", () => {
    expect(NATURAL_PROMPT_TEXT.startsWith("# {agent_name}, {agency_name} on WhatsApp")).toBe(true);
    expect(NATURAL_PROMPT_TEXT).toContain("## Four things you never do");
    expect(NATURAL_PROMPT_TEXT.trimEnd().endsWith("</example>")).toBe(true);
  });
  it("renders the agent's name, the agency's name and the tone, and leaves no placeholder", () => {
    const text = renderNaturalPrompt(BUILT_IN_NATURAL_PROMPT, {
      agentName: "Riya",
      agencyName: "Sharma Holidays",
      tone: "friendly",
    });
    expect(text.split("\n")[0]).toBe("# Riya, Sharma Holidays on WhatsApp");
    expect(text).toContain("The agency chose the friendly tone.");
    expect(text).not.toMatch(/\{(agent_name|agency_name|tone)\}/);
  });
  it("renders an empty agent name as the agency's team", () => {
    expect(
      renderNaturalPrompt(BUILT_IN_NATURAL_PROMPT, {
        agentName: "",
        agencyName: "Sharma Holidays",
        tone: "professional",
      }).split("\n")[0],
    ).toBe("# the Sharma Holidays team, Sharma Holidays on WhatsApp");
  });
  it("fits its budget of 5,500 tokens (Appendix A is about 5,200)", () => {
    expect(estimateTokens(NATURAL_PROMPT_TEXT)).toBeLessThanOrEqual(5_500);
  });
  it("names no bench fixture's trip or price", () => {
    for (const word of ["Kedarkantha", "Brahmatal", "9,499", "10,499", "Majnu ka Tilla"])
      expect(NATURAL_PROMPT_TEXT).not.toContain(word);
  });
  it("uses the built-in prompt until the editor publishes one", async () => {
    expect(await naturalPromptOf(test.db)).toEqual(BUILT_IN_NATURAL_PROMPT);
    expect(await draftNaturalPrompt(test.db, "any")).toBeNull();
  });
});
