// /inbox/<id>: one WhatsApp chat, beside the layout's list (over it on a phone). The address carries the chat's id alone;
// no number or word of a chat is in it.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InboxChat } from "@/inbox/inbox-chat";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inbox");
  return { title: t("title") };
}

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  return <InboxChat conversationId={conversationId} />;
}
