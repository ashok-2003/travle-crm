// /inbox: the WhatsApp chats (spec 3.1), for members whose role sees them (their own leads' or everyone's).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InboxScreen } from "@/inbox/inbox-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inbox");
  return { title: t("title") };
}

export default function InboxPage() {
  return (
    <RequirePermission permission="inbox:view">
      <InboxScreen conversationId={null} />
    </RequirePermission>
  );
}
