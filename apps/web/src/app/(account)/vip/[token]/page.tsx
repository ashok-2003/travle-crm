// /vip/<token>: an invite's link (the invite program). The page opens the invite, which makes the company's
// organization the first time, and signs its owner in; the server reads only the token, never anyone's data.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { VipJoinScreen } from "@/vip/vip-join-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("vip");
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function VipPage({ params }: PageProps<"/vip/[token]">) {
  const { token } = await params;
  return <VipJoinScreen token={token} />;
}
