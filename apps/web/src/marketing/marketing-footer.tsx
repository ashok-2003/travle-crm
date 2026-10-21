// The public pages' footer: the legal pages, the way in, and the product's name with the year.
import { brand } from "@travel-crm/brand";
import { useTranslations } from "next-intl";
import { TextLink } from "@/components/text-link";
import { Separator } from "@/components/ui/separator";
import { routes } from "@/lib/routes";

export function MarketingFooter() {
  const t = useTranslations("marketing.footer");
  return (
    <footer>
      <Separator />
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p className="text-caption text-muted-foreground">
          {t("rights", { year: new Date().getFullYear(), product: brand.productName })}
        </p>
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          <li>
            <TextLink href={routes.privacy}>{t("privacy")}</TextLink>
          </li>
          <li>
            <TextLink href={routes.terms}>{t("terms")}</TextLink>
          </li>
          <li>
            <TextLink href={routes.signIn}>{t("signIn")}</TextLink>
          </li>
        </ul>
      </div>
    </footer>
  );
}
