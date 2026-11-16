// The in-memory prompts adapter: it answers the prompts it was given by name and label, null for any other, and records
// what it was asked.
import { describe, expect, it } from "vitest";
import { createMemoryPrompts, noPrompts } from "../../src/prompts/index.js";

const live = { name: "agent/system", version: 3, label: "production", text: "Hi {{agent_name}}" };

describe("createMemoryPrompts", () => {
  it("answers each prompt at its own label, null for any other, and records each ask", async () => {
    const prompts = createMemoryPrompts([live, { ...live, version: 4, label: "draft", text: "Draft" }]);
    expect(await prompts.textPrompt("agent/system", "production")).toEqual(live);
    expect(await prompts.textPrompt("agent/system", "draft", { fresh: true })).toMatchObject({ version: 4 });
    expect(await prompts.textPrompt("agent/system", "staging")).toBeNull();
    expect(await prompts.textPrompt("other", "production")).toBeNull();
    expect(prompts.asked).toEqual([
      { name: "agent/system", label: "production", fresh: false },
      { name: "agent/system", label: "draft", fresh: true },
      { name: "agent/system", label: "staging", fresh: false },
      { name: "other", label: "production", fresh: false },
    ]);
  });

  it("hands out a copy, so a caller's change never reaches the next call", async () => {
    const prompts = createMemoryPrompts([live]);
    const first = await prompts.textPrompt("agent/system", "production");
    if (first !== null) first.text = "changed";
    expect(await prompts.textPrompt("agent/system", "production")).toEqual(live);
  });
});

describe("noPrompts", () => {
  it("has none", async () => {
    expect(await noPrompts.textPrompt("agent/system", "production")).toBeNull();
  });
});
