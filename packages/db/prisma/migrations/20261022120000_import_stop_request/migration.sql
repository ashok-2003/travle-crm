-- Stop never waits behind the add (X7): the add holds its import's row for a whole batch of rows, so Stop no longer
-- updates that row. It adds a stop request beside it, whose key on the import only key-shares the held row, and the
-- add reads it at its next batch. A stop already asked for moves across; the column goes.

-- CreateTable
CREATE TABLE "import_stop_request" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_stop_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "import_stop_request_organization_id_id_key" ON "import_stop_request"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "import_stop_request_batch" ON "import_stop_request"("organization_id", "batch_id");

-- AddForeignKey
ALTER TABLE "import_stop_request" ADD CONSTRAINT "import_stop_request_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "import_stop_request" ADD CONSTRAINT "import_stop_request_organization_id_batch_id_fkey" FOREIGN KEY ("organization_id", "batch_id") REFERENCES "import_batch"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

INSERT INTO "import_stop_request" ("organization_id", "id", "batch_id")
SELECT "organization_id", uuidv7(), "id" FROM "import_batch" WHERE "stop_requested";

-- AlterTable
ALTER TABLE "import_batch" DROP COLUMN "stop_requested";

-- Asked for once, and kept: the runtime role adds a stop request and reads it, never changes or deletes one.
REVOKE UPDATE, DELETE ON TABLE "import_stop_request" FROM app_runtime;

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('import_stop_request');
