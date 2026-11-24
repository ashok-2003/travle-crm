-- Several WhatsApp numbers per agency (spec 2026-11-22-multi-number-whatsapp-design.md, sections 4 and 13): each number
-- gets a short label, a main flag and its own AI switch; the one-live-number index gives way to one main number and one
-- live record of a number per agency; and an assignment rule may name the number a lead came in on. It only adds, but for
-- the index swap: undoing it brings the old index back, which works only while every agency has one live number.

-- Altering the two tables and swapping the index lock them: wait at most 5 s for that, rather than queueing every query
-- behind it.
SET LOCAL lock_timeout = '5s';

ALTER TABLE whatsapp_connection
  ADD COLUMN label text NOT NULL DEFAULT 'WhatsApp',
  ADD COLUMN is_main boolean NOT NULL DEFAULT false,
  ADD COLUMN ai_answers boolean NOT NULL DEFAULT true,
  ADD CONSTRAINT whatsapp_connection_label_length CHECK (char_length(label) BETWEEN 1 AND 20);
-- The old index allowed one live number per agency: this flags exactly one main number each.
UPDATE whatsapp_connection SET is_main = true WHERE status <> 'disconnected';
DROP INDEX whatsapp_connection_live;
CREATE UNIQUE INDEX whatsapp_connection_main ON whatsapp_connection (organization_id)
  WHERE is_main AND status <> 'disconnected';
CREATE UNIQUE INDEX whatsapp_connection_live_number ON whatsapp_connection (organization_id, integrated_number)
  WHERE status <> 'disconnected';
ALTER TABLE assignment_rule ADD COLUMN whatsapp_connection_id uuid,
  ADD CONSTRAINT assignment_rule_whatsapp_connection_fkey FOREIGN KEY (organization_id, whatsapp_connection_id)
    REFERENCES whatsapp_connection (organization_id, id) ON DELETE RESTRICT ON UPDATE RESTRICT;
