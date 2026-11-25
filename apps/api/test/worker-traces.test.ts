// The worker keeps each agent turn's row: the autopilot's dependencies carry a sink of ai_turn_trace rows, the process's
// tracing (Langfuse) when it has one, its Langfuse prompts, and the LangGraph tool agent.
import { randomUUID } from "node:crypto";
import { createMemoryPrompts } from "@travel-crm/integrations/prompts";
import { createMemoryTracing } from "@travel-crm/integrations/tracing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { autopilotDependencies } from "../src/worker-jobs.js";
import { createTestAgency, createTestServer, type TestServer } from "./support/test-server.js";

describe("the worker's turn traces", () => {
  let server: TestServer;
  beforeAll(() => {
    server = createTestServer();
  });
  afterAll(() => server.close());

  it("the agent's turns land as rows of ai_turn_trace, with no file", async () => {
    const agency = await createTestAgency(server);
    const model = { configured: true, complete: () => Promise.reject(new Error("not called")) };
    const dependencies = autopilotDependencies(
      {
        db: server.db,
        identity: server.identity,
        files: server.files,
        subscriptions: server.subscriptions,
        logger: server.logger,
        managers: () => Promise.resolve([]),
      },
      model,
    );
    const conversationId = await server.db.forOrg(agency.organizationId, async (tx) => {
      const connection = await tx.whatsappConnection.create({
        data: {
          integratedNumber: `91${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`,
          displayNumber: "+910000000000",
          mode: "new_number",
          status: "disconnected",
        },
      });
      const chat = await tx.whatsappConversation.create({
        data: { connectionId: connection.id, phoneE164: `+9198${String(Math.floor(Math.random() * 1e8))}` },
      });
      return chat.id;
    });
    await dependencies.toolTurns.recordToolTurn({
      id: randomUUID(),
      organizationId: agency.organizationId,
      conversationId,
      leadId: null,
      kind: "reply",
      startedAt: new Date(),
      durationMs: 900,
      outcome: "replied",
      reason: null,
      model: "fake-model",
      inputTokens: 10,
      outputTokens: 5,
      cachedTokens: 0,
      failedChecks: 0,
      promptVersions: { "real-agent": 0 },
    });
    const rows = await server.db.forOrg(agency.organizationId, (tx) => tx.aiTurnTrace.findMany());
    expect(rows).toMatchObject([{ agent: "one", outcome: "replied", fileKey: null }]);
  });

  it("the autopilot's turns are traced with the process's tracing, when it has one", () => {
    const model = { configured: true, complete: () => Promise.reject(new Error("not called")) };
    const base = {
      db: server.db,
      identity: server.identity,
      files: server.files,
      subscriptions: server.subscriptions,
      logger: server.logger,
      managers: () => Promise.resolve([]),
    };
    const tracing = createMemoryTracing();
    expect(autopilotDependencies({ ...base, tracing }, model)).toMatchObject({ tracing });
    expect(autopilotDependencies(base, model)).not.toHaveProperty("tracing");
  });

  it("the agent's turns read their prompt from the process's Langfuse prompts, when it has them", () => {
    const model = { configured: true, complete: () => Promise.reject(new Error("not called")) };
    const base = {
      db: server.db,
      identity: server.identity,
      files: server.files,
      subscriptions: server.subscriptions,
      logger: server.logger,
      managers: () => Promise.resolve([]),
    };
    const prompts = createMemoryPrompts();
    expect(autopilotDependencies({ ...base, prompts }, model)).toMatchObject({ prompts });
    expect(autopilotDependencies(base, model)).not.toHaveProperty("prompts");
  });

  it("gives the agent's turns the LangGraph tool agent and the turn rows", () => {
    const dependencies = autopilotDependencies(
      {
        db: server.db,
        identity: server.identity,
        files: server.files,
        subscriptions: server.subscriptions,
        logger: server.logger,
        managers: () => Promise.resolve([]),
      },
      { configured: true, complete: () => Promise.reject(new Error("not called")) },
    );
    expect(typeof dependencies.toolAgent.run).toBe("function");
    expect(typeof dependencies.toolTurns.recordToolTurn).toBe("function");
  });
});
