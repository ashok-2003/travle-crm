// Checks a notification input against its contract, turning a mismatch into a domain error the API can show.
import { DomainError } from "../kernel/index.js";

interface Schema<Output> {
  safeParse(value: unknown): { success: true; data: Output } | { success: false; error: { message: string } };
}

export function parseInput<Output>(schema: Schema<Output>, input: unknown, reason: string): Output {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new DomainError("VALIDATION", reason, parsed.error.message);
  return parsed.data;
}
