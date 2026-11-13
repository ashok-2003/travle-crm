// The trace sink against the real database and the memory storage: a row and a gzip file for each trace, the file
// holding no message text, a lost file keeping the turn, and the runtime role unable to change or delete a row.
import { gunzipSync } from "node:zlib";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTrace } from "../../../src/ai/lite/turn-trace.js";
import { TRACE_DAYS, readTraceFile, traceKey } from "../../../src/ai/traces/trace-file.js";
import { createTraceSink } from "../../../src/ai/traces/trace-sink.js";
import { aConnectedAgency, createTestInbox, type TestInbox } from "../../inbox/support.js";

describe("the trace sink", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function aTurn() {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const conversation = await test.db.forOrg(organizationId, (tx) =>
      tx.whatsappConversation.create({
        data: { connectionId: connection.connectionId, phoneE164: `+9198${String(Math.floor(Math.random() * 1e8))}` },
      }),
    );
    const trace = startTrace(
      { organizationId, conversationId: conversation.id, kind: "reply", token: "t" },
      null,
      new Date("2026-10-23T23:30:00Z"),
    );
    Object.assign(trace, {
      outcome: "replied",
      reason: "ok",
      move: "greet",
      stage: "exploring",
      model: "fake-model",
      inputTokens: 300,
      outputTokens: 40,
      durationMs: 1234,
      messageIds: ["m1", "m2"],
      understand: { blocks: { "Package index": "x" }, raw: "{}" },
      write: { blocks: { Moves: "y" }, raw: ["{}"] },
    });
    return { organizationId, trace };
  }

  it("a trace is a row and a gzip file", async () => {
    const { organizationId, trace } = await aTurn();
    const storage = createMemoryStorage();
    await createTraceSink({ db: test.db, storage, logger: createMemoryLogger() }).record(trace);
    const row = await test.db.forOrg(organizationId, (tx) =>
      tx.aiTurnTrace.findFirstOrThrow({ where: { id: trace.id } }),
    );
    expect(row).toMatchObject({
      outcome: "replied",
      reason: "ok",
      move: "greet",
      saleStage: "exploring",
      model: "fake-model",
      inputTokens: 300,
      outputTokens: 40,
      durationMs: 1234,
      kind: "reply",
    });
    expect(row.expiresAt.getTime()).toBe(trace.startedAt.getTime() + TRACE_DAYS * 86_400_000);
    expect(row.fileKey).toBe(traceKey(organizationId, trace.startedAt, trace.id));
    expect(row.fileKey.startsWith(`organizations/${organizationId}/ai-traces/2026-10-23/`)).toBe(true);
    const stored = await storage.get(row.fileKey);
    const raw = JSON.parse(gunzipSync(stored ?? new Uint8Array()).toString("utf8")) as { trace: object };
    expect(raw.trace).not.toHaveProperty("organizationId");
    const file = await readTraceFile(storage, row.fileKey);
    expect(file).toMatchObject({ version: 1, trace: { id: trace.id, outcome: "replied", durationMs: 1234 } });
    expect(file?.trace.startedAt).toEqual(trace.startedAt);
    expect(await readTraceFile(storage, "organizations/x/ai-traces/none.json.gz")).toBeNull();
  });

  it("the file holds message ids, not the messages", async () => {
    const { trace } = await aTurn();
    const storage = createMemoryStorage();
    await createTraceSink({ db: test.db, storage, logger: createMemoryLogger() }).record(trace);
    const file = await readTraceFile(storage, traceKey(trace.organizationId, trace.startedAt, trace.id));
    expect(file?.trace.messageIds).toEqual(["m1", "m2"]);
    expect(file?.trace.understand?.blocks).not.toHaveProperty("Messages");
    expect(file?.trace.write?.blocks).not.toHaveProperty("Messages");
  });

  it("a failed storage write keeps the turn", async () => {
    const { organizationId, trace } = await aTurn();
    const storage = createMemoryStorage();
    const logger = createMemoryLogger();
    const broken = { ...storage, put: () => Promise.reject(new TypeError("customer said hello")) };
    await expect(createTraceSink({ db: test.db, storage: broken, logger }).record(trace)).resolves.toBeUndefined();
    const rows = await test.db.forOrg(organizationId, (tx) => tx.aiTurnTrace.count({ where: { id: trace.id } }));
    expect(rows).toBe(1);
    const lines = logger.entries.filter((entry) => entry.event === "ai.trace-failed");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ level: "warn", traceId: trace.id });
    expect(JSON.stringify(logger.entries)).not.toContain("hello");
  });

  it("the runtime role can't change or delete a trace", async () => {
    const { organizationId, trace } = await aTurn();
    await createTraceSink({ db: test.db, storage: createMemoryStorage(), logger: createMemoryLogger() }).record(trace);
    await expect(
      test.db.forOrg(organizationId, (tx) =>
        tx.aiTurnTrace.update({ where: { id: trace.id }, data: { outcome: "x" } }),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      test.db.forOrg(organizationId, (tx) => tx.aiTurnTrace.delete({ where: { id: trace.id } })),
    ).rejects.toThrow(/permission denied/);
  });
});
