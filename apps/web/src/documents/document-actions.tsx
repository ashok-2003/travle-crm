"use client";

// What can be done with one issued document from the list: download its PDF once the worker has made it.
import type { IssuedDocumentSummary } from "@travel-crm/contracts/documents";
import { documentState } from "./document-state";
import { DownloadPdfButton } from "./download-pdf-button";

export function DocumentActions({ document }: { document: IssuedDocumentSummary }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {documentState(document) === "ready" && <DownloadPdfButton document={document} />}
    </div>
  );
}
