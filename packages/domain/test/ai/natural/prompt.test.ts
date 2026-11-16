// The natural agent's system prompt: Appendix A as written, its {{placeholders}} (Langfuse's, so code and Langfuse share
// one template), its size, and where it comes from: Langfuse's prompt at label production, else the built-in text.
import { setTimeout as wait } from "node:timers/promises";
import { createMemoryPrompts, type AiPrompts } from "@travel-crm/integrations/prompts";
import { describe, expect, it } from "vitest";
import { estimateTokens, NATURAL_BUDGETS } from "../../../src/ai/natural/context/tokens.js";
import {
  BUILT_IN_NATURAL_PROMPT,
  NATURAL_PROMPT_PLACEHOLDERS,
  renderNaturalPrompt,
} from "../../../src/ai/natural/prompt.js";
import {
  NATURAL_PROMPT_NAME,
  naturalPromptAt,
  naturalPromptOf,
  naturalTryItPrompt,
} from "../../../src/ai/natural/prompt-source.js";
import { NATURAL_PROMPT_TEXT } from "../../../src/ai/natural/prompt-text.js";

const voice = { agentName: "Riya", agencyName: "Sharma Holidays", tone: "friendly" } as const;
const kept = (version: number, label: string, text: string) => ({ name: NATURAL_PROMPT_NAME, version, label, text });
const liveText = "# {{agent_name}} of {{agency_name}}, in a {{ tone }} voice. {{agency_name}} again.";

