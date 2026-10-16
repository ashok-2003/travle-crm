# documents

Numbered documents whose PDF is rendered once and kept (spec 9.3). The Foundation ships one template, `sample`;
quotes and invoices bring theirs.

## Public functions and values (`index.ts`)

- `issueDocument(tx, actor, { template, content, branding, prefix? }, now?)`: in the caller's transaction, checks the
  input against the contract (`VALIDATION`/`INVALID_DOCUMENT`), numbers the document (`DOC-2026-0001`, or the caller's
  prefix; the year counted in the organization's own time zone, read from the organization), freezes the checked,
  trimmed content and branding with that number and the printed date, publishes `document.issued`, and records
  `document.issued` in the audit log (the document's id and number, never its content). `now` is the one issue time:
  it is the document's `issued_at` and gives the printed date. Refuses text the PDF fonts can't show
  (`VALIDATION`/`UNPRINTABLE_CHARACTERS`) before using a number. Callers check the actor may issue it.
- `getIssuedDocument(tx, { documentId })`: the document's summary, with `pdfAttachmentId` (null until rendered) and
  `renderFailed`.
  Another organization's document is `NOT_FOUND`/`DOCUMENT_NOT_FOUND`.
- `listIssuedDocuments(tx, { cursor?, limit? })`: the organization's documents, newest issued first, `limit` (1-50,
  20 unless given) at a time, with `nextCursor` for the page after (`VALIDATION`/`INVALID_PAGE` for a page it can't
  read); a cursor the organization can't see starts an empty page.
- `renderIssuedDocumentListener({ files, render })`: the worker's listener `documents.render-pdf`. Pass the files
  module (it stores the PDF and reads the logo) and `renderPdf` from `@travel-crm/integrations/pdf`.
- `sampleQuotation({ recipient, supplierStateCode, placeOfSupplyStateCode, lines, branding, notes? })`: the sample
  template's content as a quotation, its GST worked out by the kernel's `indiaGst` and every amount printed with
  `formatMoney`, ready for `issueDocument`.
- `brandedSampleQuotation({ organizationName, profile, logoAttachmentId? })`: the sample an organization previews its
  branding on: made-up lines taxed within its own GST state, its name, colour, terms and logo. Issue it with
  `prefix: SAMPLE_PREFIX` (`"SMPL"`, which no invoice prefix may be): it is kept like any document, and its number
  says it is a sample. Call `assertMayIssueSample(tx, now?)` first: at most `SAMPLES_PER_DAY` (50, the contracts'
  figure, which the refusal's sentence states) in any 24 hours (`LIMIT_REACHED`/`SAMPLE_LIMIT_REACHED`), as each is
  kept for good with its PDF.

- `documentsIssuedSince(tx, since)`: a usage counter for the platform dashboard, samples left out (previews, not use).
  It counts the transaction's organization by row-level security, so it runs in `forOrg` or `asOrganization` and
  refuses the platform role (`RangeError`).

## Events

- Publishes `document.issued` with `{ documentId }`.
- Listens to `document.issued` (`documents.render-pdf`): renders the frozen content with the logo its branding names,
  stores the PDF as an attachment of the document (record type `issued_document`, file name `<number>.pdf`) and
  records it on the document.

## Rules worth knowing

- What was issued never changes: the runtime role may only set `pdf_attachment_id`, `rendered_at` and
  `render_failure`, and can't delete a document (money documents are cancelled or credited, never deleted; spec 5).
- An issued document keeps the customer's details as issued, through an erasure too: a GST invoice and its like must
  be kept by law, and DPDP allows retention a law requires. The platform's erasure refuses an `issued_document`
  (`VALIDATION`/`KEPT_BY_LAW`, ADR 0023); only a purge of the whole organization deletes one, with its PDF.
- A document is rendered once. Its PDF's attachment id (`pdf_file_id`) is chosen when it is issued, and the listener
  always stores into it: a rerun, two overlapping deliveries, or a crash between storing and marking all end in the
  same attachment, and a document that has its PDF is never rendered again.
- Text the fonts can't show is a permanent failure: the listener records `render_failure` (code points only) and
  finishes without retrying; the summary shows `renderFailed`. Nothing recovers such a document yet: after a renderer
  fix, the platform must clear `render_failure` and publish a new `document.issued`, and no code does that. Any other renderer error is rethrown, so the job is retried.
- The frozen branding names the organization's logo by its attachment id (`logoAttachmentId`, an `organization_logo`
  attachment whose record is the organization); the worker reads its bytes when it renders, through the files
  module's `systemFile`, and draws them as the image they are (PNG or JPEG by their signature). An id that names any
  other file is never read, so a passport scan can't be printed; a logo removed before the render, whose bytes
  aren't a PNG or JPEG png-js reads as its headers say, whose header claims more than 4096 pixels a side or 16
  megapixels (`isLogoSizeAllowed`: pdfkit would inflate every pixel, and a 1 MB file can claim gigabytes of them), or
  whose pixel data inflates to more than that header's rows or has a row whose filter type png-js doesn't know
  (`pixelDataFitsHeader`; png-js would throw where nothing catches it) is left out and the document still renders.
  `assertUsableLogo(body, declaredType)` is the same check for the logo's upload, which `confirmUpload` awaits
  (`VALIDATION`/`UPLOAD_DOES_NOT_MATCH`, `VALIDATION`/`LOGO_TOO_LARGE`).
