-- Web push for super admins (the owner, 2026-11-17): the platform's own subscriptions, and when an incident's email went
-- out. Only adds.

-- The platform's: no organization_id, no row-level security, and the runtime role has no rights on it. user_id names a
-- platform staff member without a foreign key, like the platform log's actor, so it never blocks their erasure.
CREATE TABLE "platform_push_subscription" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_push_subscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "platform_push_subscription_endpoint_key" ON "platform_push_subscription"("endpoint");
CREATE INDEX "platform_push_subscription_user_id_idx" ON "platform_push_subscription"("user_id");

REVOKE ALL ON TABLE "platform_push_subscription" FROM app_runtime;

-- When the super admins were emailed about this incident; null while nobody has been.
ALTER TABLE "platform_incident" ADD COLUMN "emailed_at" TIMESTAMPTZ(6);
-- Every incident so far was emailed when it opened, under the old rules: none is emailed again for being long.
UPDATE "platform_incident" SET "emailed_at" = "opened_at";
