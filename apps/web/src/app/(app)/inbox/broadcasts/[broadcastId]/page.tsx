// /inbox/broadcasts/<id>: one broadcast and the chats it was made for. The address carries the broadcast's id alone.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BroadcastDetailScreen } from "@/inbox/broadcasts/broadcast-detail-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inbox.broadcasts");
  return { title: t("title") };
}

export default async function BroadcastPage({ params }: { params: Promise<{ broadcastId: string }> }) {
  const { broadcastId } = await params;
  return (
    <RequirePermission permission="inbox:templates">
      <BroadcastDetailScreen broadcastId={broadcastId} />
    </RequirePermission>
  );
}
