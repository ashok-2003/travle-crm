"use client";

// The button that downloads one document's PDF, named for the document so a list of them reads well aloud.
import type { IssuedDocumentSummary } from "@travel-crm/contracts/documents";
import { DownloadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useDownloadPdf } from "./use-download-pdf";

export function DownloadPdfButton({ document }: { document: IssuedDocumentSummary }) {
  const t = useTranslations("documents.download");
  const download = useDownloadPdf();
  return (
    <Button
      variant="outline"
      aria-label={t("named", { number: document.number })}
      disabled={download.isPending}
      onClick={() => {
        download.mutate(document.id);
      }}
    >
      <DownloadIcon aria-hidden="true" />
      {t("label")}
    </Button>
  );
}
