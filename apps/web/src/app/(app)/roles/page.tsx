// /roles: the organization's roles, for members whose role may manage them.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RolesScreen } from "@/organization/roles/roles-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("roles");
  return { title: t("title") };
}

export default function RolesPage() {
  return (
    <RequirePermission permission="roles:manage">
      <RolesScreen />
    </RequirePermission>
  );
}
