// The lite agent's prompt library for the console: every fixed piece with its version and text, and what each call is given.
import { modelCalls, promptLibrary, type ModelCallOutline, type PromptPiece } from "../ai/index.js";

export interface AiPromptLibrary {
  pieces: PromptPiece[];
  calls: ModelCallOutline[];
}

export function getAiPromptLibrary(): AiPromptLibrary {
  return { pieces: promptLibrary(), calls: modelCalls() };
}
