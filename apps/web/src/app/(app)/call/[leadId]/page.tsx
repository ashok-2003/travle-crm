// /call/<id>: the page a "Send to my phone" notification opens, for members whose role sees leads; a lead out of their
// scope is "not found".
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CallScreen } from "@/leads/call/call-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("leads.call.page");
  return { title: t("title") };
}

export default async function CallPage({ params }: PageProps<"/call/[leadId]">) {
  const { leadId } = await params;
  return (
    <RequirePermission permission="leads:view">
      <CallScreen leadId={leadId} />
    </RequirePermission>
  );
}
