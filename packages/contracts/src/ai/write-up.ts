// How the AI's words for a customer sound (the agency's chosen style); kept stored although no screen writes quotes up now.
import { z } from "zod";

export const writeStyles = ["warm", "premium", "short"] as const;
export const writeStyle = z.enum(writeStyles);
export type WriteStyle = z.infer<typeof writeStyle>;
