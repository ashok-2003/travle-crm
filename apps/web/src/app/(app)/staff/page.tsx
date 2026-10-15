// /staff: the organization's staff, for members whose role may manage them.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StaffScreen } from "@/organization/staff/staff-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("staff");
  return { title: t("title") };
}

export default function StaffPage() {
  return (
    <RequirePermission permission="staff:manage">
      <StaffScreen />
    </RequirePermission>
  );
}
