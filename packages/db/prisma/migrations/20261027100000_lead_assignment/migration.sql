-- Automatic lead assignment (release C, spec 3.2): the agency's mode, its rules and the pool that takes turns.

-- CreateTable
CREATE TABLE "assignment_settings" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'owner',
    "slow_reply_minutes" INTEGER,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assignment_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_rule" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "source" TEXT,
    "destination_id" UUID,
    "trip_type" TEXT,
    "assignee_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_pool_member" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "away_until" TIMESTAMPTZ(6),
    "last_assigned_at" TIMESTAMPTZ(6),

    CONSTRAINT "assignment_pool_member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assignment_settings_organization_id_key" ON "assignment_settings"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_settings_organization_id_id_key" ON "assignment_settings"("organization_id", "id");

-- CreateIndex
CREATE INDEX "assignment_rule_order" ON "assignment_rule"("organization_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_rule_organization_id_id_key" ON "assignment_rule"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_pool_member_organization_id_id_key" ON "assignment_pool_member"("organization_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_pool_member_organization_id_user_id_key" ON "assignment_pool_member"("organization_id", "user_id");

-- AddForeignKey
ALTER TABLE "assignment_settings" ADD CONSTRAINT "assignment_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignment_rule" ADD CONSTRAINT "assignment_rule_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignment_rule" ADD CONSTRAINT "assignment_rule_organization_id_destination_id_fkey" FOREIGN KEY ("organization_id", "destination_id") REFERENCES "destination"("organization_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignment_pool_member" ADD CONSTRAINT "assignment_pool_member_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Row-level security: each organization sees only its own.
SELECT app_enable_org_rls('assignment_settings');
SELECT app_enable_org_rls('assignment_rule');
SELECT app_enable_org_rls('assignment_pool_member');

ALTER TABLE "assignment_settings"
  ADD CONSTRAINT assignment_settings_mode_value CHECK (mode IN ('owner', 'turns', 'fewest_open')),
  ADD CONSTRAINT assignment_settings_slow_reply_range CHECK (slow_reply_minutes IS NULL OR slow_reply_minutes BETWEEN 1 AND 1440);

ALTER TABLE "assignment_rule"
  ADD CONSTRAINT assignment_rule_position_range CHECK (position >= 0),
  ADD CONSTRAINT assignment_rule_trip_type_value CHECK (
    trip_type IS NULL OR trip_type IN ('family', 'honeymoon', 'friends', 'solo', 'corporate', 'pilgrimage', 'trek')
  );
