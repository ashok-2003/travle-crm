// The console's hourly sweep of the AI's turn traces: a trace past its 14 days goes with its file, a newer one stays; an
// erased customer's traces go at the next sweep and another customer's stay; a file already missing does not hold back
// its row; a file that will not delete keeps its row and fails the run with the count. The platform role may update and
// delete a trace, which the runtime role may not.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { withdrawAiParts } from "../../src/ai/erasure.js";
import { organizationFolder } from "../../src/files/index.js";
import { traceKey } from "../../src/ai/traces/trace-file.js";
import { AiTracesSweepFailedError, sweepAiTraces } from "../../src/platform/index.js";
import { createTestPlatform, type TestPlatform } from "./test-platform.js";

const DAY_MS = 86_400_000;
const NOW = new Date("2026-11-30T10:00:00Z");

describe("the hourly sweep of AI traces", () => {
  let test: TestPlatform;
  let platform: PlatformClient;
  let db: Database;
  beforeAll(() => {
    test = createTestPlatform();
    platform = createPlatformClient(inject("dbUrls").platform);
    db = createDatabase(inject("dbUrls").runtime, { maxConnections: 2 });
  });
  afterAll(async () => {
    await test.close();
    await platform.$disconnect();
    await db.disconnect();
  });

  /** An agency with a chat for each of `phones` (each a person), in which a trace is kept `ageDays` old with its file. */
  async function agency(ages: readonly number[]) {
    const organizationId = await createTestOrganization(platform, "Trace agency");
    const chats = await db.forOrg(organizationId, async (tx) => {
      const connection = await tx.whatsappConnection.create({
        data: {
          integratedNumber: `91${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`,
          displayNumber: "+910000000000",
          mode: "new_number",
          status: "disconnected",
        },
      });
      return Promise.all(
        ages.map(async () => {
          const phone = `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
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
      const id = randomUUID();
      const startedAt = new Date(NOW.getTime() - ageDays * DAY_MS);
      const fileKey = traceKey(organizationId, startedAt, id);
      await db.forOrg(organizationId, (tx) =>
        tx.aiTurnTrace.create({
          data: {
            id,
            conversationId: chat?.chatId ?? "",
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
      traces.push({ id, fileKey, ...chat });
    }
    return { organizationId, traces };
  }
  const rowsOf = (organizationId: string) => platform.aiTurnTrace.findMany({ where: { organizationId } });

  it("a trace past 14 days goes with its file; a newer one stays", async () => {
    const { organizationId, traces } = await agency([15, 3]);
    expect(await sweepAiTraces(test.services, NOW)).toBeGreaterThanOrEqual(1);
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
