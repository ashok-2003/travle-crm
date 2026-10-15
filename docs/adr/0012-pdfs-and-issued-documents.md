# 0012: PDFs and issued documents

Date: 2026-10-15 · Status: accepted · Implements spec section 9.3 (PDFs; share links are ADR 0013)

## Decision

- **React-PDF renders in the worker**, behind `@travel-crm/integrations/pdf`: `renderPdf(template, { data, branding,
issuedAt })` returns the PDF's bytes. Templates are plain functions that build React-PDF elements; the Foundation
  ships `sample` (a title, recipient, rows with amounts, totals, notes and the organization's terms).
- **The bytes depend only on the input.** `issuedAt` is required and becomes the file's creation and modification
  date, so rendering one document twice gives identical files.
- **The brand's three fonts are embedded**: EB Garamond for titles, Figtree for text, IBM Plex Mono for numbers and
  amounts, from the pinned `@fontsource` packages. Each family is registered twice: the "latin" file has the digits
  but not ₹, the "latin-ext" file has ₹ but no digits, and styles name both, so each character comes from the file
  that has it.
- **Fonts are unpacked from WOFF to TrueType before React-PDF sees them** (`woff.ts`). fontkit 2.0.4 overruns a WOFF
  table when a font ends with an empty glyph (IBM Plex Mono's space) and can't subset WOFF2 at all.
- **Text the fonts can't show is refused, not printed.** React-PDF draws a character no font has (Devanagari, Tamil,
  emoji) as other letters, so "होटल" would print as "9K2". `issueDocument` refuses such text with
  `VALIDATION`/`UNPRINTABLE_CHARACTERS` before using a number, and `renderPdf` refuses it too, with
  `UnprintableTextError` (`code` "UNPRINTABLE_TEXT", permanent). The printable set is what every font has and what
  reads back from the PDF as itself (`printable-text.ts`; a test renders each character).
- **Templates take formatted text.** Amounts and dates arrive as strings (`₹12,50,000.00`, `15 Oct 2026`); templates
  know no money or date rules. An amount never breaks across lines, and words are never hyphenated.
- **An issued document is frozen.** `issued_document.render_input` holds its content and branding with the number and
  printed date, exactly as issued. The runtime role may only set `pdf_attachment_id`, `rendered_at` and
  `render_failure`; it can't change or delete the rest.
- **Rendered once, never regenerated.** `issueDocument` publishes `document.issued` in the caller's transaction; the
  listener `documents.render-pdf` renders from the frozen input and stores the PDF through the files module as an
  attachment of the document. The attachment's id (`pdf_file_id`) is chosen when the document is issued and the
  listener always passes it, so listeners that run more than once, or at once, store one file: the files module
  returns the attachment that is already there. Marking the document (`updateMany ... where pdfAttachmentId is null`)
  is then a no-op for every run but the first. A run that finds the attachment still pending, because another run is
  mid-way, can rewrite the stored object with identical bytes; that relies on rendering being deterministic, which is
  pinned within one build. The remaining risk is a rolling deploy that changes fonts between two runs of one document.
- **A document that can never render is marked, not retried.** `render_failure` records the code and the refused code
  points (no customer text) and the job finishes; any other error is thrown and retried with backoff.
- **Numbers per organization and year**, from `nextDocumentNumber` (`DOC-2026-0001`, or a module's own prefix), with
  the year and the printed date counted in the organization's own time zone, read when issuing: 00:30 on 1 January in Kolkata is 2027. The
  one issue time is also the document's `issued_at` and the PDF's date.

## Context

- **Why the worker renders.** A PDF takes tens of milliseconds to seconds and needs fonts in memory; requests stay fast
  and a failure is retried with backoff instead of failing the person's action.
- **Why freeze the input instead of the PDF alone.** The PDF is the record, but if rendering fails (or a font bug
  appears) the document can still be rendered from exactly what was issued, never from records edited since.
- **Why not Devanagari now.** Indian agencies will want Hindi and regional scripts on documents. That needs a font per
  script and React-PDF's text shaping checked for conjuncts; until then refusing is honest, and printing wrong
  letters on a customer's quotation is not.

## Consequences

- `issued_document (organization_id, pdf_attachment_id)` refers to `attachment (organization_id, id)`. The key came
  in plan 3's Integration task, with every plan 3 table's organization key, because the attachment model's
  back-relation lives in the files module's schema file.
- The organization's logo joins the frozen branding when plan 4 stores branding settings; the renderer already draws
  one (PNG or JPEG).
- The PDF can't be removed or replaced through the generic Files API, which would leave the document without it or
  with another file: the files module treats `issued_document` as a system-owned record type, and `requestUpload` and
  `remove` refuse its files to everyone (`FORBIDDEN`/`SYSTEM_OWNED_FILE`). Only `storeGeneratedFile` writes them.
- A document whose PDF can never be rendered (`render_failure`) opens at its share link as a page saying it can't be
  shown (404, no `Retry-After`), not as "still being prepared".
- A new template is a new function in `templates/`, a value in the `pdfTemplate` contract, and its own content schema.
