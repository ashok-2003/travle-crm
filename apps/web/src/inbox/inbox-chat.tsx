"use client";

// The chat area of the Inbox (inbox revamp spec, part 1 item 1), the only part that changes as chats are chosen: the open
// chat beside the list on a computer, or over the list on a phone (its own top bar and a way back, as WhatsApp's), and
// with none chosen, a word where the chat would be on a computer.
import { MessageCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { useWideScreen } from "@/lib/use-wide-screen";
import { ChatPanel } from "./chat-panel";

export function InboxChat({ conversationId }: { conversationId: string }) {
  if (!useWideScreen()) {
    return (
      // On a phone a chat covers the screen, its top bar and bottom bar included, as WhatsApp's does.
      <div className="fixed inset-0 z-(--z-overlay) flex flex-col bg-background">
        <ChatPanel key={conversationId} conversationId={conversationId} variant="page" />
      </div>
    );
  }
  return <ChatPanel key={conversationId} conversationId={conversationId} />;
}

export function InboxHome() {
  const t = useTranslations("inbox");
  if (!useWideScreen()) return null;
  return (
    <div className="flex items-center justify-center bg-surface">
      <EmptyState icon={MessageCircleIcon} message={t("pickChat")} />
    </div>
  );
}
