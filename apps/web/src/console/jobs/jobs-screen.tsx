"use client";

// The console's jobs (spec 9.1, ADR 0010): the failed jobs, newest first, and the schedules that start jobs.
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/page-header";
import { FailedJobsSection } from "./failed-jobs-section";
import { SchedulesSection } from "./schedules-section";

export function JobsScreen() {
  const t = useTranslations("consolePlatform.jobs");
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("title")} intro={t("intro")} />
      <FailedJobsSection />
      <SchedulesSection />
    </div>
  );
}
