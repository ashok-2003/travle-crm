// /privacy: how the product keeps agencies' and their customers' data (a draft for the owner's and a lawyer's review;
// Meta's app review asks for this page's address).
import { brand } from "@travel-crm/brand";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalPage } from "@/marketing/legal-page";

const sections = ["who", "what", "why", "where", "rights", "contact"] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.legal.privacy");
  return { title: t("title") };
}

export default async function PrivacyPage() {
  const t = await getTranslations("marketing.legal.privacy");
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
