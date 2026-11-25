-- Only the one agent answers chats (the owner, 2026-11-24): every agency moves to it, and a new agency starts on it. The
-- checks stay wide ('lite', 'natural', 'one'), so the release before keeps working while this applies and a rollback
-- still reads its rows; a later migration narrows them.
UPDATE "ai_autopilot" SET "agent" = 'one' WHERE "agent" <> 'one';

-- AlterTable
ALTER TABLE "ai_autopilot" ALTER COLUMN "agent" SET DEFAULT 'one';
