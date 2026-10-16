// Where an issued document's PDF is: ready to download, being prepared by the worker, or never to be made (text its
// fonts can't show). Screens ask again while one is being prepared.
import type { IssuedDocumentSummary } from "@travel-crm/contracts/documents";
import type { StatusTone } from "@/components/status-badge";

export type DocumentState = "ready" | "preparing" | "failed";

/** How often a screen asks again while the worker prepares a PDF: it takes a few seconds. */
export const PREPARING_POLL_MS = 2000;

export function documentState(
  document: Pick<IssuedDocumentSummary, "pdfAttachmentId" | "renderFailed">,
): DocumentState {
  if (document.renderFailed) return "failed";
  return document.pdfAttachmentId === null ? "preparing" : "ready";
}

/** DESIGN.md's status vocabulary: ready is good, being prepared needs a moment, can't be made is bad. */
export const stateTones: Record<DocumentState, StatusTone> = { ready: "good", preparing: "attention", failed: "bad" };
