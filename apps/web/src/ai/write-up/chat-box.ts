// Words handed to a chat's reply box from another screen, kept in the tab (never in an address) until the box reads them: the
// words themselves under the inbox's own draft key, and the AI draft they began as, so the send is audited as drafted by AI.
import { draftKey } from "@/inbox/forward-dialog";
import { keepTabValue, readTabValue } from "@/lib/tab-storage";
import type { AiDraft } from "../suggest-button";

export const aiDraftKey = (conversationId: string) => `inbox.ai-draft.${conversationId}`;

/** Puts the AI's words in the chat's reply box for the person to read, change and send. */
export function keepAiDraft(conversationId: string, draft: AiDraft): void {
  keepTabValue(draftKey(conversationId), draft.text);
  keepTabValue(aiDraftKey(conversationId), JSON.stringify(draft));
}

/** The AI draft waiting for this chat's box, if the words it began as are still what the box holds. */
export function readAiDraft(conversationId: string): AiDraft | null {
  const stored = readTabValue(aiDraftKey(conversationId));
  if (stored === null) return null;
  try {
    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed === "object" && parsed !== null && "id" in parsed && "text" in parsed) {
      const { id, text } = parsed;
      if (typeof id === "string" && typeof text === "string") return { id, text };
    }
  } catch {
    // Not ours: no draft.
  }
  return null;
}

/** The box no longer holds an AI draft (sent, or emptied). */
export function forgetAiDraft(conversationId: string): void {
  keepTabValue(aiDraftKey(conversationId), "");
}
