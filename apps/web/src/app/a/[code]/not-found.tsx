// A public package page that is not there: never published, taken down, the agency's pages off, or a wrong address. One plain
// answer for all of them (release 7b), so a visitor learns nothing about the agency.
import type { Metadata } from "next";
import { SearchXIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { MessagePage } from "@/components/message-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("packagePages.page");
  return { title: { absolute: t("unavailableTitle") }, robots: { index: false, follow: false } };
}

export default async function PackagePageNotAvailable() {
  const t = await getTranslations("packagePages.page");
  return (
    <MessagePage icon={SearchXIcon} title={t("unavailableTitle")} body={t("unavailable")}>
      {null}
    </MessagePage>
  );
}
