// What each kind of shared record opens as at /p/<token> (spec 9.3). The Foundation shares issued documents: the link
// redirects to a short-lived download of the document's PDF.
import type { Database } from "@travel-crm/db";
import { getIssuedDocument } from "@travel-crm/domain/documents";
import type { Files } from "@travel-crm/domain/files";
import { DomainError } from "@travel-crm/domain/kernel";
import type { ShareLinkResolver } from "./share-link-route.js";

export interface ShareLinkResolverDependencies {
  db: Pick<Database, "forOrg">;
  files: Pick<Files, "systemDownloadLink">;
}

export function shareLinkResolvers({ db, files }: ShareLinkResolverDependencies): Record<string, ShareLinkResolver> {
  return {
    issued_document: async (opened) => {
      const document = await db.forOrg(opened.organizationId, (tx) =>
        getIssuedDocument(tx, { documentId: opened.recordId }),
      );
      // The worker renders the PDF moments after issuing; a customer this quick is asked to try again shortly.
      if (document.pdfAttachmentId === null) {
        throw new DomainError("NOT_FOUND", "DOCUMENT_NOT_READY", "The document is still being prepared");
      }
      const link = await files.systemDownloadLink(opened.organizationId, { attachmentId: document.pdfAttachmentId });
      return Response.redirect(link.url, 302);
    },
  };
}
