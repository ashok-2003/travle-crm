// The trace sink against the real database: a row of ai_turn_trace for each one agent turn, its agent one, no file, and
// due in 14 days (at once for a chat already erased); a lost row is a warning, never the turn's failure; the runtime role
// can't change or delete a row.
import { randomUUID } from "node:crypto";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTraceSink, TRACE_DAYS } from "../../../src/ai/traces/trace-sink.js";
import { aConnectedAgency, createTestInbox, type TestInbox } from "../../inbox/support.js";

describe("the trace sink", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function aToolTurn() {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const conversation = await test.db.forOrg(organizationId, (tx) =>
      tx.whatsappConversation.create({
        data: { connectionId: connection.connectionId, phoneE164: `+9198${String(Math.floor(Math.random() * 1e8))}` },
      }),
    );
    return {
      organizationId,
      turn: {
        id: randomUUID(),
        organizationId,
        conversationId: conversation.id,
        leadId: null,
        kind: "reply" as const,
        startedAt: new Date("2026-10-23T23:30:00Z"),
        durationMs: 700,
        outcome: "replied",
        reason: null,
        model: "m1",
        inputTokens: 120,
        outputTokens: 12,
        cachedTokens: 60,
        failedChecks: 2,
        promptVersions: { "real-agent": 4 },
      },
    };
  }
  const sink = () => createTraceSink({ db: test.db, logger: createMemoryLogger() });

  it("keeps a one turn's row alone, its agent one, its refusals counted, due in 14 days", async () => {
    const { organizationId, turn } = await aToolTurn();
    await sink().recordToolTurn(turn);
    const row = await test.db.forOrg(organizationId, (tx) =>
      tx.aiTurnTrace.findFirstOrThrow({ where: { id: turn.id } }),
    );
    expect(row).toMatchObject({
      agent: "one",
      kind: "reply",
      outcome: "replied",
      model: "m1",
      move: null,
      saleStage: null,
      inputTokens: 120,
      outputTokens: 12,
      cachedTokens: 60,
      failedChecks: 2,
      durationMs: 700,
      promptVersions: { "real-agent": 4 },
      // The row alone: Langfuse holds the turn's detail.
      fileKey: null,
    });
    expect(row.expiresAt.getTime()).toBe(turn.startedAt.getTime() + TRACE_DAYS * 86_400_000);
  });

  it("a turn recorded for a chat already erased is due at once", async () => {
    const { organizationId, turn } = await aToolTurn();
    await test.db.forOrg(organizationId, (tx) =>
      tx.whatsappConversation.update({ where: { id: turn.conversationId }, data: { state: "erased" } }),
    );
    await sink().recordToolTurn(turn);
    const row = await test.db.forOrg(organizationId, (tx) =>
      tx.aiTurnTrace.findFirstOrThrow({ where: { id: turn.id } }),
    );
    expect(row.expiresAt).toEqual(turn.startedAt);
  });

  it("loses a one turn's trace with a warning and never fails the turn", async () => {
    const { turn } = await aToolTurn();
    const logger = createMemoryLogger();
    // A chat that doesn't exist: the row's insert fails.
    const lost = { ...turn, conversationId: randomUUID() };
    await expect(createTraceSink({ db: test.db, logger }).recordToolTurn(lost)).resolves.toBeUndefined();
    const lines = logger.entries.filter((entry) => entry.event === "ai.trace-failed");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: "warn", traceId: turn.id });
  });

  it("the runtime role can't change or delete a trace", async () => {
    const { organizationId, turn } = await aToolTurn();
    await sink().recordToolTurn(turn);
    await expect(
      test.db.forOrg(organizationId, (tx) => tx.aiTurnTrace.update({ where: { id: turn.id }, data: { outcome: "x" } })),
    ).rejects.toThrow(/permission denied/);
    await expect(
      test.db.forOrg(organizationId, (tx) => tx.aiTurnTrace.delete({ where: { id: turn.id } })),
    ).rejects.toThrow(/permission denied/);
  });
});
