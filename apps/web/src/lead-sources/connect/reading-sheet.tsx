// "Reading your sheet…" while the worker reads a sheet's rows, which takes a moment for a long one (S14).
import { LoaderCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";

export function ReadingSheet() {
  const t = useTranslations("sheets.connect.existing");
  return (
    <div role="status" className="flex items-center gap-3">
      <LoaderCircleIcon aria-hidden="true" className="size-5 motion-safe:animate-spin" />
      <div>
        <p>{t("reading")}</p>
        <p className="text-label text-muted-foreground">{t("readingWait")}</p>
      </div>
    </div>
  );
}
