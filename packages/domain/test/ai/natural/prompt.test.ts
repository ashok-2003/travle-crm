// Filling a prompt's {{placeholders}} (Langfuse's, so code and Langfuse share one template) for one agency, and reading a
// prompt from Langfuse at a label: what the one agent's prompt is built on.
import { createMemoryPrompts, type AiPrompts } from "@travel-crm/integrations/prompts";
import { describe, expect, it } from "vitest";
import { renderNaturalPrompt } from "../../../src/ai/natural/prompt.js";
import { langfusePromptAt } from "../../../src/ai/natural/prompt-source.js";

const NAME = "whatsapp-agent/real-agent";
const voice = { agentName: "Riya", agencyName: "Sharma Holidays" } as const;
const kept = (version: number, label: string, text: string) => ({ name: NAME, version, label, text });
const liveText = "# {{agent_name}} of {{ agency_name }}. {{agency_name}} again.";

describe("a prompt's placeholders", () => {
  it("fills the agent's name and the agency's name, spaces inside the braces too", () => {
    expect(renderNaturalPrompt({ version: "langfuse:x@1", text: liveText }, voice)).toBe(
      "# Riya of Sharma Holidays. Sharma Holidays again.",
    );
  });

  it("names the agency's team when there is no agent name", () => {
    expect(renderNaturalPrompt({ version: "x", text: "# {{agent_name}}" }, { ...voice, agentName: " " })).toBe(
      "# the Sharma Holidays team",
    );
  });
});

describe("a prompt read from Langfuse", () => {
  it("is the prompt at the label asked, its version naming it, or null when there is none", async () => {
    const prompts = createMemoryPrompts([kept(7, "draft", "Draft words")]);
    expect(await langfusePromptAt(prompts, NAME, "draft")).toEqual({
      version: "langfuse:whatsapp-agent/real-agent@7",
      text: "Draft words",
      source: { name: NAME, version: 7, label: "draft" },
    });
    expect(await langfusePromptAt(prompts, NAME, "staging")).toBeNull();
    expect(await langfusePromptAt(undefined, NAME, "production")).toBeNull();
  });

  it("is null when Langfuse fails or throws, so the agent runs on its built-in text", async () => {
    const failing: AiPrompts = { textPrompt: () => Promise.reject(new Error("down")) };
    expect(await langfusePromptAt(failing, NAME, "production")).toBeNull();
    const throwing: AiPrompts = {
      textPrompt: () => {
        throw new Error("down");
      },
    };
    expect(await langfusePromptAt(throwing, NAME, "production")).toBeNull();
  });
});
