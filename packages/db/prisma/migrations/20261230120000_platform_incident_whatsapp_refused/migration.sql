-- The console's incident for MSG91 refusing our WhatsApp sends (the owner, 2026-11-28): its kind joins the CHECK, which
-- the contracts' list outran, so every report of it failed. Only adds an allowed value: safe to apply before the release.
ALTER TABLE "platform_incident" DROP CONSTRAINT platform_incident_kind_value;
ALTER TABLE "platform_incident"
  ADD CONSTRAINT platform_incident_kind_value
    CHECK (kind IN ('ai.unavailable', 'ai.rate-limited', 'jobs.failed', 'api.errors', 'worker.stalled', 'whatsapp.refused'));
