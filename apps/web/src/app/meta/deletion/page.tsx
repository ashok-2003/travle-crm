// /meta/deletion?code=...: the status page Meta shows a Facebook user who asked for their data to be deleted (the address the
// data-deletion callback answers). Public: no sign-in, no storage, no organization data. The deletion was done before the
// callback answered, so any code of the right shape says it is done, and nothing else is told.
import type { Metadata } from "next";
import { ShieldCheckIcon, SearchXIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MessagePage } from "@/components/message-page";
import { Button } from "@/components/ui/button";
import { metaDeletionCodeIsWellFormed } from "@/lib/meta-deletion";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metaLeads.deletion");
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function MetaDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] | undefined }>;
}) {
  const t = await getTranslations("metaLeads.deletion");
  const { code } = await searchParams;
  const done = typeof code === "string" && metaDeletionCodeIsWellFormed(code);
  return (
    <MessagePage
      icon={done ? ShieldCheckIcon : SearchXIcon}
      title={done ? t("title") : t("unknownTitle")}
      body={done ? `${t("body")} ${t("next")}` : t("unknownBody")}
    >
      <Button asChild variant="ghost">
        <Link href={routes.home}>{t("home")}</Link>
      </Button>
    </MessagePage>
  );
}
