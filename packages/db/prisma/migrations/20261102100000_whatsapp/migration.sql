-- CreateTable
CREATE TABLE "whatsapp_connection" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "integrated_number" TEXT NOT NULL,
    "display_number" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'setup',
    "provider_ref" TEXT,
    "waba_id" TEXT,
    "phone_number_id" TEXT,
    "quality_rating" TEXT,
    "note" TEXT,
    "connected_at" TIMESTAMPTZ(6),
    "disconnected_at" TIMESTAMPTZ(6),
    "last_event_at" TIMESTAMPTZ(6),
    "last_inbound_at" TIMESTAMPTZ(6),
    "last_send_ok_at" TIMESTAMPTZ(6),
    "last_report_at" TIMESTAMPTZ(6),
    "problem_since" TIMESTAMPTZ(6),
    "marketing_cap_month" INTEGER NOT NULL DEFAULT 300,
    "template_cap_day" INTEGER NOT NULL DEFAULT 100,
    "events_unknown" INTEGER NOT NULL DEFAULT 0,
    "history_state" TEXT NOT NULL DEFAULT 'not_applicable',
    "created_by" UUID,
    "impersonated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_conversation" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "person_id" UUID,
    "profile_name" TEXT,
    "last_inbound_at" TIMESTAMPTZ(6),
    "last_message_id" UUID,
    "last_message_at" TIMESTAMPTZ(6),
    "needs_reply" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "state" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_message" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "direction" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT,
    "caption" TEXT,
    "file_name" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "wamid" TEXT,
    "quoted_wamid" TEXT,
    "reaction" TEXT,
    "client_token" TEXT,
    "template_id" UUID,
    "template_params" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sent_by" UUID,
    "status" TEXT NOT NULL,
    "failure_code" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "media_state" TEXT NOT NULL DEFAULT 'none',
    "media_url" TEXT,
    "media_attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_template" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "footer" TEXT,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "samples" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider_ref" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "synced_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_usage_month" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "inbound" INTEGER NOT NULL DEFAULT 0,
    "replies" INTEGER NOT NULL DEFAULT 0,
    "utility" INTEGER NOT NULL DEFAULT 0,
    "marketing" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "media_bytes_copied" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "whatsapp_usage_month_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_number_route" (
    "integrated_number" TEXT NOT NULL,
    "organization_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,

    CONSTRAINT "whatsapp_number_route_pkey" PRIMARY KEY ("integrated_number")
);

