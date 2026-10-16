"use client";

// The branding screen (spec 9.3): how the organization's documents look. Its logo at the top, its colour for the title,
// and its terms at the end, each saved on its own, and a sample quotation to see them on.
import { useTranslations } from "next-intl";
import { PageTitle } from "@/components/page-title";
import { BackToSettings } from "./back-to-settings";
import { BrandingForm } from "./branding-form";
import { LogoPanel } from "./logo-panel";
import { SamplePreview } from "./sample-preview";

export function BrandingScreen() {
  const t = useTranslations("documents.branding");
  return (
    <div className="flex max-w-[720px] flex-col gap-8">
      <div className="flex flex-col gap-2">
        <BackToSettings />
        <PageTitle>{t("title")}</PageTitle>
        <p className="max-w-[65ch] text-muted-foreground">{t("intro")}</p>
      </div>
      <LogoPanel />
      <BrandingForm />
      <SamplePreview />
    </div>
  );
}
