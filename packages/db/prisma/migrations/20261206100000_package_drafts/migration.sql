-- AI plan 2: a group package drafted from the agency's own documents. The fill's target gains 'package_draft'; every earlier value stays.
ALTER TABLE "ai_fill" DROP CONSTRAINT ai_fill_target_value;
ALTER TABLE "ai_fill"
  ADD CONSTRAINT ai_fill_target_value CHECK (target IN ('lead', 'lead_edit', 'quote', 'call_note', 'room_requests', 'departure_offer', 'quote_days', 'rate_sheet', 'travellers', 'package_draft'));
