// Reads a message's `buttons` column (JSON written by queueSystemText) back as buttons, or null when there are none.
import { chatButtons } from "@travel-crm/contracts/inbox";

export function buttonsOf(column: unknown): { id: string; title: string }[] | null {
  const parsed = chatButtons.safeParse(column);
  return parsed.success ? parsed.data : null;
}
