-- The console's list of an agency's turn traces, newest first (started_at, then id): without it each page sorts all of
-- the agency's 14 days of turns. Only adds an index.
CREATE INDEX "ai_turn_trace_list" ON "ai_turn_trace"("organization_id", "started_at" DESC, "id" DESC);
