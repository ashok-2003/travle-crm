// The public page's opening: what the product does in one line, the page's one h1, the way to talk to sales and the
// way in, beside the picture of leads arriving from everywhere.
import { brand } from "@travel-crm/brand";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { whatsAppLink } from "./contact-links";
import { LeadListPreview } from "./lead-list-preview";

export function Hero() {
  const t = useTranslations("marketing.hero");
  return (
    <section aria-labelledby="hero-heading" className="grid items-center gap-10 py-12 md:py-20 lg:grid-cols-2">
      <div className="flex max-w-[60ch] flex-col gap-5">
        <div id="hero-heading">
          <PageTitle className="text-balance">{t("title")}</PageTitle>
        </div>
        <p className="text-pretty text-muted-foreground">{t("intro", { product: brand.productName })}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <a href={whatsAppLink(brand.salesContact.phone)} target="_blank" rel="noopener noreferrer">
              {t("talkToSales")}
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link href={routes.signIn}>{t("signIn")}</Link>
          </Button>
        </div>
      </div>
      <LeadListPreview />
    </section>
  );
}
