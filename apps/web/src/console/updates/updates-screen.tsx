"use client";

// Platform updates (the owner, 2026-11-17): what is broken now and the last week's incidents, for all platform staff,
// and, for a super admin, whether platform alerts reach this device. Moved here from the dashboard.
import { PageHeader } from "@/components/page-header";
import { PushDeviceCard } from "@/notifications/push/push-device-card";
import { useConsolePushApi } from "../notifications/use-console-push-api";
import { isSuperAdmin, useStaff } from "../session/staff-context";
import { SystemHealth } from "./system-health";
import { useTranslations } from "next-intl";

function PlatformAlerts() {
  return <PushDeviceCard api={useConsolePushApi()} platform />;
}

export function UpdatesScreen() {
  const t = useTranslations("console.updates");
  const staff = useStaff();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} />
      <SystemHealth />
      {isSuperAdmin(staff) && <PlatformAlerts />}
    </div>
  );
}
