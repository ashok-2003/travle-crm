"use client";

// The branding screen (spec 9.3): how the organization's documents look. Its logo at the top, its colour for the title,
// and its terms at the end, each saved on its own, and a sample quotation to see them on. The sections are grouped by
// their titles and the space between them, not boxed.
import { useTranslations } from "next-intl";
import { BackToSettings } from "@/components/back-to-settings";
import { PageHeader } from "@/components/page-header";
import { BrandingForm } from "./branding-form";
import { LogoPanel } from "./logo-panel";
import { SamplePreview } from "./sample-preview";

export function BrandingScreen() {
  const t = useTranslations("documents.branding");
  return (
    <div className="flex max-w-[720px] flex-col gap-8">
      <div className="flex flex-col gap-6">
        <BackToSettings />
        <PageHeader title={t("title")} intro={t("intro")} />
      </div>
      <LogoPanel />
      <BrandingForm />
      <SamplePreview />
    </div>
  );
}
