-- CreateTable
CREATE TABLE "notification" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),
    "source_event_id" UUID,
    "emailed_at" TIMESTAMPTZ(6),
    "email_claimed_at" TIMESTAMPTZ(6),
    "pushed_at" TIMESTAMPTZ(6),
    "push_claimed_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preference" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "user_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "opted_out" BOOLEAN NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("organization_id","user_id","channel","kind")
);

-- CreateTable
CREATE TABLE "push_subscription" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_organization_id_recipient_user_id_id_idx" ON "notification"("organization_id", "recipient_user_id", "id" DESC);

-- CreateIndex
CREATE INDEX "notification_unread" ON "notification"("organization_id", "recipient_user_id") WHERE ("read_at" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "notification_organization_id_source_event_id_recipient_user_key" ON "notification"("organization_id", "source_event_id", "recipient_user_id");

-- CreateIndex
CREATE INDEX "push_subscription_organization_id_user_id_idx" ON "push_subscription"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscription_organization_id_endpoint_key" ON "push_subscription"("organization_id", "endpoint");

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma does not model these). Keep below the generated SQL.
-- ---------------------------------------------------------------------------

-- Organization isolation (see app_enable_org_rls in the init migration).
SELECT app_enable_org_rls('notification');
SELECT app_enable_org_rls('notification_preference');
SELECT app_enable_org_rls('push_subscription');

-- Kinds read "<entity>.<what happened>", like event types; a link is a path inside the web app, never another site.
ALTER TABLE "notification"
  ADD CONSTRAINT notification_kind_format CHECK (kind ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$'),
  ADD CONSTRAINT notification_link_path CHECK (link IS NULL OR link ~ '^/($|[^/\\])');

ALTER TABLE "notification_preference"
  ADD CONSTRAINT notification_preference_channel CHECK (channel IN ('email', 'push')),
  ADD CONSTRAINT notification_preference_kind_format
    CHECK (kind = '*' OR kind ~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$');

-- A notification is the record that something happened: the api and worker may mark it read, claim its deliveries
-- and record them, and change or delete nothing else.
REVOKE UPDATE, DELETE ON TABLE "notification" FROM app_runtime;
GRANT UPDATE (read_at, emailed_at, email_claimed_at, pushed_at, push_claimed_at) ON TABLE "notification" TO app_runtime;
