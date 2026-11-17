// A small violet sparkle after a lead's name in the Leads list: the AI filled in some of this lead's details.
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

export function AiFilledMark(): ReactElement {
  const t = useTranslations("leads.list");
  return <SparklesIcon role="img" aria-label={t("aiFilled")} className="size-4 text-people-tint-ink" />;
}
