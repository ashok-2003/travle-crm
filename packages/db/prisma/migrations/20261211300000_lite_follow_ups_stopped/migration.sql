-- Whether the customer's last words stopped the lite agent's follow-ups in a chat (not interested, decide later, a bare
-- "ok" after our closing line). Each reply turn writes it; the follow-ups (plan 3b) plan none while it is true.
ALTER TABLE "ai_chat" ADD COLUMN "follow_ups_stopped" BOOLEAN NOT NULL DEFAULT false;
