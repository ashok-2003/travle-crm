"use client";

// Jumping to a message from its quote (audit 8): the list scrolls to the original, loading older pages first when it is further
// back than what is shown, and the original flashes for a moment. A bubble outside a list has nowhere to jump.
import { createContext, useContext } from "react";

export interface ChatJump {
  /** Scroll to this message, loading earlier pages if needed. */
  jumpTo: (messageId: string) => void;
  /** The message that was just jumped to, for a moment. */
  highlightId: string | null;
}

const none: ChatJump = { jumpTo: () => undefined, highlightId: null };
export const ChatJumpContext = createContext<ChatJump | null>(null);
export const useChatJump = (): ChatJump => useContext(ChatJumpContext) ?? none;
