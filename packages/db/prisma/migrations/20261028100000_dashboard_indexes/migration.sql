-- The dashboard's period queries (release B): a period's new leads by created_at, and the moves to a stage by when they
-- happened. Without them the first reads the agency's whole lead set and the second every agency's timeline rows.
CREATE INDEX "lead_live_by_created" ON "lead" ("organization_id", "created_at") WHERE ("deleted_at" IS NULL);

CREATE INDEX "lead_timeline_stage_moves" ON "lead_timeline_entry" ("organization_id", "occurred_at") WHERE ("kind" = 'stage-changed'::text);
