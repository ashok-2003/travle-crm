-- What the lite agent writes on a lead: its timeline lines (marked as the AI's, with the words before and after) and the
-- chat's summary. Existing timeline rows stay valid: by_ai false, the three texts empty, and no kind they hold is removed.
ALTER TABLE "lead_timeline_entry"
  ADD COLUMN "by_ai" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ai_field" TEXT, ADD COLUMN "from_text" TEXT, ADD COLUMN "to_text" TEXT,
  DROP CONSTRAINT lead_timeline_entry_kind_value,
  ADD CONSTRAINT lead_timeline_entry_kind_value CHECK (kind IN ('created', 'note', 'call', 'stage-changed', 'reassigned',
    'follow-up-added', 'follow-up-done', 'follow-up-cancelled', 'repeat-enquiry', 'trip-edited', 'whatsapp-contact',
    'booking-event', 'ai-field-set')),
  ADD CONSTRAINT lead_timeline_entry_ai_field CHECK ((kind = 'ai-field-set') = (ai_field IS NOT NULL AND to_text IS NOT NULL)
    AND (ai_field IS NULL OR ai_field IN ('destination', 'when', 'adults', 'children_ages', 'departure_city', 'room_type', 'name'))
    AND char_length(coalesce(from_text, '')) <= 120 AND char_length(coalesce(to_text, '')) <= 120);

ALTER TABLE "ai_chat" ADD COLUMN "summary" TEXT NOT NULL DEFAULT '',
  ADD CONSTRAINT ai_chat_summary_length CHECK (char_length(summary) <= 1000);
