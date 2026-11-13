// What the console shows super admins of the lite WhatsApp agent: its prompt library.
import { z } from "zod";

export const aiPromptPiece = z.object({
  name: z.string(),
  version: z.int().min(1),
  changedOn: z.iso.date(),
  text: z.string(),
});
export type AiPromptPiece = z.infer<typeof aiPromptPiece>;

export const aiModelCall = z.object({
  name: z.enum(["understand", "write"]),
  system: z.array(z.string()),
  blocks: z.array(z.object({ title: z.string(), purpose: z.string(), budget: z.int() })),
  answer: z.string(),
  lookups: z.array(z.string()),
});
export type AiModelCall = z.infer<typeof aiModelCall>;

export const aiPromptLibrary = z.object({ pieces: z.array(aiPromptPiece), calls: z.array(aiModelCall) });
export type AiPromptLibrary = z.infer<typeof aiPromptLibrary>;
