// The page the service worker shows for an address that was never visited, while there is no connection. It is
// kept when the worker installs, so it needs no network; "Try again" is a plain form, which works without scripts.
import type { Metadata } from "next";
import { WifiOffIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pwa.offline");
  return { title: t("title") };
}

export default async function OfflinePage() {
  const t = await getTranslations("pwa.offline");
  return (
    <main className="mx-auto flex min-h-dvh max-w-[40ch] flex-col items-center justify-center gap-4 px-4 text-center">
      <WifiOffIcon aria-hidden="true" className="size-10 text-muted-foreground" strokeWidth={1.25} />
      <PageTitle>{t("title")}</PageTitle>
      <p className="text-muted-foreground">{t("body")}</p>
      {/* A GET form without an action reloads the address the person tried. */}
      <form className="flex flex-col items-center gap-3">
        <Button type="submit">{t("tryAgain")}</Button>
        <Link href={routes.home} className="text-primary underline-offset-4 hover:underline">
          {t("home")}
        </Link>
      </form>
    </main>
  );
}
