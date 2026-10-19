// /staff/import: choosing the file of a staff import, for members whose role may manage staff.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StaffChooseFile } from "@/organization/staff/import/staff-choose-file";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("staff.import");
  return { title: t("title") };
}

export default function StaffImportPage() {
  return (
    <RequirePermission permission="staff:manage">
      <StaffChooseFile />
    </RequirePermission>
  );
}
