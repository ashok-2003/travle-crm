-- MSG91's id of the send request that carried our message. Its send answer gives only this (no wamid), and the echoes and
-- delivery reports of our sends name it, so they find the message by it. Not unique: one bulk request covers many
-- recipients. It only adds.
ALTER TABLE whatsapp_message ADD COLUMN request_id text;

CREATE INDEX whatsapp_message_request ON whatsapp_message (organization_id, request_id) WHERE (request_id IS NOT NULL);
