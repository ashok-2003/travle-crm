// /setup: the setup checklist, for members whose role may change settings (the api's own rule for it).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SetupScreen } from "@/business/setup/setup-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("business");
  return { title: t("setup.title") };
}

export default function SetupPage() {
  return (
    <RequirePermission permission="settings:manage">
      <SetupScreen />
    </RequirePermission>
  );
}
