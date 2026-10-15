// /console/staff: the platform's own staff, a super admin's to manage (spec 5, 6.1; ADR 0019).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StaffScreen } from "@/console/staff/staff-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consolePlatform.staff");
  return { title: t("title") };
}

export default function ConsoleStaffPage() {
  return <StaffScreen />;
}
