// The way back from a settings section (branding, documents) to the settings screen.
import { useTranslations } from "next-intl";
import { routes } from "@/lib/routes";
import { BackLink } from "./text-link";

export function BackToSettings() {
  const t = useTranslations("settings");
  return <BackLink href={routes.settings} label={t("title")} />;
}
