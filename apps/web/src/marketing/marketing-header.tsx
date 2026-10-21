// The public page's header: the product's mark and name, the page's parts (from tablets up; phones scroll), and Sign
// in, the one way into the app from here.
import { brand } from "@travel-crm/brand";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { routes } from "@/lib/routes";

/** The page's parts, in order: the ids of their sections and the keys of their names in "marketing.nav". */
export const marketingSections = ["features", "ai", "pricing", "faq", "contact"] as const;

export function MarketingHeader() {
  const t = useTranslations("marketing.nav");
  return (
    <header>
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-2 sm:px-6 lg:px-8">
        <Link href={routes.landing} className="flex min-h-11 items-center gap-2 font-semibold">
          <Image src="/icons/favicon.svg" alt="" width={28} height={28} unoptimized />
          {brand.productName}
        </Link>
        <nav aria-label={t("label")} className="hidden lg:block">
          <ul className="flex gap-1">
            {marketingSections.map((section) => (
              <li key={section}>
                <Button asChild variant="ghost">
                  <a href={`#${section}`}>{t(section)}</a>
                </Button>
              </li>
            ))}
          </ul>
        </nav>
        <Button asChild>
          <Link href={routes.signIn}>{t("signIn")}</Link>
        </Button>
      </div>
      <Separator />
    </header>
  );
}
