// /settings/lead-sources/meta/callback: where Facebook's dialog sends the browser back, with a code and our state. The
// screen reads them in the browser, once, and clears them from the address.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MetaCallbackScreen } from "@/lead-sources/meta/connect/meta-callback-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metaLeads");
  return { title: t("callback.title") };
}

export default function MetaCallbackPage() {
  return (
    <RequirePermission permission="leads:create">
      <RequirePermission permission="leads:assign">
        <MetaCallbackScreen />
      </RequirePermission>
    </RequirePermission>
  );
}
