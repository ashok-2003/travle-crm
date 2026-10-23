// /settings/lead-sources/meta/pages/<pageId>: one connected Facebook Page, its forms, counts and the leads that couldn't be added.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MetaPageScreen } from "@/lead-sources/meta/page/meta-page-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metaLeads");
  return { title: t("list.heading") };
}

export default async function MetaPagePage({ params }: PageProps<"/settings/lead-sources/meta/pages/[pageId]">) {
  const { pageId } = await params;
  return (
    <RequirePermission permission="leads:create">
      <RequirePermission permission="leads:assign">
        <MetaPageScreen pageId={pageId} />
      </RequirePermission>
    </RequirePermission>
  );
}
