-- A new agency starts on the natural agent. Only the column's default changes: rows that exist keep their agent. This
-- only changes a default, so the release before keeps working while it applies.

-- AlterTable
ALTER TABLE "ai_autopilot" ALTER COLUMN "agent" SET DEFAULT 'natural';
