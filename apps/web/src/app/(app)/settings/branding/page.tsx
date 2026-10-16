// /settings/branding: the organization's logo, colour and terms on its documents, for roles that may change settings.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BrandingScreen } from "@/branding/branding-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("documents.branding");
  return { title: t("title") };
}

export default function BrandingPage() {
  return (
    <RequirePermission permission="settings:manage">
      <BrandingScreen />
    </RequirePermission>
  );
}
