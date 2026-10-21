// "/": the product's public page for visitors (someone signed in goes on to their home: src/proxy.ts). What it does,
// where leads come from, the AI on WhatsApp, the plans and prices (which the browser asks the api for), how to
// start, questions, and how to reach us. Static: it holds nobody's data.
import { brand } from "@travel-crm/brand";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Separator } from "@/components/ui/separator";
import { AiSection } from "@/marketing/ai-section";
import { ContactSection } from "@/marketing/contact-section";
import { FaqSection } from "@/marketing/faq-section";
import { FeaturesSection } from "@/marketing/features-section";
import { GuidesSection } from "@/marketing/guides-section";
import { Hero } from "@/marketing/hero";
import { PricingSection } from "@/marketing/pricing-section";
import { SourcesSection } from "@/marketing/sources-section";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing.meta");
  return { title: { absolute: t("title", { product: brand.productName }) }, description: t("description") };
}

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Separator />
      <SourcesSection />
      <Separator />
      <FeaturesSection />
      <Separator />
      <AiSection />
      <Separator />
      <PricingSection />
      <Separator />
      <GuidesSection />
      <Separator />
      <FaqSection />
      <Separator />
      <ContactSection />
    </>
  );
}
