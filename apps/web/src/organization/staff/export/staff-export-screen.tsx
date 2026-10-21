"use client";

// A staff export's page (spec 3.3, B42), where the bell's "Your staff export is ready" leads: the shared export page
// with the staff list as its way back.
import { useTranslations } from "next-intl";
import { ExportScreen } from "@/exports/export-screen";
import { routes } from "@/lib/routes";
import { useStaffExportCalls } from "./use-staff-export-calls";

export function StaffExportScreen({ exportId }: { exportId: string }) {
  const t = useTranslations("staff.export");
  return (
    <ExportScreen
      title={t("pageTitle")}
      holds={t("holds")}
      calls={useStaffExportCalls()}
      exportId={exportId}
      back={{ href: routes.staff, label: t("back") }}
    />
  );
}
