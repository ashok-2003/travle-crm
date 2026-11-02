-- The system's health (the owner, 2026-11-02): what broke, kept as incidents the console shows and emails to the super
-- admins. Only adds.

-- The platform's: no organization_id, no row-level security, and the runtime role has no rights on it.
CREATE TABLE "platform_incident" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "reports" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "platform_incident_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "platform_incident_one_open" ON "platform_incident"("kind") WHERE ("resolved_at" IS NULL);
CREATE INDEX "platform_incident_newest" ON "platform_incident"("opened_at" DESC);

ALTER TABLE "platform_incident"
  ADD CONSTRAINT platform_incident_kind_value
    CHECK (kind IN ('ai.unavailable', 'ai.rate-limited', 'jobs.failed', 'api.errors', 'worker.stalled')),
  ADD CONSTRAINT platform_incident_detail_length CHECK (char_length(detail) <= 200),
  ADD CONSTRAINT platform_incident_reports CHECK (reports >= 1);

REVOKE ALL ON TABLE "platform_incident" FROM app_runtime;
REVOKE DELETE, TRUNCATE ON TABLE "platform_incident" FROM app_platform;
