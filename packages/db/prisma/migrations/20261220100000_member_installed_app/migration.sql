-- Which kind of phone a member opened the installed app on, and when last, so their browser can point them to it.
CREATE TABLE "member_installed_app" (
    "organization_id" UUID NOT NULL DEFAULT (NULLIF(current_setting('app.org_id'::text, true), ''::text))::uuid,
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "member_installed_app_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "member_installed_app_platform" CHECK ("platform" IN ('ios', 'android'))
);
CREATE UNIQUE INDEX "member_installed_app_organization_id_id_key" ON "member_installed_app"("organization_id", "id");
CREATE UNIQUE INDEX "member_installed_app_one_per_type" ON "member_installed_app"("organization_id", "user_id", "platform");
ALTER TABLE "member_installed_app" ADD CONSTRAINT "member_installed_app_organization_id_fkey" FOREIGN KEY ("organization_id")
  REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Only the platform's erasure and purge delete rows.
REVOKE DELETE ON TABLE "member_installed_app" FROM app_runtime;

SELECT app_enable_org_rls('member_installed_app');
