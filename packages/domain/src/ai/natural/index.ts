// Public API of the natural sales agent (spec 2026-11-14): its prompt, the shapes its parts share, and its dry turn (Try it,
// the bench).
export * from "./prompt.js";
export * from "./prompt-source.js";
export type * from "./types.js";
export {
  naturalDryTurn,
  naturalDryTurnInFull,
  type FlagContext,
  type NaturalDryDependencies,
  type NaturalDryRecord,
  type NaturalDryTurn,
} from "./dry-turn.js";
export { naturalDryRun, type NaturalTestChat } from "./dry-run.js";
