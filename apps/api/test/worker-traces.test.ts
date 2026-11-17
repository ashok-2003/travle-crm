// The worker keeps each lite turn's trace: the autopilot's dependencies carry a sink on the worker's own storage, the
// process's tracing (Langfuse) when it has one, and its Langfuse prompts for the natural agent.
import { randomUUID } from "node:crypto";
import { startTrace } from "@travel-crm/domain/ai";
import { createMemoryPrompts } from "@travel-crm/integrations/prompts";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
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

  it("the autopilot's traces land as a row and a file in the worker's storage", async () => {
    const agency = await createTestAgency(server);
    const storage = createMemoryStorage();
    const model = { configured: true, complete: () => Promise.reject(new Error("not called")) };
    const dependencies = autopilotDependencies(
      {
        db: server.db,
        identity: server.identity,
        files: server.files,
        subscriptions: server.subscriptions,
        storage,
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
    const trace = {
      ...startTrace(
        { organizationId: agency.organizationId, conversationId, kind: "reply", token: randomUUID() },
        null,
        new Date(),
      ),
      outcome: "replied",
    };
    await dependencies.traces.record(trace);
    const rows = await server.db.forOrg(agency.organizationId, (tx) => tx.aiTurnTrace.findMany());
    expect(rows).toHaveLength(1);
    expect(await storage.head(rows[0]?.fileKey ?? "")).not.toBeNull();
  });

  it("the autopilot's turns are traced with the process's tracing, when it has one", () => {
    const model = { configured: true, complete: () => Promise.reject(new Error("not called")) };
    const base = {
      db: server.db,
      identity: server.identity,
      files: server.files,
      subscriptions: server.subscriptions,
      storage: createMemoryStorage(),
      logger: server.logger,
      managers: () => Promise.resolve([]),
    };
    const tracing = createMemoryTracing();
    expect(autopilotDependencies({ ...base, tracing }, model)).toMatchObject({ tracing });
    expect(autopilotDependencies(base, model)).not.toHaveProperty("tracing");
  });

  it("the natural agent's turns read their prompt from the process's Langfuse prompts, when it has them", () => {
    const model = { configured: true, complete: () => Promise.reject(new Error("not called")) };
    const base = {
      db: server.db,
      identity: server.identity,
      files: server.files,
      subscriptions: server.subscriptions,
      storage: createMemoryStorage(),
      logger: server.logger,
      managers: () => Promise.resolve([]),
    };
    const prompts = createMemoryPrompts();
    expect(autopilotDependencies({ ...base, prompts }, model)).toMatchObject({ prompts });
    expect(autopilotDependencies(base, model)).not.toHaveProperty("prompts");
  });

  it("gives the agent's turns the LangGraph tool agent and the turn rows", () => {
    const storage = createMemoryStorage();
    const dependencies = autopilotDependencies(
      {
        db: server.db,
        identity: server.identity,
        files: server.files,
        subscriptions: server.subscriptions,
        storage,
        logger: server.logger,
        managers: () => Promise.resolve([]),
      },
      { configured: true, complete: () => Promise.reject(new Error("not called")) },
    );
    expect(typeof dependencies.toolAgent.run).toBe("function");
    expect(dependencies.toolTurns).toBe(dependencies.traces);
  });
});
