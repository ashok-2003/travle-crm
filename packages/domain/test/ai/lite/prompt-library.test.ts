// The lite agent's prompt pieces are pinned: a changed text needs a new version, and each stays inside its budget.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { promptLibrary, promptVersions } from "../../../src/ai/lite/prompts/library.js";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");

/**
 * "name@version": the sha256 of that version's text. Never edit a line: a changed text raises its version and adds a
 * line, so the old versions stay pinned beside it and a reviewer sees a new key, not a new hash under an old one.
 */
const pinned: Record<string, string> = {
  "understand.instructions@1": "92f0e1dabedca0abdc706815172d628d031c99a05460e6094accbf3c7b1eb00d",
  "understand.intents@1": "16b33b347d1cabb2764213d0728d7a0834839fac9249f2cb2dc6abdee43fd9e1",
  "understand.form@1": "557e2d86bca7a67d9f53ae1bd582c1325a9797dd56ec041a566562d34a6d62e1",
  "write.instructions@1": "1d2cdc252e23a064a4c03228d4e588f13b67e7efd74019293cca5c10af88e12f",
  "write.voice@1": "ffdda3206124bddd2ad60863ff43e90ffc54a136a1f1eb7ac00a2a1c7f7bf7a4",
  "write.moves@1": "7c32780df25dba134edc8d5e9dc6ecf9921fccdc650d5cd041f2f509b4140083",
  "fixed.texts@1": "8532a9dc282ff94810e2b0ac3bd413727868c6d521277932e18e5f22fb180dba",
  "fixed.texts@2": "f2431679715e339fb74c41e7370c71d15b6c1a0b6f561690b6aa54eebad3c1cb",
};

const budgets: Record<string, number> = {
  "understand.instructions": 1800,
  "understand.intents": 2400,
  "understand.form": 4000,
  "write.instructions": 1400,
  "write.voice": 700,
  "write.moves": 2400,
  "fixed.texts": 5600,
};

describe("the prompt library", () => {
  it("every piece's text is pinned under its name and version", () => {
    for (const piece of promptLibrary()) {
      const key = `${piece.name}@${String(piece.version)}`;
      expect([key, sha(piece.text)]).toEqual([key, pinned[key]]);
    }
  });

  it("keeps every earlier version's pin, and none ahead of the library", () => {
    const library = promptLibrary();
    const versions = (name: string) =>
      Object.keys(pinned)
        .filter((key) => key.startsWith(`${name}@`))
        .map((key) => Number(key.slice(name.length + 1)))
        .sort((a, b) => a - b);
    for (const piece of library) {
      expect([piece.name, versions(piece.name)]).toEqual([
        piece.name,
        Array.from({ length: piece.version }, (_, index) => index + 1),
      ]);
    }
    const names = new Set(library.map((piece) => piece.name));
    expect(Object.keys(pinned).filter((key) => !names.has(key.split("@")[0] as never))).toEqual([]);
  });

  it("starts every piece at version 1, changed on the day it was added", () => {
    for (const piece of promptLibrary()) {
      expect([piece.version, piece.changedOn]).toEqual(
        piece.name === "fixed.texts" ? [2, "2026-11-13"] : [1, "2026-11-12"],
      );
    }
    expect(Object.values(promptVersions())).toEqual([1, 1, 1, 1, 1, 1, 2]);
  });

  it("renders every fixed text in every language as key (language): text", () => {
    const text = promptLibrary().find((piece) => piece.name === "fixed.texts")?.text ?? "";
    expect(text).toContain("price_from (english): {package}: from {from} per person.");
    expect(text).toContain("price_from (hindi): {package}: {from} प्रति व्यक्ति से शुरू।");
    expect(text).toContain("how_can_i_help (hinglish): Bataiye, trip ke baare mein aap kya jaanna chahenge?");
    expect(text.split("\n")).toHaveLength(16 * 3);
  });

  it("fixed pieces stay in their budgets", () => {
    for (const piece of promptLibrary()) expect(piece.text.length).toBeLessThanOrEqual(budgets[piece.name] ?? 0);
  });

  it("renders the intents and the form from the docs", () => {
    const text = (name: string): string => promptLibrary().find((piece) => piece.name === name)?.text ?? "";
    expect(text("understand.intents")).toContain("## Intents");
    expect(text("understand.intents")).toContain('- price_question: Asks the price. Example: "How much for 3 people?"');
    expect(text("understand.form")).toContain("## The form");
    expect(text("understand.form")).toContain("- details.adults: How many adults travel. Example: ");
  });
});
