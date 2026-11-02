-- AI part 4b (release ai3b): a supplier's rate sheet read by the AI. Additive: the fill's target and input kind gain a value each,
-- and a fill keeps the rest of a photo set's attachments (the first stays in input_attachment_id), so the 30-day sweep and the
-- erasure find them. The target list also holds the two values the itinerary and traveller fills (ai3a) use, as the design says,
-- so whichever of the two releases is applied second leaves every value allowed. No new table: rates and seasons are saved in
-- their own tables.

ALTER TABLE "ai_fill" ADD COLUMN "input_attachment_ids" UUID[] DEFAULT ARRAY[]::UUID[];

ALTER TABLE "ai_fill" DROP CONSTRAINT ai_fill_target_value;
ALTER TABLE "ai_fill"
  ADD CONSTRAINT ai_fill_target_value CHECK (target IN ('lead', 'lead_edit', 'quote', 'call_note', 'room_requests', 'departure_offer', 'quote_days', 'rate_sheet', 'travellers'));

ALTER TABLE "ai_fill" DROP CONSTRAINT ai_fill_input_kind_value;
ALTER TABLE "ai_fill"
  ADD CONSTRAINT ai_fill_input_kind_value CHECK (input_kind IN ('text', 'voice', 'image', 'chat', 'file'));
