"use client";

// The message a member is answering with a quote (audit 8): chosen from a bubble's menu or by a swipe, shown above the reply box
// with a way to drop it, sent with the reply and then forgotten. Held in memory for the open chat only: another chat has none.
import type { ChatMessage } from "@travel-crm/contracts/inbox";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface Replying {
  message: ChatMessage | null;
  replyTo: (message: ChatMessage) => void;
  clear: () => void;
}

const nothing: Replying = { message: null, replyTo: () => undefined, clear: () => undefined };
const ReplyingContext = createContext<Replying>(nothing);

/** What the open chat is replying to; an inert answer outside a chat (a bubble elsewhere shows no Reply). */
export const useReplying = () => useContext(ReplyingContext);

export function ReplyingProvider({ conversationId, children }: { conversationId: string; children: ReactNode }) {
  const [chosen, setChosen] = useState<{ conversationId: string; message: ChatMessage } | null>(null);
  const value = useMemo<Replying>(
    () => ({
      message: chosen?.conversationId === conversationId ? chosen.message : null,
      replyTo: (message) => {
        setChosen({ conversationId, message });
      },
      clear: () => {
        setChosen(null);
      },
    }),
    [chosen, conversationId],
  );
  return <ReplyingContext.Provider value={value}>{children}</ReplyingContext.Provider>;
}
