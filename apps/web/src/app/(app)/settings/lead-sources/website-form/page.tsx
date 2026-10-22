// /settings/lead-sources/website-form: the agency's enquiry form, for roles that may add leads and manage settings
// (website form spec 3.2).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WebsiteFormScreen } from "@/lead-sources/website-form/website-form-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("websiteFormSettings");
  return { title: t("page.title") };
}

export default function WebsiteFormPage() {
  return (
    <RequirePermission permission="leads:create">
      <RequirePermission permission="settings:manage">
        <WebsiteFormScreen />
      </RequirePermission>
    </RequirePermission>
  );
}
