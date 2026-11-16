// Where the prompt comes from. This plan: always the built-in; the console's prompt editor fills these two later.
import type { Database } from "@travel-crm/db";
import { BUILT_IN_NATURAL_PROMPT, type NaturalPrompt } from "./prompt.js";

/* eslint-disable @typescript-eslint/no-unused-vars -- the arguments are the seam the editor's plan will use */
export function naturalPromptOf(_db: Database): Promise<NaturalPrompt> {
  return Promise.resolve(BUILT_IN_NATURAL_PROMPT);
}

// A saved draft to try before publishing; none exist until the editor does.
export function draftNaturalPrompt(_db: Database, _versionId: string): Promise<NaturalPrompt | null> {
  return Promise.resolve(null);
}
