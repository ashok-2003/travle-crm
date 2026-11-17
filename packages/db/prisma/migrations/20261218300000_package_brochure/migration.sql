-- A package's brochures get an owner-written name and description (one row per described brochure; none means "not described yet").
-- It only adds a table. There is deliberately no key to attachment: the purge and file sweeps delete attachments on their own,
-- and a row whose file is gone is never read, since reads start from the ready attachments. Plain data, deleted for real.
CREATE TABLE "package_brochure" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "attachment_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "package_brochure_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "package_brochure_name_length" CHECK (char_length("name") BETWEEN 1 AND 80),
    CONSTRAINT "package_brochure_description_length" CHECK (char_length("description") <= 300)
);

CREATE INDEX "package_brochure_by_package" ON "package_brochure"("organization_id", "package_id");
CREATE UNIQUE INDEX "package_brochure_organization_id_id_key" ON "package_brochure"("organization_id", "id");
CREATE UNIQUE INDEX "package_brochure_organization_id_attachment_id_key" ON "package_brochure"("organization_id", "attachment_id");

ALTER TABLE "package_brochure" ADD CONSTRAINT "package_brochure_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "package_brochure" ADD CONSTRAINT "package_brochure_organization_id_package_id_fkey" FOREIGN KEY ("organization_id", "package_id") REFERENCES "quote_template"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

SELECT app_enable_org_rls('package_brochure');
