-- The Inbox's live updates (spec 2026-11-22-inbox-revamp-design.md, part 1 item 4): whatever saves a WhatsApp message or
-- changes what a chat's row shows tells the api, in the same transaction and so only on commit, through NOTIFY on the
-- channel inbox_live. The api LISTENs on one connection and sends each member's browser the ids of the chats they may see.
-- The payload is ids and a word for what changed, never a number, a name or a word of a message:
--   {"organizationId": <uuid>, "conversationId": <uuid>, "change": "message" | "status" | "chat", "direction": "in"?}
-- "direction": "in" marks a customer's new message (not a reaction), which the browser may sound an alert for. Postgres
-- delivers identical payloads of one transaction once. A plain SECURITY INVOKER function with a pinned search_path, as
-- share_link_revocation_is_final; pg_notify is open to every role. It only adds. Beside the chat's own rows, a chat's team
-- notes (notes on its person's leads), its messages sent later and the AI's state in it notify "chat", so nothing a chat
-- shows waits for the browser's slow poll.

-- Creating a trigger locks its table: wait at most 5 s for that, rather than queueing every query behind it.
SET lock_timeout = '5s';

CREATE FUNCTION app_inbox_live_notify(organization_id uuid, conversation_id uuid, change text, customer_wrote boolean)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM pg_notify(
    'inbox_live',
    CASE WHEN customer_wrote
      THEN json_build_object('organizationId', organization_id, 'conversationId', conversation_id, 'change', change, 'direction', 'in')
      ELSE json_build_object('organizationId', organization_id, 'conversationId', conversation_id, 'change', change)
    END::text
  );
END;
$$;

-- A message saved ("message"; a customer's own words with "direction": "in"), its status moved ("status"), or what its
-- bubble shows changed: its file stored, its words erased, a reaction, a star, what the AI heard ("message"). A retry's
-- count or a provider id alone tells nobody anything.
CREATE FUNCTION app_inbox_live_message() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.app_inbox_live_notify(NEW.organization_id, NEW.conversation_id, 'message',
      NEW.direction = 'in' AND NEW.origin = 'customer' AND NEW.kind <> 'reaction');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.app_inbox_live_notify(NEW.organization_id, NEW.conversation_id, 'status', false);
  ELSIF (NEW.media_state, NEW.body, NEW.caption, NEW.file_name, NEW.reaction, NEW.starred_at, NEW.ai_text, NEW.quote_dropped)
      IS DISTINCT FROM
      (OLD.media_state, OLD.body, OLD.caption, OLD.file_name, OLD.reaction, OLD.starred_at, OLD.ai_text, OLD.quote_dropped) THEN
    PERFORM public.app_inbox_live_notify(NEW.organization_id, NEW.conversation_id, 'message', false);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER whatsapp_message_inbox_live
  AFTER INSERT OR UPDATE ON "whatsapp_message"
  FOR EACH ROW EXECUTE FUNCTION app_inbox_live_message();

-- What a chat's row and bar show beyond its messages: its person and name, waiting, pinned, archived, snoozed, hidden or
-- closed. The last message's time and id move with every message, which tells already.
CREATE FUNCTION app_inbox_live_conversation() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF (NEW.person_id, NEW.profile_name, NEW.needs_reply, NEW.hidden, NEW.state, NEW.pinned_at, NEW.archived_at, NEW.snoozed_until)
      IS DISTINCT FROM
      (OLD.person_id, OLD.profile_name, OLD.needs_reply, OLD.hidden, OLD.state, OLD.pinned_at, OLD.archived_at, OLD.snoozed_until) THEN
    PERFORM public.app_inbox_live_notify(NEW.organization_id, NEW.id, 'chat', false);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER whatsapp_conversation_inbox_live
  AFTER UPDATE ON "whatsapp_conversation"
  FOR EACH ROW EXECUTE FUNCTION app_inbox_live_conversation();

-- A chat's tags, shown on its row.
CREATE FUNCTION app_inbox_live_tag() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.app_inbox_live_notify(OLD.organization_id, OLD.conversation_id, 'chat', false);
  ELSE
    PERFORM public.app_inbox_live_notify(NEW.organization_id, NEW.conversation_id, 'chat', false);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER conversation_tag_inbox_live
  AFTER INSERT OR DELETE ON "conversation_tag"
  FOR EACH ROW EXECUTE FUNCTION app_inbox_live_tag();

-- A chat's messages sent later: scheduled, sent, cancelled or failed.
CREATE FUNCTION app_inbox_live_scheduled() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM public.app_inbox_live_notify(NEW.organization_id, NEW.conversation_id, 'chat', false);
  RETURN NULL;
END;
$$;

CREATE TRIGGER scheduled_message_inbox_live
  AFTER INSERT OR UPDATE ON "scheduled_message"
  FOR EACH ROW EXECUTE FUNCTION app_inbox_live_scheduled();

-- The AI's state in a chat, as the chat shows it: its mode, a hand-over, what it noted, what it is doing, its follow-up
-- and what it flagged. Its memory, counts and voice change on every turn and show nowhere in the chat.
CREATE FUNCTION app_inbox_live_ai_chat() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR
      (NEW.mode, NEW.handed_off_at, NEW.handoff_reason, NEW.summary, NEW.turn_state, NEW.follow_up_at,
       NEW.follow_up_reason, NEW.attention_reason, NEW.resumed_at)
      IS DISTINCT FROM
      (OLD.mode, OLD.handed_off_at, OLD.handoff_reason, OLD.summary, OLD.turn_state, OLD.follow_up_at,
       OLD.follow_up_reason, OLD.attention_reason, OLD.resumed_at) THEN
    PERFORM public.app_inbox_live_notify(NEW.organization_id, NEW.conversation_id, 'chat', false);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER ai_chat_inbox_live
  AFTER INSERT OR UPDATE ON "ai_chat"
  FOR EACH ROW EXECUTE FUNCTION app_inbox_live_ai_chat();

-- A team note: a note on a lead, shown in the chats of that lead's person (row-level security keeps the lookup to the
-- note's organization, as the chats are its own).
CREATE FUNCTION app_inbox_live_lead_note() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  PERFORM public.app_inbox_live_notify(chat.organization_id, chat.id, 'chat', false)
  FROM public.lead
  JOIN public.whatsapp_conversation AS chat
    ON chat.organization_id = lead.organization_id AND chat.person_id = lead.person_id
  WHERE lead.organization_id = NEW.organization_id AND lead.id = NEW.lead_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER lead_note_inbox_live
  AFTER INSERT ON "lead_note"
  FOR EACH ROW EXECUTE FUNCTION app_inbox_live_lead_note();
