// The one agent's value: an agency's agent and a turn trace may be lite, natural or one (kept for a rollback; every
// agency runs one, and a new one starts on it); the checks refuse anything else. Rows are written as the migrator so
// the checks alone are under test (a check fails before a foreign key).
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

describe("the one agent's value", () => {
  const urls = inject("dbUrls");
  let client: pg.Client;
  beforeAll(async () => {
    client = new pg.Client({ connectionString: urls.migrator });
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
  });

  const insertAutopilot = (agent: string) =>
    client.query("INSERT INTO ai_autopilot (organization_id, agent, updated_at) VALUES ($1, $2, now())", [
      randomUUID(),
      agent,
    ]);

  const insertTrace = (agent: string) =>
    client.query(
      `INSERT INTO ai_turn_trace (organization_id, id, conversation_id, started_at, kind, outcome, input_tokens,
         output_tokens, duration_ms, prompt_versions, file_key, expires_at, agent, cached_tokens, failed_checks)
       VALUES ($1, $2, $3, now(), 'reply', 'sent', 0, 0, 0, '{}', 'k', now(), $4, 0, 0)`,
      [randomUUID(), randomUUID(), randomUUID(), agent],
    );

  it("refuses an agent outside lite, natural and one, for an agency and a trace", async () => {
    await expect(insertAutopilot("robot")).rejects.toMatchObject({ constraint: "ai_autopilot_agent_value" });
    await expect(insertTrace("robot")).rejects.toMatchObject({ constraint: "ai_turn_trace_agent_value" });
  });

  it("takes one for an agency and a trace", async () => {
    // Past the check, the row meets its foreign key to the organization.
    await expect(insertAutopilot("one")).rejects.toMatchObject({ code: "23503" });
    await expect(insertTrace("one")).rejects.toMatchObject({ code: "23503" });
  });

  it("starts an agency on one", async () => {
    const { rows } = await client.query<{ column_default: string }>(
      `SELECT column_default FROM information_schema.columns
       WHERE table_name = 'ai_autopilot' AND column_name = 'agent'`,
    );
    expect(rows[0]?.column_default).toContain("'one'");
  });
});
