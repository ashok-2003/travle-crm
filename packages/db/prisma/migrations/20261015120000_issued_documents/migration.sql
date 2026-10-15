-- CreateTable
CREATE TABLE "issued_document" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "template" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "render_input" JSONB NOT NULL,
    "issued_by" UUID,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdf_file_id" UUID NOT NULL,
    "pdf_attachment_id" UUID,
    "rendered_at" TIMESTAMPTZ(6),
    "render_failure" TEXT,

    CONSTRAINT "issued_document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "issued_document_organization_id_id_key" ON "issued_document"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "issued_document_organization_id_number_key" ON "issued_document"("organization_id", "number");


-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('issued_document');

-- Numbers come from nextDocumentNumber ("DOC-2026-0042"); the frozen input is a JSON object; a PDF and the time it
-- was rendered are set together, and the PDF is the attachment chosen when the document was issued; a document that
-- has its PDF has no render failure.
ALTER TABLE "issued_document"
  ADD CONSTRAINT issued_document_number_format CHECK (number ~ '^[A-Z]{2,5}-[0-9]{4}-[0-9]{4,}$'),
  ADD CONSTRAINT issued_document_render_input_object CHECK (jsonb_typeof(render_input) = 'object'),
  ADD CONSTRAINT issued_document_rendered CHECK ((pdf_attachment_id IS NULL) = (rendered_at IS NULL)),
  ADD CONSTRAINT issued_document_pdf_is_chosen_attachment CHECK (pdf_attachment_id IS NULL OR pdf_attachment_id = pdf_file_id),
  ADD CONSTRAINT issued_document_render_failure CHECK (render_failure IS NULL OR pdf_attachment_id IS NULL);

-- What was issued is never changed or deleted (spec 9.3): the api and worker may only attach the rendered PDF, or
-- record that it can never be rendered.
REVOKE UPDATE, DELETE ON TABLE "issued_document" FROM app_runtime;
GRANT UPDATE (pdf_attachment_id, rendered_at, render_failure) ON TABLE "issued_document" TO app_runtime;
