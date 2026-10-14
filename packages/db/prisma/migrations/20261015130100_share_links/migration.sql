-- CreateTable
CREATE TABLE "share_link" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "record_type" TEXT NOT NULL,
    "record_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,

    CONSTRAINT "share_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_link_open" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "share_link_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "share_link_open_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "share_link_organization_id_record_type_record_id_idx" ON "share_link"("organization_id", "record_type", "record_id");

-- CreateIndex
CREATE UNIQUE INDEX "share_link_organization_id_id_key" ON "share_link"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "share_link_organization_id_token_hash_key" ON "share_link"("organization_id", "token_hash");

-- CreateIndex
CREATE INDEX "share_link_open_organization_id_share_link_id_opened_at_idx" ON "share_link_open"("organization_id", "share_link_id", "opened_at");

-- AddForeignKey
ALTER TABLE "share_link_open" ADD CONSTRAINT "share_link_open_organization_id_share_link_id_fkey" FOREIGN KEY ("organization_id", "share_link_id") REFERENCES "share_link"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('share_link');
SELECT app_enable_org_rls('share_link_open');

-- Token hashes are sha256 in hex; record types read like "issued_document"; labels and user agents stay short.
ALTER TABLE "share_link"
  ADD CONSTRAINT share_link_token_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT share_link_record_type_format CHECK (record_type ~ '^[a-z][a-z_]{1,39}$'),
  ADD CONSTRAINT share_link_label_length CHECK (char_length(label) BETWEEN 1 AND 200);
ALTER TABLE "share_link_open"
  ADD CONSTRAINT share_link_open_user_agent_length CHECK (char_length(user_agent) <= 300);

-- A link is turned off, never edited or deleted: the api and worker may set revoked_at and revoked_by only.
REVOKE UPDATE, DELETE ON TABLE "share_link" FROM app_runtime;
GRANT UPDATE (revoked_at, revoked_by) ON TABLE "share_link" TO app_runtime;

-- Opens are a record of what happened.
REVOKE UPDATE, DELETE ON TABLE "share_link_open" FROM app_runtime;
