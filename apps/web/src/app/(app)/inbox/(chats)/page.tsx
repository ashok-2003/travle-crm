// /inbox: the WhatsApp chats (spec 3.1), for members whose role sees them (their own leads' or everyone's). The list is
// the layout's; with no chat chosen, a computer shows a word where the chat would be.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InboxHome } from "@/inbox/inbox-chat";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inbox");
  return { title: t("title") };
}

export default function InboxPage() {
  return <InboxHome />;
}
