// /console/jobs: the jobs that failed after their last retry, and the schedules that start jobs (spec 9.1).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { JobsScreen } from "@/console/jobs/jobs-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consolePlatform.jobs");
  return { title: t("title") };
}

export default function ConsoleJobsPage() {
  return <JobsScreen />;
}
