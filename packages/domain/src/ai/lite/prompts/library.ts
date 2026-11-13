// The lite agent's prompt pieces, each with a version and the day it last changed. A trace records the versions, so a
// reply can be matched to the words that produced it. Holds no customer data. Change a text: raise its version.
import { fixedTextTable } from "../fixed-text-table.js";
import type { PromptPieceName } from "../types.js";
import { understandForm, understandInstructions, understandIntents } from "./understand-text.js";
import { writeInstructions, writeMoves, writeVoice } from "./write-text.js";

export interface PromptPiece {
  name: PromptPieceName;
  version: number;
  changedOn: string;
  text: string;
}

/** Every fixed text in every language, one `key (language): text` line each, slots left as written. */
const fixedTexts = Object.entries(fixedTextTable)
  .flatMap(([key, languages]) => Object.entries(languages).map(([language, text]) => `${key} (${language}): ${text}`))
  .join("\n");

const pieces: PromptPiece[] = [
  { name: "understand.instructions", version: 1, changedOn: "2026-11-12", text: understandInstructions },
  { name: "understand.intents", version: 1, changedOn: "2026-11-12", text: understandIntents },
  { name: "understand.form", version: 1, changedOn: "2026-11-12", text: understandForm },
  { name: "write.instructions", version: 1, changedOn: "2026-11-12", text: writeInstructions },
  { name: "write.voice", version: 1, changedOn: "2026-11-12", text: writeVoice },
  { name: "write.moves", version: 2, changedOn: "2026-11-13", text: writeMoves },
  { name: "fixed.texts", version: 2, changedOn: "2026-11-13", text: fixedTexts },
];

export function promptLibrary(): PromptPiece[] {
  return pieces.map((piece) => ({ ...piece }));
}

export function promptVersions(): Record<PromptPieceName, number> {
  return Object.fromEntries(pieces.map((piece) => [piece.name, piece.version])) as Record<PromptPieceName, number>;
}
