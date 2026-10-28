// What each kind of shared record opens as at /p/<token> (spec 9.3): an issued document redirects to a short-lived download
// of its PDF; a quote opens as its page (quote-page.ts), where the customer pays by UPI and accepts it.
import type { Database } from "@travel-crm/db";
import { assertPdfCanBeMade, getIssuedDocument } from "@travel-crm/domain/documents";
import type { Files } from "@travel-crm/domain/files";
import type { Identity } from "@travel-crm/domain/identity";
import { acceptQuoteFromLink, publicQuoteOf, QUOTE_RECORD_TYPE } from "@travel-crm/domain/quotes";
import { quotePage } from "./quote-page.js";
import { DomainError, isUuid } from "@travel-crm/domain/kernel";
import type { ShareLinkAction, ShareLinkResolver } from "./share-link-route.js";

export interface ShareLinkResolverDependencies {
  db: Pick<Database, "forOrg">;
  files: Pick<Files, "systemDownloadLink">;
  identity: Pick<Identity, "organizationProfile">;
}

const agencyNameOf = async (identity: ShareLinkResolverDependencies["identity"], organizationId: string) =>
  (await identity.organizationProfile(organizationId))?.name ?? "Your travel agency";

export function shareLinkResolvers({
  db,
  files,
  identity,
}: ShareLinkResolverDependencies): Record<string, ShareLinkResolver> {
  return {
    [QUOTE_RECORD_TYPE]: async (opened, notice) => {
      const quote = await db.forOrg(opened.organizationId, (tx) => publicQuoteOf(tx, opened.recordId));
      return quotePage(quote, await agencyNameOf(identity, opened.organizationId), notice);
    },
    issued_document: async (opened) => {
      const document = await db.forOrg(opened.organizationId, (tx) =>
        getIssuedDocument(tx, { documentId: opened.recordId }),
      );
      // A PDF that can never be rendered isn't coming: say so, rather than asking the customer to retry for ever.
      assertPdfCanBeMade(document);
      // The worker renders the PDF moments after issuing; a customer this quick is asked to try again shortly.
      if (document.pdfAttachmentId === null) {
        throw new DomainError("NOT_FOUND", "DOCUMENT_NOT_READY", "The document is still being prepared");
      }
      const link = await files.systemDownloadLink(opened.organizationId, { attachmentId: document.pdfAttachmentId });
      return Response.redirect(link.url, 302);
    },
  };
}

/** What a customer may do on a shared record's page: accept a quote, naming themselves. */
export function shareLinkActions({ db }: Pick<ShareLinkResolverDependencies, "db">): Record<string, ShareLinkAction> {
  return {
    [QUOTE_RECORD_TYPE]: async (opened, form) => {
      if (form.agree !== "yes") return;
      await db.forOrg(opened.organizationId, (tx) =>
        acceptQuoteFromLink(
          tx,
          {
            organizationId: opened.organizationId,
            quoteId: opened.recordId,
            name: form.name ?? "",
            // Only an id is looked up: anything else the form sends means the opened quote.
            optionId: form.option !== undefined && isUuid(form.option) ? form.option : undefined,
          },
          new Date(),
        ),
      );
      return "accepted";
    },
  };
}
