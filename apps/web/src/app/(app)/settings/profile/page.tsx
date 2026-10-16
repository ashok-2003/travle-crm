// /settings/profile: the organization's business profile, for members whose role may change settings (it holds the
// bank details).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProfileScreen } from "@/business/profile/profile-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("business");
  return { title: t("profile.title") };
}

export default function ProfilePage() {
  return (
    <RequirePermission permission="settings:manage">
      <ProfileScreen />
    </RequirePermission>
  );
}
