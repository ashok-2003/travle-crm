-- The move to the one lite agent (plan 5): what the earlier agents left that no screen shows any more. Rows only: no
-- column or table changes, so the release before keeps working while this applies.
-- Their planned follow-ups: the lite agent plans its own after its first reply.
UPDATE "ai_chat" SET "follow_up_at" = NULL, "follow_up_reason" = NULL
  WHERE "follow_up_at" IS NOT NULL AND ("facts" ->> 'agent') IS DISTINCT FROM 'lite';
-- Nothing else is deleted or cleared here (controller ruling): the first agent's memory, voice copies and lessons
-- stay unread until the contract release, so this release can still be rolled back.
