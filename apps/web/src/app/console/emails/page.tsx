// /console/emails: the emails that failed in the last 30 days, a super admin's (the failed-emails spec).
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FailedEmailsScreen } from "@/console/emails/failed-emails-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consolePlatform.emails");
  return { title: t("title") };
}

export default function ConsoleEmailsPage() {
  return <FailedEmailsScreen />;
}
