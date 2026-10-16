"use client";

// What can be done with one issued document from the list, once the worker has made its PDF: download it, and share
// it by link. Not before: a customer opening a link at once would only be told it is still being prepared.
import type { IssuedDocumentSummary } from "@travel-crm/contracts/documents";
import { Share2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { documentState } from "./document-state";
import { DownloadPdfButton } from "./download-pdf-button";
import { ShareLinksDialog } from "./share-links-dialog";

export function DocumentActions({ document }: { document: IssuedDocumentSummary }) {
  const t = useTranslations("documents.share");
  const [sharing, setSharing] = useState(false);
  const state = documentState(document);
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {state === "ready" && (
        <>
          <DownloadPdfButton document={document} />
          <Button
            variant="outline"
            aria-label={t("openNamed", { number: document.number })}
            onClick={() => {
              setSharing(true);
            }}
          >
            <Share2Icon aria-hidden="true" />
            {t("open")}
          </Button>
          <ShareLinksDialog document={document} open={sharing} onOpenChange={setSharing} />
        </>
      )}
    </div>
  );
}
