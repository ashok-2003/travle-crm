-- The one agent's chat summary and the point it covers (the last message's id and time). It only adds columns;
-- an erasure deletes ai_chat rows already, so the summary goes with them.
ALTER TABLE ai_chat
  ADD COLUMN chat_summary text NOT NULL DEFAULT '',
  ADD COLUMN chat_summary_through_id uuid,
  ADD COLUMN chat_summary_through_at timestamptz(6),
  ADD COLUMN chat_summary_at timestamptz(6),
  ADD CONSTRAINT ai_chat_chat_summary_length CHECK (char_length(chat_summary) <= 4000);