describe("the natural agent's prompt", () => {
  it("holds prompt v2 as written", () => {
    expect(NATURAL_PROMPT_TEXT.startsWith("# {{agent_name}}, {{agency_name}} on WhatsApp")).toBe(true);
    expect(NATURAL_PROMPT_TEXT).toContain("## Four things you never do");
    expect(NATURAL_PROMPT_TEXT.trimEnd().endsWith("</example>")).toBe(true);
  });
  it("asks for the line the code splits two messages at, and for lists with blank-line spacing", () => {
    expect(NATURAL_PROMPT_TEXT).toContain("Put a line with only --- between them. Never more than two.");
    expect(NATURAL_PROMPT_TEXT).toContain("A blank line inside a message is only spacing.");
    expect(NATURAL_PROMPT_TEXT).toContain("put each on its own line starting with •");
    // Every example's two messages are split as the code splits them: no blank line between two of the agent's lines.
    expect(NATURAL_PROMPT_TEXT).not.toContain("A blank line between two of your lines means two messages.");
  });
  it("writes its placeholders as Langfuse does, {{like_this}}, and only the ones code fills", () => {
    expect(NATURAL_PROMPT_TEXT).not.toMatch(/(?<!\{)\{\s*[a-z_]+\s*\}(?!\})/);
    const used = new Set([...NATURAL_PROMPT_TEXT.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((match) => match[1]));
    expect([...used].sort()).toEqual([...NATURAL_PROMPT_PLACEHOLDERS].sort());
  });
  it("renders the agent's name, the agency's name and the tone, and leaves no placeholder", () => {
    const text = renderNaturalPrompt(BUILT_IN_NATURAL_PROMPT, voice);
    expect(text.split("\n")[0]).toBe("# Riya, Sharma Holidays on WhatsApp");
    expect(text).toContain("The agency chose the friendly tone.");
    expect(text).not.toMatch(/\{\{?\s*(agent_name|agency_name|tone)\s*\}\}?/);
  });
  it("renders an empty agent name as the agency's team", () => {
    expect(renderNaturalPrompt(BUILT_IN_NATURAL_PROMPT, { ...voice, agentName: "", tone: "professional" })).toMatch(
      /^# the Sharma Holidays team, Sharma Holidays on WhatsApp\n/,
    );
  });
  it("fills a Langfuse text's placeholders, spaces inside the braces too", () => {
    expect(renderNaturalPrompt({ version: "langfuse:x@1", text: liveText }, voice)).toBe(
      "# Riya of Sharma Holidays, in a friendly voice. Sharma Holidays again.",
    );
  });
  it("fits its budget of 6,000 tokens (prompt v2 is about 5,600)", () => {
    expect(estimateTokens(NATURAL_PROMPT_TEXT)).toBeLessThanOrEqual(NATURAL_BUDGETS.prompt);
  });
  it("names no bench fixture's trip or price", () => {
    for (const word of ["Kedarkantha", "Brahmatal", "9,499", "10,499", "Majnu ka Tilla"])
      expect(NATURAL_PROMPT_TEXT).not.toContain(word);
  });
});

describe("where the natural agent's prompt comes from", () => {
  it("is Langfuse's prompt at label production when it has one, its version naming it", async () => {
    const prompts = createMemoryPrompts([kept(4, "production", liveText)]);
    expect(await naturalPromptOf(prompts)).toEqual({
      version: "langfuse:whatsapp-agent/natural-system@4",
      text: liveText,
      source: { name: NATURAL_PROMPT_NAME, version: 4, label: "production" },
    });
    expect(prompts.asked).toEqual([{ name: "whatsapp-agent/natural-system", label: "production", fresh: false }]);
  });

  it("is the built-in text when Langfuse has none, or fails", async () => {
    expect(await naturalPromptOf(createMemoryPrompts())).toEqual(BUILT_IN_NATURAL_PROMPT);
    expect(await naturalPromptOf(undefined)).toEqual(BUILT_IN_NATURAL_PROMPT);
    expect(BUILT_IN_NATURAL_PROMPT.version).toBe("built-in-1");
    const failing: AiPrompts = { textPrompt: () => Promise.reject(new Error("down")) };
    expect(await naturalPromptOf(failing)).toEqual(BUILT_IN_NATURAL_PROMPT);
    const throwing: AiPrompts = {
      textPrompt: () => {
        throw new Error("down");
      },
    };
    expect(await naturalPromptOf(throwing)).toEqual(BUILT_IN_NATURAL_PROMPT);
  });

  it("reads the prompt at any label, or none", async () => {
    const prompts = createMemoryPrompts([kept(7, "draft", "Draft words")]);
    expect(await naturalPromptAt(prompts, "draft")).toMatchObject({
      version: "langfuse:whatsapp-agent/natural-system@7",
      source: { label: "draft", version: 7 },
    });
    expect(await naturalPromptAt(prompts, "staging")).toBeNull();
  });

  it("gives Try it the draft, read fresh, and the live prompt when there is no draft", async () => {
    const both = createMemoryPrompts([kept(4, "production", liveText), kept(7, "draft", "Draft words")]);
    expect(await naturalTryItPrompt(both, "draft")).toMatchObject({ text: "Draft words", source: { label: "draft" } });
    expect(await naturalTryItPrompt(both, "live")).toMatchObject({ source: { label: "production", version: 4 } });
    // The draft (fresh) and the live prompt are asked together; live asks the live prompt alone.
    expect(both.asked).toEqual([
      { name: NATURAL_PROMPT_NAME, label: "draft", fresh: true },
      { name: NATURAL_PROMPT_NAME, label: "production", fresh: false },
      { name: NATURAL_PROMPT_NAME, label: "production", fresh: false },
    ]);

    const liveOnly = createMemoryPrompts([kept(4, "production", liveText)]);
    expect(await naturalTryItPrompt(liveOnly, "draft")).toMatchObject({ source: { label: "production" } });
    expect(await naturalTryItPrompt(createMemoryPrompts(), "draft")).toEqual(BUILT_IN_NATURAL_PROMPT);
  });

  it("waits on a slow Langfuse once for Try it's draft, not once for the draft and again for the live prompt", async () => {
    // Each answer takes the adapter's whole bound (scaled down): the draft never comes, the live prompt does.
    const bound = 300;
    const slow: AiPrompts = {
      textPrompt: async (name, label) => {
        await wait(bound);
        return label === "production" ? kept(4, "production", liveText) : null;
      },
    };
    const started = Date.now();
    expect(await naturalTryItPrompt(slow, "draft")).toMatchObject({ source: { label: "production", version: 4 } });
    expect(Date.now() - started).toBeLessThan(bound * 1.5);
  });
});
