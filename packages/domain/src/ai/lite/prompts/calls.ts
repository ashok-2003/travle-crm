// What each of the lite agent's two model calls is given, as an outline the console's prompt library shows.
import { lookupTools, type LookupTool } from "@travel-crm/contracts/ai";
import { understandBlockHeads, writeBlockHeads, type BlockHead } from "../context/block-heads.js";
import type { PromptPieceName } from "../types.js";

/** The library pieces each call sends as its system message, in order. fixed.texts is in neither: code sends those. */
export const UNDERSTAND_SYSTEM = [
  "understand.instructions",
  "understand.intents",
  "understand.form",
] as const satisfies readonly PromptPieceName[];
export const WRITE_SYSTEM = [
  "write.instructions",
  "write.voice",
  "write.moves",
] as const satisfies readonly PromptPieceName[];

export const UNDERSTAND_ANSWER = "understand_form";
export const WRITE_ANSWER = "write_move";

export interface ModelCallOutline {
  name: "understand" | "write";
  system: PromptPieceName[];
  blocks: BlockHead[];
  answer: typeof UNDERSTAND_ANSWER | typeof WRITE_ANSWER;
  lookups: LookupTool[];
}

export function modelCalls(): ModelCallOutline[] {
  // Places we run replaces the package index only when there are too many trips; it is not a block of its own.
  const understandBlocks = Object.values(understandBlockHeads).filter((head) => head !== understandBlockHeads.places);
  return [
    {
      name: "understand",
      system: [...UNDERSTAND_SYSTEM],
      blocks: understandBlocks.map((head) => ({ ...head })),
      answer: UNDERSTAND_ANSWER,
      lookups: [...lookupTools],
    },
    {
      name: "write",
      system: [...WRITE_SYSTEM],
      blocks: Object.values(writeBlockHeads).map((head) => ({ ...head })),
      answer: WRITE_ANSWER,
      lookups: [],
    },
  ];
}
