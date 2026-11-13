-- How many of the lite agent's follow-ups went in a chat's current silence (0, 1 or 2): the first plans the second,
-- and the second plans none. A reply turn starts the count again. Only adds a column.
ALTER TABLE "ai_chat" ADD COLUMN "follow_ups_sent" SMALLINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT ai_chat_follow_ups_sent_range CHECK (follow_ups_sent BETWEEN 0 AND 2);
