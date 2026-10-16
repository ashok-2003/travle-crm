"use client";

// The button that downloads one document's PDF, named for the document so a list of them reads well aloud. An export:
// a suspended organization's Owner may still take the PDFs (ADR 0021).
import type { IssuedDocumentSummary } from "@travel-crm/contracts/documents";
import { DownloadIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useWriteAccess } from "@/subscription/write-access";
import { useDownloadPdf } from "./use-download-pdf";

export function DownloadPdfButton({ document }: { document: IssuedDocumentSummary }) {
  const t = useTranslations("documents.download");
  const download = useDownloadPdf();
  const take = useWriteAccess("export");
  return (
    <Button
      variant="outline"
      aria-label={t("named", { number: document.number })}
      disabled={!take.allowed || download.isPending}
      onClick={() => {
        download.mutate(document.id);
      }}
    >
      <DownloadIcon aria-hidden="true" />
      {t("label")}
    </Button>
  );
}
