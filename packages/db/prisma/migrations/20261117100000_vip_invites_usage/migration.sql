-- The invite-only program (the owner, 2026-10-28): the console makes an invite per company, its link opens the company's
-- own organization at once with a free trial and signs its owner in; every opening is counted. And what organizations
-- do in the product: each page a member visits and for how long, and whether they have seen the welcome. Only adds.

-- The platform's: no organization_id (an invite comes before its organization, and outlives a purge), no row-level
-- security, and the runtime role has no rights on them.
CREATE TABLE "vip_invite" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "owner_phone" TEXT,
    "owner_email" TEXT,
    "city" TEXT,
    "gst_state_code" TEXT NOT NULL DEFAULT '07',
    "plan_id" UUID NOT NULL,
    "billing_cycle" TEXT NOT NULL DEFAULT 'monthly',
    "trial_days" INTEGER NOT NULL DEFAULT 30,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_opened_at" TIMESTAMPTZ(6),
    "last_opened_at" TIMESTAMPTZ(6),
    "open_count" INTEGER NOT NULL DEFAULT 0,
    "joined_organization_id" UUID,
    "joined_at" TIMESTAMPTZ(6),
    "owner_user_id" UUID,
    "cancelled_at" TIMESTAMPTZ(6),

    CONSTRAINT "vip_invite_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "vip_invite_token_key" ON "vip_invite"("token");
CREATE INDEX "vip_invite_created" ON "vip_invite"("created_at" DESC);
ALTER TABLE "vip_invite" ADD CONSTRAINT "vip_invite_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "vip_invite"
  ADD CONSTRAINT vip_invite_lengths CHECK (
    char_length(company_name) BETWEEN 1 AND 120 AND char_length(owner_name) BETWEEN 1 AND 120
    AND char_length(COALESCE(owner_phone, '')) <= 20 AND char_length(COALESCE(owner_email, '')) <= 254
    AND char_length(COALESCE(city, '')) <= 80 AND char_length(token) BETWEEN 32 AND 64),
  ADD CONSTRAINT vip_invite_billing_cycle_value CHECK (billing_cycle IN ('monthly', 'yearly')),
  ADD CONSTRAINT vip_invite_trial_days CHECK (trial_days BETWEEN 1 AND 365),
  ADD CONSTRAINT vip_invite_open_count CHECK (open_count >= 0);

CREATE TABLE "vip_invite_open" (
    "id" UUID NOT NULL,
    "invite_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vip_invite_open_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "vip_invite_open_invite" ON "vip_invite_open"("invite_id", "opened_at" DESC);
ALTER TABLE "vip_invite_open" ADD CONSTRAINT "vip_invite_open_invite_id_fkey" FOREIGN KEY ("invite_id")
  REFERENCES "vip_invite"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

REVOKE ALL ON TABLE "vip_invite", "vip_invite_open" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "vip_invite", "vip_invite_open" FROM app_platform;
REVOKE UPDATE ON TABLE "vip_invite_open" FROM app_platform;

-- Organizations' own: one row per page a member opened, its route (ids replaced, never what was searched) and seconds.
CREATE TABLE "page_visit" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "page_visit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "page_visit_organization_id_id_key" ON "page_visit"("organization_id", "id");
CREATE INDEX "page_visit_started" ON "page_visit"("organization_id", "started_at" DESC);
ALTER TABLE "page_visit" ADD CONSTRAINT "page_visit_organization_id_fkey" FOREIGN KEY ("organization_id")
  REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "page_visit"
  ADD CONSTRAINT page_visit_path_length CHECK (char_length(path) BETWEEN 1 AND 200),
  ADD CONSTRAINT page_visit_seconds CHECK (seconds BETWEEN 0 AND 86400);

-- The welcome: whether the organization came through the invite program, and who has seen the welcome.
CREATE TABLE "organization_welcome" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "vip" BOOLEAN NOT NULL DEFAULT false,
    "trial_days" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_welcome_pkey" PRIMARY KEY ("organization_id")
);
ALTER TABLE "organization_welcome" ADD CONSTRAINT "organization_welcome_organization_id_fkey" FOREIGN KEY ("organization_id")
  REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE "welcome_seen" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "welcome_seen_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "welcome_seen_organization_id_id_key" ON "welcome_seen"("organization_id", "id");
CREATE UNIQUE INDEX "welcome_seen_one_per_user" ON "welcome_seen"("organization_id", "user_id");
ALTER TABLE "welcome_seen" ADD CONSTRAINT "welcome_seen_organization_id_fkey" FOREIGN KEY ("organization_id")
  REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

REVOKE DELETE ON TABLE "page_visit", "organization_welcome", "welcome_seen" FROM app_runtime;
REVOKE UPDATE ON TABLE "welcome_seen" FROM app_runtime;

SELECT app_enable_org_rls('page_visit');
SELECT app_enable_org_rls('organization_welcome');
SELECT app_enable_org_rls('welcome_seen');
