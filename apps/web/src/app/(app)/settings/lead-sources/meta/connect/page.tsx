// /settings/lead-sources/meta/connect: the first step of connecting a Facebook Page, Continue with Facebook.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MetaConnectScreen } from "@/lead-sources/meta/connect/meta-connect-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metaLeads");
  return { title: t("connect.title") };
}

export default function ConnectPagePage() {
  return (
    <RequirePermission permission="leads:create">
      <RequirePermission permission="leads:assign">
        <MetaConnectScreen />
      </RequirePermission>
    </RequirePermission>
  );
}
