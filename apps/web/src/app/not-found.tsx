// An address no page has (Next.js answers it with a 404), in the offline page's shape: what happened, in one sentence,
// and the way home.
import type { Metadata } from "next";
import { SearchXIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MessagePage } from "@/components/message-page";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.notFound");
  return { title: t("title") };
}

export default async function NotFound() {
  const t = await getTranslations("common.notFound");
  return (
    <MessagePage icon={SearchXIcon} title={t("title")} body={t("body")}>
      <Button asChild>
        <Link href={routes.home}>{t("home")}</Link>
      </Button>
    </MessagePage>
  );
}
