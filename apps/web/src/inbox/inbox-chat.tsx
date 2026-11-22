"use client";

// The chat area of the Inbox (inbox revamp spec, part 1 item 1), the only part that changes as chats are chosen: the open
// chat beside the list from 1024px, or over the list narrower (its own top bar and a way back, as WhatsApp's on a phone),
// and with none chosen, a word where the chat would be beside the list.
import { MessageCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { ChatPanel } from "./chat-panel";
import { useInboxTwoPanes } from "./inbox-panes";

export function InboxChat({ conversationId }: { conversationId: string }) {
  if (!useInboxTwoPanes()) {
    return (
      // One pane at a time: a chat covers the screen, its top bar and bottom bar included, as WhatsApp's does.
      <div className="fixed inset-0 z-(--z-overlay) flex flex-col bg-background">
        <ChatPanel key={conversationId} conversationId={conversationId} variant="page" />
      </div>
    );
  }
  return <ChatPanel key={conversationId} conversationId={conversationId} />;
}

export function InboxHome() {
  const t = useTranslations("inbox");
  if (!useInboxTwoPanes()) return null;
  return (
    <div className="flex items-center justify-center bg-surface">
      <EmptyState icon={MessageCircleIcon} message={t("pickChat")} />
    </div>
  );
}
