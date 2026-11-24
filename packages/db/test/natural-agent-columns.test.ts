// The natural agent's columns: a turn trace names its agent, its cached tokens and its failed checks, and may be a
// replay. The constraints refuse anything else. Rows are written as the migrator so the checks alone are under test (a
// check fails before a foreign key is looked at).
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

describe("the natural agent's columns", () => {
  const urls = inject("dbUrls");
  let client: pg.Client;
  beforeAll(async () => {
    client = new pg.Client({ connectionString: urls.migrator });
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
  });

  const insertAutopilot = (agent?: string) =>
    client.query(
      agent === undefined
        ? "INSERT INTO ai_autopilot (organization_id, updated_at) VALUES ($1, now())"
        : "INSERT INTO ai_autopilot (organization_id, agent, updated_at) VALUES ($1, $2, now())",
      agent === undefined ? [randomUUID()] : [randomUUID(), agent],
    );

  const insertTrace = (columns: { kind: string; agent?: string; cached_tokens?: number; failed_checks?: number }) =>
    client.query(
      `INSERT INTO ai_turn_trace (organization_id, id, conversation_id, started_at, kind, outcome, input_tokens,
         output_tokens, duration_ms, prompt_versions, file_key, expires_at, agent, cached_tokens, failed_checks)
       VALUES ($1, $2, $3, now(), $4, 'sent', 0, 0, 0, '{}', 'k', now(), $5, $6, $7)`,
      [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        columns.kind,
        columns.agent ?? "lite",
        columns.cached_tokens ?? 0,
        columns.failed_checks ?? 0,
      ],
    );

  it("refuses an agent outside lite and natural, and a trace kind outside reply, nudge and replay", async () => {
    await expect(insertAutopilot("robot")).rejects.toMatchObject({ constraint: "ai_autopilot_agent_value" });
    await expect(insertTrace({ kind: "reply", agent: "robot" })).rejects.toMatchObject({
      constraint: "ai_turn_trace_agent_value",
    });
    await expect(insertTrace({ kind: "dream" })).rejects.toMatchObject({ constraint: "ai_turn_trace_kind_value" });
    await expect(insertTrace({ kind: "replay", cached_tokens: -1 })).rejects.toMatchObject({
      constraint: "ai_turn_trace_cached_tokens_value",
    });
    await expect(insertTrace({ kind: "replay", failed_checks: -1 })).rejects.toMatchObject({
      constraint: "ai_turn_trace_failed_checks_value",
    });
    // A replay of the natural agent passes the checks (and then meets its foreign keys).
    await expect(insertTrace({ kind: "replay", agent: "natural" })).rejects.toMatchObject({ code: "23503" });
  });
});
