# documents

Numbered documents whose PDF is rendered once and kept (spec 9.3). The Foundation ships one template, `sample`;
quotes and invoices bring theirs.

## Public functions and values (`index.ts`)

- `issueDocument(tx, actor, { template, content, branding, timeZone, prefix? }, now?)`: in the caller's transaction,
  numbers the document (`DOC-2026-0001`, or the caller's prefix; the year counted in `timeZone`), freezes its content
  and branding with that number and the printed date, and publishes `document.issued`. `now` is the one issue time: it
  is the document's `issued_at` and gives the printed date. Refuses text the PDF fonts can't show
  (`VALIDATION`/`UNPRINTABLE_CHARACTERS`) before using a number. Callers check the actor may issue it.
- `getIssuedDocument(tx, { documentId })`: the document's summary, with `pdfAttachmentId` (null until rendered).
  Another organization's document is `NOT_FOUND`/`DOCUMENT_NOT_FOUND`.
- `renderIssuedDocumentListener({ files, render })`: the worker's listener `documents.render-pdf`. Pass the files
  module and `renderPdf` from `@travel-crm/integrations/pdf`.

## Events

- Publishes `document.issued` with `{ documentId }`.
- Listens to `document.issued` (`documents.render-pdf`): renders the frozen content, stores the PDF as an attachment of
  the document (record type `issued_document`, file name `<number>.pdf`) and records it on the document.

## Rules worth knowing

- What was issued never changes: the runtime role may only set `pdf_attachment_id`, `rendered_at` and
  `render_failure`, and can't delete a document (money documents are cancelled or credited, never deleted; spec 5).
- A document is rendered once. Its PDF's attachment id (`pdf_file_id`) is chosen when it is issued, and the listener
  always stores into it: a rerun, two overlapping deliveries, or a crash between storing and marking all end in the
  same attachment, and a document that has its PDF is never rendered again.
- Text the fonts can't show is a permanent failure: the listener records `render_failure` (code points only) and
  finishes without retrying. Any other renderer error is rethrown, so the job is retried.
- The organization's logo isn't in the frozen branding yet: it joins with plan 4's branding settings.
