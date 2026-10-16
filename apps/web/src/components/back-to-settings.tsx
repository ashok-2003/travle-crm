"use client";

// The way back from a settings section (business profile, business files, branding, documents, the setup checklist)
// to the settings screen, top left above the title. Left out while the settings screen is shut (a suspended Owner
// reaches Documents and the business files from the locked screen).
import { useTranslations } from "next-intl";
import { routes } from "@/lib/routes";
import { BackLink } from "./text-link";
import { useScreenOpen } from "./use-screen-open";

export function BackToSettings() {
  const t = useTranslations("settings");
  if (!useScreenOpen(routes.settings)) return null;
  return <BackLink href={routes.settings} label={t("title")} />;
}
