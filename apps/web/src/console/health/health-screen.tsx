"use client";

// /console/health: what is broken now and the last week's incidents, resolved (the owner, 2026-11-08), moved off the
// dashboard so it stays short. Support and super admins alike.
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/page-header";
import { SystemHealth } from "../dashboard/system-health";

export function HealthScreen() {
  const t = useTranslations("console.health");
  return (
    <div className="flex max-w-[1000px] flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro")} />
      <SystemHealth history />
    </div>
  );
}
