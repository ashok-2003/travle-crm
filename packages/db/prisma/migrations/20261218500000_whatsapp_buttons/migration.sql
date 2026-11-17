-- A card's reply buttons on the message that carries them, and the id of the button a customer tapped.
ALTER TABLE whatsapp_message
  ADD COLUMN buttons jsonb,
  ADD COLUMN button_reply_id text;

-- A CASE keeps jsonb_array_length from being asked about something that is not an array.
ALTER TABLE whatsapp_message
  ADD CONSTRAINT whatsapp_message_buttons_count CHECK (
    buttons IS NULL OR CASE WHEN jsonb_typeof(buttons) = 'array' THEN jsonb_array_length(buttons) BETWEEN 1 AND 3 ELSE false END
  ),
  ADD CONSTRAINT whatsapp_message_button_reply_id_length CHECK (char_length(button_reply_id) <= 256);
