-- CreateTable
CREATE TABLE "sheets_key_check" (
    "id" UUID NOT NULL,
    "singleton" BOOLEAN NOT NULL DEFAULT true,
    "check_value" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sheets_key_check_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sheets_key_check_singleton_key" ON "sheets_key_check"("singleton");


-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- One row at most, holding an HMAC-SHA256 (32 bytes). The table has no organization_id and no row-level security (an
-- explicit, reviewed exemption: it holds a keyed hash of a constant and nothing of anyone); only the api's
-- sheets-key-check.ts reaches it, in db.withoutOrg(), through @travel-crm/db/sheets-key-check.
ALTER TABLE "sheets_key_check"
  ADD CONSTRAINT sheets_key_check_singleton CHECK (singleton),
  ADD CONSTRAINT sheets_key_check_value_length CHECK (octet_length(check_value) = 32);

-- The api, the worker and the console read it and the first one writes it; nobody changes or deletes it, and the
-- platform role has no business with it.
REVOKE UPDATE, DELETE ON TABLE "sheets_key_check" FROM app_runtime;
REVOKE ALL ON TABLE "sheets_key_check" FROM app_platform;
