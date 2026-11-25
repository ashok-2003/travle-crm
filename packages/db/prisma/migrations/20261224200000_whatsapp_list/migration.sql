-- A list message (the AI agent's trip menu) keeps its button and rows in the column a card keeps its reply buttons in:
-- { "button": ..., "rows": [...] }, one to ten rows. The check only widens, so the release before keeps working while
-- this applies. Nested CASEs keep jsonb_array_length from being asked about something that is not an array.
ALTER TABLE whatsapp_message DROP CONSTRAINT whatsapp_message_buttons_count;
ALTER TABLE whatsapp_message
  ADD CONSTRAINT whatsapp_message_buttons_count CHECK (
    buttons IS NULL OR CASE jsonb_typeof(buttons)
      WHEN 'array' THEN jsonb_array_length(buttons) BETWEEN 1 AND 3
      WHEN 'object' THEN CASE
        WHEN jsonb_typeof(buttons -> 'rows') = 'array' THEN jsonb_array_length(buttons -> 'rows') BETWEEN 1 AND 10
        ELSE false
      END
      ELSE false
    END
  );
