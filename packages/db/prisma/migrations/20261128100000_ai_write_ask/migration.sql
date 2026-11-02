-- The quote write-up (release ai2b): how the agency wants it to sound. Additive: one column with a default; nothing the
-- running version reads changes.
ALTER TABLE "ai_settings" ADD COLUMN "write_style" TEXT NOT NULL DEFAULT 'warm';
ALTER TABLE "ai_settings"
  ADD CONSTRAINT ai_settings_write_style_value CHECK (write_style IN ('warm', 'premium', 'short'));