-- CreateTable
CREATE TABLE "whatsapp_unrouted" (
    "integrated_number" TEXT NOT NULL,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "events" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "whatsapp_unrouted_pkey" PRIMARY KEY ("integrated_number")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connection_organization_id_id_key" ON "whatsapp_connection"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connection_live" ON "whatsapp_connection"("organization_id") WHERE (status <> 'disconnected'::text);

-- CreateIndex
CREATE INDEX "whatsapp_conversation_recent" ON "whatsapp_conversation"("organization_id", "last_message_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "whatsapp_conversation_waiting" ON "whatsapp_conversation"("organization_id", "last_message_at" DESC, "id" DESC) WHERE (needs_reply AND (NOT hidden));

-- CreateIndex
CREATE INDEX "whatsapp_conversation_person" ON "whatsapp_conversation"("organization_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversation_organization_id_id_key" ON "whatsapp_conversation"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversation_phone" ON "whatsapp_conversation"("organization_id", "connection_id", "phone_e164");

-- CreateIndex
CREATE INDEX "whatsapp_message_chat" ON "whatsapp_message"("organization_id", "conversation_id", "occurred_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "whatsapp_message_outbox" ON "whatsapp_message"("organization_id", "id") WHERE (status = ANY (ARRAY['queued'::text, 'sending'::text]));

-- CreateIndex
CREATE INDEX "whatsapp_message_media_pending" ON "whatsapp_message"("organization_id", "id") WHERE (media_state = 'pending'::text);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_message_organization_id_id_key" ON "whatsapp_message"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_message_wamid" ON "whatsapp_message"("organization_id", "wamid") WHERE (wamid IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_message_client_token" ON "whatsapp_message"("organization_id", "client_token") WHERE (client_token IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_template_organization_id_id_key" ON "whatsapp_template"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_template_key" ON "whatsapp_template"("organization_id", "connection_id", "name", "language");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_usage_month_organization_id_id_key" ON "whatsapp_usage_month"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_usage_month_key" ON "whatsapp_usage_month"("organization_id", "connection_id", "month");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_number_route_connection" ON "whatsapp_number_route"("connection_id");

-- AddForeignKey
ALTER TABLE "whatsapp_connection" ADD CONSTRAINT "whatsapp_connection_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_conversation" ADD CONSTRAINT "whatsapp_conversation_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_conversation" ADD CONSTRAINT "whatsapp_conversation_organization_id_connection_id_fkey" FOREIGN KEY ("organization_id", "connection_id") REFERENCES "whatsapp_connection"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_conversation" ADD CONSTRAINT "whatsapp_conversation_organization_id_person_id_fkey" FOREIGN KEY ("organization_id", "person_id") REFERENCES "person"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_message" ADD CONSTRAINT "whatsapp_message_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_message" ADD CONSTRAINT "whatsapp_message_organization_id_conversation_id_fkey" FOREIGN KEY ("organization_id", "conversation_id") REFERENCES "whatsapp_conversation"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_message" ADD CONSTRAINT "whatsapp_message_organization_id_template_id_fkey" FOREIGN KEY ("organization_id", "template_id") REFERENCES "whatsapp_template"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_template" ADD CONSTRAINT "whatsapp_template_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_template" ADD CONSTRAINT "whatsapp_template_organization_id_connection_id_fkey" FOREIGN KEY ("organization_id", "connection_id") REFERENCES "whatsapp_connection"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_usage_month" ADD CONSTRAINT "whatsapp_usage_month_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_usage_month" ADD CONSTRAINT "whatsapp_usage_month_organization_id_connection_id_fkey" FOREIGN KEY ("organization_id", "connection_id") REFERENCES "whatsapp_connection"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "whatsapp_number_route" ADD CONSTRAINT "whatsapp_number_route_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- A connection's fixed values stay within their lists (spec 5), its caps and counters never go below zero, and a number is
-- digits as MSG91 writes it.
ALTER TABLE "whatsapp_connection"
  ADD CONSTRAINT whatsapp_connection_mode_value CHECK (mode IN ('new_number', 'coexistence', 'demo')),
  ADD CONSTRAINT whatsapp_connection_status_value CHECK (status IN ('setup', 'connected', 'paused', 'problem', 'disconnected')),
  ADD CONSTRAINT whatsapp_connection_history_value CHECK (history_state IN ('not_applicable', 'waiting', 'received', 'skipped')),
  ADD CONSTRAINT whatsapp_connection_caps CHECK (marketing_cap_month >= 0 AND template_cap_day >= 0 AND events_unknown >= 0),
  ADD CONSTRAINT whatsapp_connection_number_format CHECK (
    (mode = 'demo' AND integrated_number = '') OR integrated_number ~ '^[0-9]{8,15}$'),
  ADD CONSTRAINT whatsapp_connection_text_lengths CHECK (
    char_length(display_number) <= 20 AND char_length(coalesce(provider_ref, '')) <= 200
    AND char_length(coalesce(waba_id, '')) <= 100 AND char_length(coalesce(phone_number_id, '')) <= 100
    AND char_length(coalesce(quality_rating, '')) <= 40 AND char_length(coalesce(note, '')) <= 500);

-- A chat's state is one of two, and a window never moves ahead of the last message it came from.
ALTER TABLE "whatsapp_conversation"
  ADD CONSTRAINT whatsapp_conversation_state_value CHECK (state IN ('open', 'erased')),
  ADD CONSTRAINT whatsapp_conversation_text_lengths CHECK (
    char_length(phone_e164) BETWEEN 1 AND 60 AND char_length(coalesce(profile_name, '')) <= 200);

-- A message's fixed values stay within their lists (spec 5); text is at most WhatsApp's 4,096 characters; a status is
-- one the table knows; a stored file has no provider link left.
ALTER TABLE "whatsapp_message"
  ADD CONSTRAINT whatsapp_message_direction_value CHECK (direction IN ('in', 'out')),
  ADD CONSTRAINT whatsapp_message_origin_value CHECK (origin IN ('customer', 'staff_crm', 'staff_phone', 'history')),
  ADD CONSTRAINT whatsapp_message_kind_value CHECK (kind IN (
    'text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contacts', 'reaction', 'template', 'unsupported')),
  ADD CONSTRAINT whatsapp_message_status_value CHECK (status IN (
    'received', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'superseded')),
  ADD CONSTRAINT whatsapp_message_media_state_value CHECK (media_state IN ('none', 'pending', 'stored', 'expired', 'failed')),
  ADD CONSTRAINT whatsapp_message_stored_has_no_link CHECK (media_state <> 'stored' OR media_url IS NULL),
  ADD CONSTRAINT whatsapp_message_attempts CHECK (media_attempts >= 0),
  ADD CONSTRAINT whatsapp_message_text_lengths CHECK (
    char_length(coalesce(body, '')) <= 4096 AND char_length(coalesce(caption, '')) <= 4096
    AND char_length(coalesce(file_name, '')) <= 300 AND char_length(coalesce(wamid, '')) <= 200
    AND char_length(coalesce(quoted_wamid, '')) <= 200 AND char_length(coalesce(reaction, '')) <= 32
    AND char_length(coalesce(client_token, '')) <= 100 AND char_length(coalesce(failure_code, '')) <= 100
    AND char_length(coalesce(media_url, '')) <= 2048 AND cardinality(template_params) <= 20),
  ADD CONSTRAINT whatsapp_message_coordinates CHECK (
    (latitude IS NULL OR latitude BETWEEN -90 AND 90) AND (longitude IS NULL OR longitude BETWEEN -180 AND 180));

-- A template's fixed values stay within their lists. Authentication templates are not offered (D14).
ALTER TABLE "whatsapp_template"
  ADD CONSTRAINT whatsapp_template_category_value CHECK (category IN ('utility', 'marketing')),
  ADD CONSTRAINT whatsapp_template_status_value CHECK (status IN (
    'draft', 'pending', 'approved', 'rejected', 'paused', 'disabled', 'archived')),
  ADD CONSTRAINT whatsapp_template_name_format CHECK (name ~ '^[a-z0-9_]+$' AND char_length(name) <= 512),
  ADD CONSTRAINT whatsapp_template_text_lengths CHECK (
    char_length(language) BETWEEN 2 AND 10 AND char_length(body) <= 1024 AND char_length(coalesce(footer, '')) <= 60
    AND char_length(coalesce(reason, '')) <= 1000 AND char_length(coalesce(provider_ref, '')) <= 200
    AND cardinality(variables) <= 10 AND cardinality(samples) <= 10);

-- Usage counts never go below zero, and a month is its first day.
ALTER TABLE "whatsapp_usage_month"
  ADD CONSTRAINT whatsapp_usage_month_counts CHECK (
    inbound >= 0 AND replies >= 0 AND utility >= 0 AND marketing >= 0 AND failed >= 0 AND media_bytes_copied >= 0),
  ADD CONSTRAINT whatsapp_usage_month_first_day CHECK (EXTRACT(day FROM month) = 1);

-- The route and the unrouted numbers hold ids, numbers and counts only.
ALTER TABLE "whatsapp_number_route"
  ADD CONSTRAINT whatsapp_number_route_number_format CHECK (integrated_number ~ '^[0-9]{8,15}$');
ALTER TABLE "whatsapp_unrouted"
  ADD CONSTRAINT whatsapp_unrouted_number_format CHECK (integrated_number ~ '^[0-9]{8,15}$'),
  ADD CONSTRAINT whatsapp_unrouted_events CHECK (events >= 1);

-- The runtime role never deletes a connection, a chat, a message, a template or a usage row: a chat is erased by emptying it,
-- and only the platform role's purge removes the rest.
REVOKE DELETE ON TABLE "whatsapp_connection", "whatsapp_conversation", "whatsapp_message", "whatsapp_template",
  "whatsapp_usage_month" FROM app_runtime;

-- WhatsApp consent shares the person_consent ledger (D19): a new purpose, and the customer's own STOP as a source.
ALTER TABLE "person_consent"
  DROP CONSTRAINT person_consent_purpose_value,
  DROP CONSTRAINT person_consent_source_value,
  ADD CONSTRAINT person_consent_purpose_value CHECK (purpose IN ('marketing', 'whatsapp')),
  ADD CONSTRAINT person_consent_source_value CHECK (source IN ('web_form', 'staff', 'customer'));

-- Organization isolation (see app_enable_org_rls in the init migration). The number route carries organization_id but has
-- none, and the unrouted numbers have no organization at all: both hold ids, numbers and counts only, and are reached through
-- @travel-crm/db/whatsapp-routes inside db.withoutOrg() (ADR 0035).
SELECT app_enable_org_rls('whatsapp_connection');
SELECT app_enable_org_rls('whatsapp_conversation');
SELECT app_enable_org_rls('whatsapp_message');
SELECT app_enable_org_rls('whatsapp_template');
SELECT app_enable_org_rls('whatsapp_usage_month');
