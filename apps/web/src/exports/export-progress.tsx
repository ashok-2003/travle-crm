"use client";

// An export being made (B41): "Preparing 312 leads…" once the worker has counted them, and how far it has got.
import type { ExportDetail } from "@travel-crm/contracts/exports";
import { useTranslations } from "next-intl";
import { Progress } from "@/components/ui/progress";
import type { RowsWord } from "./export-failure";

export function ExportProgress({ detail, rowsWord }: { detail: ExportDetail | undefined; rowsWord: RowsWord }) {
  const t = useTranslations("exports.dialog");
  const counted = detail !== undefined && detail.rowsTotal > 0;
  const words = counted ? t(`preparing.${rowsWord}`, { count: detail.rowsTotal }) : t("preparingFile");
  return (
    <div className="flex flex-col gap-2">
      <p>{words}</p>
      <Progress value={counted ? Math.round((detail.rowsDone / detail.rowsTotal) * 100) : 0} aria-label={words} />
    </div>
  );
}
