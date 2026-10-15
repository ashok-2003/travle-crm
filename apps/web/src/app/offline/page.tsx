// The page the service worker shows, at the address the person tried, when there is no connection and no saved shell
// for it (a page that needs a connection, or no page at all). The worker keeps it, so it needs no network, and both
// ways out work without scripts.
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
      <div className="flex flex-col items-center gap-3">
        {/* An empty href is this very address, query included (a GET form would drop the query): a full load,
            which tries the network again. */}
        <Button asChild>
          <a href="">{t("tryAgain")}</a>
        </Button>
        <Button asChild variant="ghost">
          <Link href={routes.home}>{t("home")}</Link>
        </Button>
      </div>
    </main>
  );
}
