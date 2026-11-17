// The chat summary's columns: a summary of up to 4,000 characters and the point it covers (the last message's id and
// time). Rows are written as the migrator so the check alone is under test (a check fails before a foreign key is looked at).
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

describe("the chat summary's columns", () => {
  const urls = inject("dbUrls");
  let client: pg.Client;
  beforeAll(async () => {
    client = new pg.Client({ connectionString: urls.migrator });
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
  });

  const insertChat = (summary: string) =>
    client.query(
      `INSERT INTO ai_chat (organization_id, id, conversation_id, chat_summary, chat_summary_through_id,
         chat_summary_through_at, chat_summary_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, now(), now(), now())`,
      [randomUUID(), randomUUID(), randomUUID(), summary, randomUUID()],
    );

  it("keeps a summary of up to 4,000 characters and its point, and refuses a longer one", async () => {
    await expect(insertChat("x".repeat(4001))).rejects.toMatchObject({ constraint: "ai_chat_chat_summary_length" });
    // 4,000 passes the check (and then meets its foreign keys), so the point's columns exist too.
    await expect(insertChat("x".repeat(4000))).rejects.toMatchObject({ code: "23503" });
    const { rows } = await client.query<{ column_name: string; column_default: string | null }>(
      `SELECT column_name, column_default FROM information_schema.columns
       WHERE table_name = 'ai_chat' AND column_name = 'chat_summary'`,
    );
    expect(rows[0]?.column_default).toContain("''");
  });
});
