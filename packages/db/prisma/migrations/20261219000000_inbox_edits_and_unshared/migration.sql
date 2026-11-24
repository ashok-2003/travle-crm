-- An edit or a deletion lands on the message it belongs to (inbox revamp spec item 12): when it was edited, when the customer
-- or the phone deleted it for everyone (the words are kept for the team), why a message could not be shown, and the headline
-- of the ad a chat came from. It only adds; undoing it drops the four columns.

-- Altering a busy table: wait at most 5 s for its lock, rather than queueing every query behind it.
SET LOCAL lock_timeout = '5s';

ALTER TABLE whatsapp_message
  ADD COLUMN edited_at timestamptz,
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN unsupported_reason text,
  ADD COLUMN ad_headline text,
  ADD CONSTRAINT whatsapp_message_unsupported_reason_value
    CHECK (unsupported_reason IS NULL OR unsupported_reason IN ('unavailable', 'album', 'unknown'));
