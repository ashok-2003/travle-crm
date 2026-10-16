// The way back from a settings section to the settings screen, top left as on every screen a list leads to.
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { routes } from "@/lib/routes";

export function BackToSettings() {
  const t = useTranslations("documents");
  return (
    <Link href={routes.settings} className="flex min-h-11 w-fit items-center gap-2 text-primary hover:underline">
      <ArrowLeftIcon aria-hidden="true" className="size-4" />
      {t("backToSettings")}
    </Link>
  );
}
