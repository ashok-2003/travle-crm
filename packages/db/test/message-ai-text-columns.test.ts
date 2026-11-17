// The message's AI text columns: a kind other than transcript or description, and text past 2,000 characters, are refused.
// Rows are written as the migrator so the checks alone are under test (a check fails before a foreign key is looked at).
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

describe("the message's AI text columns", () => {
  const urls = inject("dbUrls");
  let client: pg.Client;
  beforeAll(async () => {
    client = new pg.Client({ connectionString: urls.migrator });
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
  });

  const insert = (kind: string, text: string) =>
    client.query(
      `INSERT INTO whatsapp_message (organization_id, id, conversation_id, wamid, direction, origin, kind, status,
         occurred_at, ai_text, ai_text_kind, ai_text_at)
       VALUES ($1, $2, $3, $4, 'in', 'customer', 'audio', 'received', now(), $5, $6, now())`,
      [randomUUID(), randomUUID(), randomUUID(), randomUUID(), text, kind],
    );

  it("refuses an ai_text_kind other than transcript and description, and text past 2,000 characters", async () => {
    await expect(insert("summary", "hello")).rejects.toMatchObject({
      constraint: "whatsapp_message_ai_text_kind_value",
    });
    await expect(insert("transcript", "x".repeat(2001))).rejects.toMatchObject({
      constraint: "whatsapp_message_ai_text_length",
    });
    // Within the limits the checks pass and the row then meets its foreign keys.
    await expect(insert("description", "x".repeat(2000))).rejects.toMatchObject({ code: "23503" });
  });
});
