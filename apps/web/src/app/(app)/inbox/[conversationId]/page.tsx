// /inbox/<id>: one WhatsApp chat. The address carries the chat's id alone; no number or word of a chat is in it.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InboxScreen } from "@/inbox/inbox-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inbox");
  return { title: t("title") };
}

export default async function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  return (
    <RequirePermission permission="inbox:view">
      <InboxScreen conversationId={conversationId} />
    </RequirePermission>
  );
}
