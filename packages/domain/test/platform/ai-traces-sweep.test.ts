// The console's hourly sweep of the AI's turn traces: a trace past its 14 days goes with its file, a newer one stays; an
// erased customer's traces go at the next sweep and another customer's stay; a file already missing does not hold back
// its row; a file that will not delete keeps its row and fails the run with the count. The platform role may update and
// delete a trace, which the runtime role may not.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createIsolatedDatabase, type IsolatedDatabase } from "@travel-crm/db/testing";
import { createMemoryJobAdministration, createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { createTestOrganization } from "@travel-crm/db/testing";
import { createTestIdentity, type TestIdentity } from "../identity/test-identity.js";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { withdrawAiParts } from "../../src/ai/erasure.js";
import { organizationFolder } from "../../src/files/index.js";
import { traceKey } from "../../src/ai/traces/trace-file.js";
import {
  AiTracesSweepFailedError,
  createPlatformServices,
  type PlatformServices,
  sweepAiTraces,
} from "../../src/platform/index.js";

const DAY_MS = 86_400_000;
/** Digits from a random uuid: no two tests share a number. */
const digits = (count: number) =>
  BigInt(`0x${randomUUID().replaceAll("-", "")}`)
    .toString()
    .slice(0, count);
const NOW = new Date("2026-11-30T10:00:00Z");

describe("the hourly sweep of AI traces", () => {
  let isolated: IsolatedDatabase;
  let platform: PlatformClient;
  let db: Database;
  let identity: TestIdentity;
  let services: PlatformServices;
  const storage = createMemoryStorage();
  // The services' storage is this memory store; `test` keeps the names the tests read.
  const test = {
    get services() {
      return services;
    },
    storage,
  };
  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    platform = createPlatformClient(isolated.urls.platform);
    db = createDatabase(isolated.urls.runtime, { maxConnections: 2 });
    identity = createTestIdentity();
    services = createPlatformServices({
      platformDatabaseUrl: isolated.urls.platform,
      maxConnections: 2,
      db,
      identity: identity.identity,
      storage,
      queue: createMemoryJobQueue(),
      jobs: createMemoryJobAdministration(),
      logger: createMemoryLogger(),
    });
  }, 120_000);
  afterAll(async () => {
    await services.platformDb.disconnect();
    await db.disconnect();
    await platform.$disconnect();
    await identity.close();
    await isolated.drop();
  });

  /** A trace `ageDays` old on a chat, with its file; `leadId` names the lead it was about. */
  async function addTrace(organizationId: string, conversationId: string, ageDays: number, leadId?: string) {
    const id = randomUUID();
    const startedAt = new Date(NOW.getTime() - ageDays * DAY_MS);
    const fileKey = traceKey(organizationId, startedAt, id);
    await db.forOrg(organizationId, (tx) =>
      tx.aiTurnTrace.create({
        data: {
          id,
          conversationId,
          ...(leadId === undefined ? {} : { leadId }),
          startedAt,
          kind: "reply",
          outcome: "replied",
          inputTokens: 1,
          outputTokens: 1,
          durationMs: 1,
          promptVersions: {},
          fileKey,
          expiresAt: new Date(startedAt.getTime() + 14 * DAY_MS),
        },
      }),
    );
    await test.storage.put({ key: fileKey, contentType: "application/gzip", body: new Uint8Array([1]) });
    return { id, fileKey };
  }

  /** An agency with a chat for each of `phones` (each a person), in which a trace is kept `ageDays` old with its file. */
  async function agency(ages: readonly number[]) {
    const organizationId = await createTestOrganization(platform, "Trace agency");
    const chats = await db.forOrg(organizationId, async (tx) => {
      const connection = await tx.whatsappConnection.create({
        data: {
          integratedNumber: `91${digits(10)}`,
          displayNumber: "+910000000000",
          mode: "new_number",
          status: "disconnected",
        },
      });
      return Promise.all(
        ages.map(async () => {
          const phone = `+9198${digits(8)}`;
          const person = await tx.person.create({ data: { name: "Customer", phoneE164: phone } });
          const chat = await tx.whatsappConversation.create({
            data: { connectionId: connection.id, phoneE164: phone, personId: person.id },
          });
          return { chatId: chat.id, personId: person.id, phone };
        }),
      );
    });
    const traces = [];
    for (const [index, ageDays] of ages.entries()) {
      const chat = chats[index];
      traces.push({ ...(await addTrace(organizationId, chat?.chatId ?? "", ageDays)), ...chat });
    }
    return { organizationId, traces };
  }
  const rowsOf = (organizationId: string) => platform.aiTurnTrace.findMany({ where: { organizationId } });

  it("a trace past 14 days goes with its file; a newer one stays", async () => {
    const { organizationId, traces } = await agency([15, 3]);
    await sweepAiTraces(test.services, NOW);
    expect((await rowsOf(organizationId)).map((row) => row.id)).toEqual([traces[1]?.id]);
    expect(await test.storage.head(traces[0]?.fileKey ?? "")).toBeNull();
    expect(await test.storage.head(traces[1]?.fileKey ?? "")).not.toBeNull();
  });

  it("an erased customer's traces go at the next sweep and another customer's stay", async () => {
    const { organizationId, traces } = await agency([1, 1]);
    const [erased, kept] = traces;
    const withdrawn = await test.services.platformDb.transaction((tx) =>
      withdrawAiParts(tx, {
        organizationId,
        personId: erased?.personId ?? "",
        phones: [erased?.phone ?? ""],
        leadIds: [],
        now: NOW,
      }),
    );
    expect(withdrawn.traces).toBe(1);
    await sweepAiTraces(test.services, NOW);
    expect((await rowsOf(organizationId)).map((row) => row.id)).toEqual([kept?.id]);
    expect(await test.storage.head(erased?.fileKey ?? "")).toBeNull();
    expect(await test.storage.head(kept?.fileKey ?? "")).not.toBeNull();
  });

  it("erasure also marks a trace found only by its lead, and one on a chat held by phone alone", async () => {
    const { organizationId, traces } = await agency([1]);
    const leadId = randomUUID();
    const byLead = await addTrace(organizationId, traces[0]?.chatId ?? "", 1, leadId);
    const phone = `+9198${digits(8)}`;
    const chatId = await db.forOrg(organizationId, async (tx) => {
      const connection = await tx.whatsappConnection.findFirstOrThrow();
      const chat = await tx.whatsappConversation.create({ data: { connectionId: connection.id, phoneE164: phone } });
      return chat.id;
    });
    const byPhone = await addTrace(organizationId, chatId, 1);
    const withdraw = (input: { personId: string; phones: string[]; leadIds: string[] }) =>
      test.services.platformDb.transaction((tx) => withdrawAiParts(tx, { organizationId, now: NOW, ...input }));

    expect((await withdraw({ personId: randomUUID(), phones: [], leadIds: [leadId] })).traces).toBe(1);
    expect((await withdraw({ personId: randomUUID(), phones: [phone], leadIds: [] })).traces).toBe(1);
    await sweepAiTraces(test.services, NOW);
    expect((await rowsOf(organizationId)).map((row) => row.id)).toEqual([traces[0]?.id]);
    expect(await test.storage.head(byLead.fileKey)).toBeNull();
    expect(await test.storage.head(byPhone.fileKey)).toBeNull();
  });

  it("a missing file doesn't stop the row's deletion", async () => {
    const { organizationId, traces } = await agency([20]);
    await test.storage.delete(traces[0]?.fileKey ?? "");
    await sweepAiTraces(test.services, NOW);
    expect(await rowsOf(organizationId)).toHaveLength(0);
  });

  it("a delete that throws keeps its row and fails the run with the count", async () => {
    const { organizationId, traces } = await agency([20, 21]);
    const stuck = traces[0]?.fileKey ?? "";
    const real = test.storage.delete.bind(test.storage);
    test.storage.delete = (key) => (key === stuck ? Promise.reject(new TypeError("storage down")) : real(key));
    try {
      await expect(sweepAiTraces(test.services, NOW)).rejects.toThrow(AiTracesSweepFailedError);
      await expect(sweepAiTraces(test.services, NOW)).rejects.toThrow(/1 traces couldn't be swept/);
    } finally {
      test.storage.delete = real;
    }
    expect((await rowsOf(organizationId)).map((row) => row.id)).toEqual([traces[0]?.id]);
    await sweepAiTraces(test.services, NOW);
    expect(await rowsOf(organizationId)).toHaveLength(0);
  });

  it("a trace lives under the organization's folder", async () => {
    const { organizationId, traces } = await agency([1]);
    expect(traces[0]?.fileKey.startsWith(organizationFolder(organizationId))).toBe(true);
  });

  it("the platform role may change and delete a trace, which the runtime role may not", async () => {
    const { organizationId, traces } = await agency([1]);
    const id = traces[0]?.id ?? "";
    await platform.aiTurnTrace.update({ where: { id }, data: { expiresAt: NOW } });
    await platform.aiTurnTrace.delete({ where: { id } });
    expect(await rowsOf(organizationId)).toHaveLength(0);
  });
});
