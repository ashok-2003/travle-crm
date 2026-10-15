"use client";

// The console's jobs (spec 9.1, ADR 0010): the failed jobs, newest first, and the schedules that start jobs.
import { useTranslations } from "next-intl";
import { PageTitle } from "@/components/page-title";
import { FailedJobsSection } from "./failed-jobs-section";
import { SchedulesSection } from "./schedules-section";

export function JobsScreen() {
  const t = useTranslations("consolePlatform.jobs");
  return (
    <div className="flex flex-col gap-8">
      <div className="flex max-w-[65ch] flex-col gap-2">
        <PageTitle>{t("title")}</PageTitle>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      <FailedJobsSection />
      <SchedulesSection />
    </div>
  );
}
