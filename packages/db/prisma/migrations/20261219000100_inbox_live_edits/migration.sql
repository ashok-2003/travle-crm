-- An edit or a deletion changes only `edited_at` or `revoked_at` (the words may even be the same), so the live stream's message
-- trigger must see them: open chats then show "Edited" and the deleted mark at once, not on the slow poll. Replaces the
-- function only; the trigger is unchanged.
CREATE OR REPLACE FUNCTION app_inbox_live_message() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.app_inbox_live_notify(NEW.organization_id, NEW.conversation_id, 'message',
      NEW.direction = 'in' AND NEW.origin = 'customer' AND NEW.kind <> 'reaction');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.app_inbox_live_notify(NEW.organization_id, NEW.conversation_id, 'status', false);
  ELSIF (NEW.media_state, NEW.body, NEW.caption, NEW.file_name, NEW.reaction, NEW.starred_at, NEW.ai_text, NEW.quote_dropped,
         NEW.revoked_at, NEW.edited_at)
      IS DISTINCT FROM
      (OLD.media_state, OLD.body, OLD.caption, OLD.file_name, OLD.reaction, OLD.starred_at, OLD.ai_text, OLD.quote_dropped,
       OLD.revoked_at, OLD.edited_at) THEN
    PERFORM public.app_inbox_live_notify(NEW.organization_id, NEW.conversation_id, 'message', false);
  END IF;
  RETURN NULL;
END;
$$;
