// The message's button columns: a card holds one to three buttons, a list one to ten rows, and a tap's id is at most 256
// characters.
// Rows are written as the migrator so the checks alone are under test (a check fails before a foreign key is looked at).
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

describe("the message's button columns", () => {
  const urls = inject("dbUrls");
  let client: pg.Client;
  beforeAll(async () => {
    client = new pg.Client({ connectionString: urls.migrator });
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
  });

  const insert = (buttons: unknown, replyId: string | null) =>
    client.query(
      `INSERT INTO whatsapp_message (organization_id, id, conversation_id, wamid, direction, origin, kind, status,
         occurred_at, buttons, button_reply_id)
       VALUES ($1, $2, $3, $4, 'out', 'automation', 'text', 'queued', now(), $5::jsonb, $6)`,
      [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        randomUUID(),
        buttons === null ? null : JSON.stringify(buttons),
        replyId,
      ],
    );
  const button = (n: number) => ({ id: `book:${String(n)}`, title: "Book" });

  it("refuses more than three buttons and an id past 256 characters", async () => {
    await expect(insert([], null)).rejects.toMatchObject({ constraint: "whatsapp_message_buttons_count" });
    await expect(insert([1, 2, 3, 4].map(button), null)).rejects.toMatchObject({
      constraint: "whatsapp_message_buttons_count",
    });
    await expect(insert({ id: "x" }, null)).rejects.toMatchObject({ constraint: "whatsapp_message_buttons_count" });
    await expect(insert(null, "x".repeat(257))).rejects.toMatchObject({
      constraint: "whatsapp_message_button_reply_id_length",
    });
    // Within the limits the checks pass and the row then meets its foreign keys.
    await expect(insert([1, 2, 3].map(button), "x".repeat(256))).rejects.toMatchObject({ code: "23503" });
  });

  it("takes a list's button and one to ten rows in the same column, and refuses none or more", async () => {
    const list = (rows: number) => ({
      button: "See trips",
      rows: Array.from({ length: rows }, (_, n) => ({ id: `trips:${String(n)}`, title: "Goa" })),
    });
    for (const rows of [0, 11]) {
      await expect(insert(list(rows), null)).rejects.toMatchObject({ constraint: "whatsapp_message_buttons_count" });
    }
    await expect(insert({ button: "See trips", rows: "Goa" }, null)).rejects.toMatchObject({
      constraint: "whatsapp_message_buttons_count",
    });
    // Within the limits the check passes and the row then meets its foreign keys.
    await expect(insert(list(1), null)).rejects.toMatchObject({ code: "23503" });
    await expect(insert(list(10), null)).rejects.toMatchObject({ code: "23503" });
  });
});
