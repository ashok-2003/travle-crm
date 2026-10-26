// /inbox/broadcasts: the agency's broadcasts to tagged chats, for the Owner and Admins.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BroadcastsScreen } from "@/inbox/broadcasts/broadcasts-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inbox.broadcasts");
  return { title: t("title") };
}

export default function BroadcastsPage() {
  return (
    <RequirePermission permission="inbox:templates">
      <BroadcastsScreen />
    </RequirePermission>
  );
}
