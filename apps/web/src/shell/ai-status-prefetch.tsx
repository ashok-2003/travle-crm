"use client";

// Asks for the agency's AI switch as soon as the plan says `ai`, from the shell, so the AI buttons (Fill with AI, Write for the
// customer, Ask, Suggest reply...) are there with their form instead of appearing after it. The answer is kept five minutes and
// refreshed when Settings, AI changes it; a saved copy of it answers at once on a reload.
import { useAiAvailability } from "@/ai/use-ai";

export function AiStatusPrefetch() {
  useAiAvailability();
  return null;
}
