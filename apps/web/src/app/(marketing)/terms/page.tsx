// /terms: the terms agencies use the product on (a draft for the owner's and a lawyer's review).
import { brand } from "@travel-crm/brand";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage } from "@/marketing/legal-page";

const sections = ["service", "accounts", "data", "payment", "use", "contact"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.legal.terms");
  return { title: t("title") };
}

export default async function TermsPage() {
  const t = await getTranslations("marketing.legal.terms");
  const words = { product: brand.productName, email: brand.supportEmail };
  return (
    <LegalPage
      title={t("title")}
      sections={sections.map((key) => ({
        key,
        heading: t(`sections.${key}.heading`),
        body: t(`sections.${key}.body`, words),
      }))}
    />
  );
}
