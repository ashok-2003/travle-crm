// A legal page (privacy, terms): its title, a note that it is a draft until the owner and a lawyer sign it off, and
// its sections in plain words, which each page passes in from its messages.
import { brand } from "@travel-crm/brand";
import { useTranslations } from "next-intl";
import { PageTitle } from "@/components/page-title";
import { BackLink } from "@/components/text-link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { routes } from "@/lib/routes";

export function LegalPage({
  title,
  sections,
}: {
  title: string;
  sections: readonly { key: string; heading: string; body: string }[];
}) {
  const t = useTranslations("marketing.legal");
  return (
    <article className="flex max-w-[720px] flex-col gap-6 py-10">
      <BackLink href={routes.landing} label={t("back", { product: brand.productName })} />
      <PageTitle>{title}</PageTitle>
      <Alert>
        <AlertDescription>{t("draft")}</AlertDescription>
      </Alert>
      {sections.map(({ key, heading, body }) => (
        <section key={key} aria-labelledby={`${key}-heading`} className="flex flex-col gap-2">
          <h2 id={`${key}-heading`} className="text-section font-semibold">
            {heading}
          </h2>
          <p className="text-pretty">{body}</p>
        </section>
      ))}
    </article>
  );
}
