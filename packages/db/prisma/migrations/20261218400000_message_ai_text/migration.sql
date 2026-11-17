-- What the AI heard in a voice note or saw in a photo, kept on the message (one per message, written once).
ALTER TABLE whatsapp_message
  ADD COLUMN ai_text text,
  ADD COLUMN ai_text_kind text,
  ADD COLUMN ai_text_at timestamptz(6);

ALTER TABLE whatsapp_message
  ADD CONSTRAINT whatsapp_message_ai_text_kind_value CHECK (ai_text_kind IN ('transcript', 'description')),
  ADD CONSTRAINT whatsapp_message_ai_text_length CHECK (char_length(ai_text) <= 2000);
