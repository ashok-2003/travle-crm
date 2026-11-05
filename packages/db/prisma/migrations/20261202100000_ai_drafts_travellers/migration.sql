-- AI part 4a (release ai3): "Draft the days" on a quote and travellers' details read from a voice note, a list or an ID photo.
-- Additive: two more values for what an AI fill is for. No table or column is added: a travellers' fill belongs to its booking's
-- lead (so a customer's erasure finds it and the recording or photo it read), and its row keeps the path only, never a hash of a
-- birth date, phone or ID number.
ALTER TABLE "ai_fill" DROP CONSTRAINT ai_fill_target_value;
ALTER TABLE "ai_fill"
  ADD CONSTRAINT ai_fill_target_value CHECK (
    target IN ('lead', 'lead_edit', 'quote', 'call_note', 'room_requests', 'departure_offer', 'quote_days', 'travellers')
  );
