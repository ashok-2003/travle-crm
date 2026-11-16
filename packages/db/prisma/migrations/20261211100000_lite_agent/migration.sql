-- The lite WhatsApp agent's switch per agency. Set only by platform staff from the console, never by an agency's own saves.
ALTER TABLE "ai_autopilot" ADD COLUMN "lite" BOOLEAN NOT NULL DEFAULT false;
