// Every AI prompt the owner manages in Langfuse is listed in a prompt-text.ts that imports nothing (the upload script
// loads those files alone), under a unique "area/name", with words; and every listed name is read by the code.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const aiFolder = path.resolve(import.meta.dirname, "../../src/ai");

async function textFiles(): Promise<string[]> {
  const entries = await readdir(aiFolder, { recursive: true });
  return entries
    .filter((entry) => path.basename(entry) === "prompt-text.ts")
    .map((entry) => path.join(aiFolder, entry));
}

async function sourceFiles(): Promise<string[]> {
  const entries = await readdir(aiFolder, { recursive: true });
  return entries
    .filter((entry) => entry.endsWith(".ts") && path.basename(entry) !== "prompt-text.ts")
    .map((entry) => path.join(aiFolder, entry));
}

describe("the managed prompts", () => {
  it("each prompt-text.ts imports nothing and lists its prompts, each a unique area/name with words", async () => {
    const names: string[] = [];
    for (const file of await textFiles()) {
      const source = await readFile(file, "utf8");
      expect(source, file).not.toMatch(/^import /m);
      const module = (await import(file)) as { MANAGED_PROMPTS?: readonly { name: string; text: string }[] };
      expect(module.MANAGED_PROMPTS, file).toBeDefined();
      for (const prompt of module.MANAGED_PROMPTS ?? []) {
        expect(prompt.name).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/);
        expect(prompt.text.trim()).not.toBe("");
        names.push(prompt.name);
      }
    }
    expect(names.length).toBeGreaterThanOrEqual(3);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every listed name is read by the code", async () => {
    const code = (await Promise.all((await sourceFiles()).map((file) => readFile(file, "utf8")))).join("\n");
    for (const file of await textFiles()) {
      const module = (await import(file)) as { MANAGED_PROMPTS: readonly { name: string }[] };
      for (const { name } of module.MANAGED_PROMPTS) expect(code, name).toContain(`"${name}"`);
    }
  });
});
