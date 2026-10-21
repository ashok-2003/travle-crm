// /staff/import/<importId>: a staff import at whichever step it is, so leaving and coming back finds it where it was.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { StaffImportScreen } from "@/organization/staff/import/staff-import-screen";
import { RequirePermission } from "@/session/require-permission";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("staff.import");
  return { title: t("title") };
}

export default async function StaffImportRunPage({ params }: PageProps<"/staff/import/[importId]">) {
  const { importId } = await params;
  return (
    <RequirePermission permission="staff:manage">
      <StaffImportScreen importId={importId} />
    </RequirePermission>
  );
}
