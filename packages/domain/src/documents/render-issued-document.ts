// The worker's listener that renders an issued document's PDF (spec 9.3): from the frozen content and branding, with
// the organization's logo read from storage, once, stored as the document's attachment. Reading, rendering and storing
// happen outside any transaction: they are slow.
import { documentIssuedEvent, issuedDocumentRenderInput, pdfTemplate } from "@travel-crm/contracts/documents";
import { ownMessage } from "@travel-crm/integrations/jobs";
import { characterLabel, type PdfInput, type PdfTemplate } from "@travel-crm/integrations/pdf";
import type { Files } from "../files/index.js";
import { defineListener, type EventListener } from "../jobs/index.js";
import { documentLogo } from "./document-logo.js";

export interface RenderIssuedDocumentDependencies {
  /** Stores the PDF, and reads the logo the document's branding names. */
  files: Pick<Files, "storeGeneratedFile" | "systemFile">;
  /** renderPdf from @travel-crm/integrations/pdf; the domain never imports React-PDF itself. */
  render: (template: PdfTemplate, input: PdfInput) => Promise<Uint8Array>;
}

/** What the renderer throws for text no font can show: permanent, since the same document fails every time. */
function unprintableCodePoints(error: unknown): string[] | null {
  if (!(error instanceof Error) || (error as { code?: unknown }).code !== "UNPRINTABLE_TEXT") return null;
  const characters: unknown = (error as { characters?: unknown }).characters;
  if (!Array.isArray(characters)) return [];
  return characters.filter((character): character is string => typeof character === "string").map(characterLabel);
}

/**
 * Safe to run any number of times, also at once: the PDF is stored under the id chosen when the document was issued,
 * so every run ends in the same attachment, and marking the document is a no-op once it has been marked.
 */
export function renderIssuedDocumentListener({ files, render }: RenderIssuedDocumentDependencies): EventListener {
  return defineListener({
    name: "documents.render-pdf",
    eventType: "document.issued",
    payload: documentIssuedEvent,
    handle: async (event, context) => {
      const { documentId } = event.payload;
      const document = await context.forOrg((tx) => tx.issuedDocument.findUnique({ where: { id: documentId } }));
      // The event commits with its document, so a missing one is a fault: fail, and the job is retried, then listed.
      if (!document) throw ownMessage(new Error(`Issued document ${documentId} not found in its event's organization`));
      // Never regenerated: once a document has its PDF, every later run leaves it alone. One that can never be
      // rendered is left alone too.
      if (document.pdfAttachmentId !== null || document.renderFailure !== null) return;

      const { data, branding } = issuedDocumentRenderInput.parse(document.renderInput);
      const { logoAttachmentId, ...printed } = branding;
      const logo = await documentLogo(files, event.organizationId, logoAttachmentId);
      let pdf: Uint8Array;
      try {
        pdf = await render(pdfTemplate.parse(document.template), {
          data,
          branding: logo === undefined ? printed : { ...printed, logo },
          issuedAt: document.issuedAt,
        });
      } catch (error) {
        const codePoints = unprintableCodePoints(error);
        if (codePoints === null) throw error;
        // Retrying can't help: record it on the document (code points only, no customer text) and finish the job.
        await context.forOrg((tx) =>
          tx.issuedDocument.updateMany({
            where: { id: document.id, pdfAttachmentId: null },
            data: {
              renderFailure:
                codePoints.length === 0 ? "UNPRINTABLE_TEXT" : `UNPRINTABLE_TEXT: ${codePoints.join(", ")}`,
            },
          }),
        );
        return;
      }
      const attachment = await files.storeGeneratedFile(context.actor, {
        recordType: "issued_document",
        recordId: document.id,
        fileName: `${document.number}.pdf`,
        contentType: "application/pdf",
        body: pdf,
        attachmentId: document.pdfFileId,
      });
      // Runs that overlap all stored into the same attachment; the first to get here marks the document.
      await context.forOrg((tx) =>
        tx.issuedDocument.updateMany({
          where: { id: document.id, pdfAttachmentId: null },
          data: { pdfAttachmentId: attachment.id, renderedAt: new Date() },
        }),
      );
    },
  });
}
