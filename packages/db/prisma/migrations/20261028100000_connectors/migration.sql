-- Integrations and the developer panel (release D): website forms and incoming lead links, API keys, outgoing
-- webhooks and their deliveries, connections to other services (Meta lead ads, IndiaMART, WhatsApp) and the receipts
-- that keep a lead from another service from coming in twice.

-- CreateTable
CREATE TABLE "lead_capture" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ(6),

    CONSTRAINT "lead_capture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_key" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_subscription" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secret" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ(6),

    CONSTRAINT "webhook_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "response_status" INTEGER,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ(6),

    CONSTRAINT "webhook_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "credentials" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "last_synced_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_receipt" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "lead_id" UUID,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lead_capture_organization_id_id_key" ON "lead_capture"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_capture_organization_id_token_hash_key" ON "lead_capture"("organization_id", "token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_organization_id_id_key" ON "api_key"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_organization_id_key_hash_key" ON "api_key"("organization_id", "key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_subscription_organization_id_id_key" ON "webhook_subscription"("organization_id", "id");

-- CreateIndex
CREATE INDEX "webhook_delivery_latest" ON "webhook_delivery"("organization_id", "subscription_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_delivery_organization_id_id_key" ON "webhook_delivery"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_delivery_organization_id_subscription_id_event_id_key" ON "webhook_delivery"("organization_id", "subscription_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "connection_organization_id_id_key" ON "connection"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "connection_organization_id_provider_external_id_key" ON "connection"("organization_id", "provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_receipt_organization_id_id_key" ON "lead_receipt"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_receipt_organization_id_provider_external_id_key" ON "lead_receipt"("organization_id", "provider", "external_id");

-- AddForeignKey
ALTER TABLE "lead_capture" ADD CONSTRAINT "lead_capture_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "webhook_subscription" ADD CONSTRAINT "webhook_subscription_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "webhook_delivery" ADD CONSTRAINT "webhook_delivery_organization_id_subscription_id_fkey" FOREIGN KEY ("organization_id", "subscription_id") REFERENCES "webhook_subscription"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "connection" ADD CONSTRAINT "connection_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_receipt" ADD CONSTRAINT "lead_receipt_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Row-level security: each organization sees only its own.
SELECT app_enable_org_rls('lead_capture');
SELECT app_enable_org_rls('api_key');
SELECT app_enable_org_rls('webhook_subscription');
SELECT app_enable_org_rls('webhook_delivery');
SELECT app_enable_org_rls('connection');
SELECT app_enable_org_rls('lead_receipt');

ALTER TABLE "lead_capture"
  ADD CONSTRAINT lead_capture_kind_value CHECK (kind IN ('form', 'link')),
  ADD CONSTRAINT lead_capture_name_length CHECK (char_length(name) BETWEEN 1 AND 120);

ALTER TABLE "api_key"
  ADD CONSTRAINT api_key_name_length CHECK (char_length(name) BETWEEN 1 AND 120);

ALTER TABLE "webhook_subscription"
  ADD CONSTRAINT webhook_subscription_url_https CHECK (url LIKE 'https://%' AND char_length(url) <= 2000);

ALTER TABLE "webhook_delivery"
  ADD CONSTRAINT webhook_delivery_status_value CHECK (status IN ('pending', 'delivered', 'failed'));

ALTER TABLE "connection"
  ADD CONSTRAINT connection_provider_value CHECK (provider IN ('meta_lead_ads', 'indiamart', 'whatsapp')),
  ADD CONSTRAINT connection_status_value CHECK (status IN ('connected', 'needs_attention', 'disconnected'));

-- IndiaMART's enquiries are a lead source of their own.
ALTER TABLE "lead" DROP CONSTRAINT lead_source_value, ADD CONSTRAINT lead_source_value CHECK (source IN (
  'phone_call', 'walk_in', 'referral', 'instagram', 'facebook', 'website', 'other',
  'google_sheet', 'bulk_upload', 'web_form', 'integration', 'meta_lead_ad', 'whatsapp', 'package_page', 'indiamart'));
ALTER TABLE "lead_enquiry" DROP CONSTRAINT lead_enquiry_source_value, ADD CONSTRAINT lead_enquiry_source_value CHECK (
  source IN (
    'phone_call', 'walk_in', 'referral', 'instagram', 'facebook', 'website', 'other',
    'google_sheet', 'bulk_upload', 'web_form', 'integration', 'meta_lead_ad', 'whatsapp', 'package_page', 'indiamart'));

-- The organization a service's own id belongs to (a Meta page, a WhatsApp number), for that service's webhooks, which
-- name only their own ids. It returns an organization id alone, never a credential; the webhook's work then runs in
-- db.forOrg() as usual. SECURITY DEFINER: it runs as its owner, the migrator, past row-level security.
CREATE FUNCTION app_connection_organization(connection_provider text, connection_external_id text)
RETURNS uuid
LANGUAGE sql STABLE STRICT SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT organization_id
  FROM connection
  WHERE provider = connection_provider AND external_id = connection_external_id AND status <> 'disconnected'
  ORDER BY created_at DESC
  LIMIT 1
$$;

-- The connections of one service a scheduled check visits (IndiaMART's polling): ids alone, across organizations.
CREATE FUNCTION app_connections_to_check(connection_provider text)
RETURNS TABLE (organization_id uuid, connection_id uuid)
LANGUAGE sql STABLE STRICT SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT organization_id, id
  FROM connection
  WHERE provider = connection_provider AND status <> 'disconnected'
  ORDER BY last_synced_at NULLS FIRST
  LIMIT 1000
$$;

-- Only the api and worker call them.
REVOKE ALL ON FUNCTION app_connection_organization(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_connection_organization(text, text) TO app_runtime;
REVOKE ALL ON FUNCTION app_connections_to_check(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_connections_to_check(text) TO app_runtime;
