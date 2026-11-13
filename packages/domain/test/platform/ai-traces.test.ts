// The console's lite-agent turn traces: listed and opened for super admins, kept turns only (14 days, customer not
// erased), their messages read as kept now from their own chat, and each opening written in the platform log.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createIsolatedDatabase, createTestOrganization, type IsolatedDatabase } from "@travel-crm/db/testing";
import { createMemoryJobAdministration, createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { asOrganization } from "@travel-crm/db/platform";
import { traceMessages } from "../../src/ai/index.js";
import { withdrawAiParts } from "../../src/ai/erasure.js";
import { startTrace } from "../../src/ai/lite/turn-trace.js";
import { promptVersions } from "../../src/ai/lite/prompts/library.js";
import { readTraceFile } from "../../src/ai/traces/trace-file.js";
import { createTraceSink } from "../../src/ai/traces/trace-sink.js";
import { withdrawWhatsApp } from "../../src/inbox/index.js";
import {
  createPlatformServices,
  listAiTraces,
  listPlatformLog,
  openAiTrace,
  type PlatformServices,
} from "../../src/platform/index.js";
import { createTestIdentity, type TestIdentity } from "../identity/test-identity.js";

const NOW = new Date("2026-11-30T10:00:00Z");
const HOUR = 3_600_000;
const admin = { userId: randomUUID() };
const digits = (count: number) =>
  BigInt(`0x${randomUUID().replaceAll("-", "")}`)
    .toString()
    .slice(0, count);

describe("the console's AI turn traces", () => {
  let isolated: IsolatedDatabase;
  let platform: PlatformClient;
  let db: Database;
  let identity: TestIdentity;
  let services: PlatformServices;
  const storage = createMemoryStorage();
  const logger = createMemoryLogger();

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
      logger,
      aiPrices: { inputPaisePerMillion: 2_500, outputPaisePerMillion: 10_000 },
    });
  }, 120_000);
  afterAll(async () => {
    await services.platformDb.disconnect();
    await db.disconnect();
    await platform.$disconnect();
    await identity.close();
    await isolated.drop();
  });

  /** An agency with two chats (A and B), each a person, each with an in, an AI and a team message. */
  async function agency() {
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
      const made = [];
      for (const label of ["A", "B"]) {
        const phone = `+9198${digits(8)}`;
        const person = await tx.person.create({ data: { name: `Customer ${label}`, phoneE164: phone } });
        const chat = await tx.whatsappConversation.create({
          data: { connectionId: connection.id, phoneE164: phone, personId: person.id },
        });
        const message = (n: number, direction: string, clientToken: string | null, body: string) =>
          tx.whatsappMessage.create({
            data: {
              conversationId: chat.id,
              direction,
              origin: direction === "in" ? "customer" : "staff_crm",
              kind: "text",
              body,
              status: direction === "in" ? "received" : "sent",
              clientToken,
              occurredAt: new Date(NOW.getTime() - (10 - n) * HOUR),
            },
          });
        const first = await message(1, "in", null, `${label}: Hi, kedarnath please`);
        const second = await message(2, "out", `ai:${first.id}`, `${label}: Hello! Which dates?`);
        const third = await message(3, "out", `staff-${randomUUID()}`, `${label}: Team here`);
        made.push({ chatId: chat.id, personId: person.id, phone, messageIds: [first.id, second.id, third.id] });
      }
      return made;
    });
    const [a, b] = chats;
    if (a === undefined || b === undefined) throw new Error("two chats expected");
    return { organizationId, a, b };
  }

  /** A kept turn on a chat, started `hoursAgo` before NOW, through the real sink. */
  async function aTurn(
    organizationId: string,
    chat: { chatId: string; messageIds: string[] },
    hoursAgo: number,
    extra: Partial<ReturnType<typeof startTrace>> = {},
  ) {
    const trace = startTrace(
      { organizationId, conversationId: chat.chatId, kind: "reply", token: "t" },
      null,
      new Date(NOW.getTime() - hoursAgo * HOUR),
    );
    Object.assign(trace, {
      outcome: "replied",
      reason: "ok",
      move: "greet",
      stage: "exploring",
      model: "fake-model",
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      durationMs: 900,
      intents: ["hello"],
      messageIds: chat.messageIds.slice(0, 2),
      understand: { blocks: { Agency: "Hills Travel", "Lead card": "none" }, raw: '{"intents":["hello"]}' },
      lookups: [
        {
          request: { tool: "find_packages", words: "kedarnath" },
          result: { tool: "find_packages", words: "kedarnath", exact: [], closest: [] },
        },
      ],
      checks: [{ name: "no_price", passed: true, detail: null }],
      write: { blocks: { You: "Asha", Move: "greet" }, raw: ['{"text":"Hello"}'] },
      sent: { messageIds: [chat.messageIds[1]], text: "Hello! Which dates?" },
      actions: ["lead:adults"],
      ...extra,
    });
    await createTraceSink({ db, storage, logger }).record(trace);
    return trace;
  }

  const logOf = (organizationId: string) =>
    services.platformDb.transaction((tx) => listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 100 }));
  const opened = async (organizationId: string) =>
    (await logOf(organizationId)).entries.filter((entry) => entry.action === "ai-trace.opened");

  it("lists the kept turns newest first, one chat's when asked, priced", async () => {
    const { organizationId, a, b } = await agency();
    const [one, two, three] = [
      await aTurn(organizationId, a, 1),
      await aTurn(organizationId, a, 2),
      await aTurn(organizationId, a, 3),
    ];
    const other = await aTurn(organizationId, b, 0.5);
    const all = await listAiTraces(services, { organizationId, limit: 50 }, NOW);
    expect(all.traces.map((row) => row.id)).toEqual([other.id, one.id, two.id, three.id]);
    expect(all.priced).toBe(true);
    expect(all.traces[0]).toMatchObject({
      costPaise: 7_500,
      kind: "reply",
      outcome: "replied",
      saleStage: "exploring",
    });
    const mine = await listAiTraces(services, { organizationId, conversationId: a.chatId, limit: 50 }, NOW);
    expect(mine.traces.map((row) => row.id)).toEqual([one.id, two.id, three.id]);

    const unpriced = createPlatformServices({
      platformDatabaseUrl: isolated.urls.platform,
      maxConnections: 1,
      db,
      identity: identity.identity,
      storage,
      queue: createMemoryJobQueue(),
      jobs: createMemoryJobAdministration(),
      logger,
    });
    try {
      const page = await listAiTraces(unpriced, { organizationId, limit: 50 }, NOW);
      expect(page.priced).toBe(false);
      expect(page.traces.every((row) => row.costPaise === null)).toBe(true);
    } finally {
      await unpriced.platformDb.disconnect();
    }
  });

  it("pages with a cursor", async () => {
    const { organizationId, a, b } = await agency();
    const made = [
      await aTurn(organizationId, a, 1),
      await aTurn(organizationId, a, 2),
      await aTurn(organizationId, b, 3),
      await aTurn(organizationId, b, 4),
    ];
    const first = await listAiTraces(services, { organizationId, limit: 2 }, NOW);
    expect(first.traces.map((row) => row.id)).toEqual([made[0]?.id, made[1]?.id]);
    expect(first.nextCursor).not.toBeNull();
    const next = await listAiTraces(services, { organizationId, limit: 2, cursor: first.nextCursor ?? "" }, NOW);
    expect(next.traces.map((row) => row.id)).toEqual([made[2]?.id, made[3]?.id]);
    expect(next.nextCursor).toBeNull();
  });

  it("a trace past 14 days is neither listed nor opened", async () => {
    const { organizationId, a } = await agency();
    const old = await aTurn(organizationId, a, 15 * 24);
    expect((await listAiTraces(services, { organizationId, limit: 50 }, NOW)).traces).toEqual([]);
    await expect(openAiTrace(services, admin, { organizationId, traceId: old.id }, NOW)).rejects.toMatchObject({
      reason: "AI_TRACE_NOT_FOUND",
      code: "NOT_FOUND",
    });
    expect(await opened(organizationId)).toEqual([]);
  });

  it("an erased customer's turns are gone at once", async () => {
    const { organizationId, a, b } = await agency();
    const erased = await aTurn(organizationId, a, 1);
    const kept = await aTurn(organizationId, b, 1);
    await services.platformDb.transaction(async (tx) => {
      await withdrawAiParts(tx, { organizationId, personId: a.personId, phones: [a.phone], leadIds: [], now: NOW });
      await withdrawWhatsApp(tx, { organizationId, personId: a.personId, phones: [a.phone], now: NOW });
    });
    expect((await listAiTraces(services, { organizationId, limit: 50 }, NOW)).traces.map((row) => row.id)).toEqual([
      kept.id,
    ]);
    await expect(openAiTrace(services, admin, { organizationId, traceId: erased.id }, NOW)).rejects.toMatchObject({
      reason: "AI_TRACE_NOT_FOUND",
    });
    expect((await openAiTrace(services, admin, { organizationId, traceId: kept.id }, NOW)).trace.id).toBe(kept.id);

    // Only the chat's state says erased: its trace's expires_at is untouched, and it is refused the same way.
    const { organizationId: org2, a: chat } = await agency();
    const turn = await aTurn(org2, chat, 1);
    await db.forOrg(org2, (tx) =>
      tx.whatsappConversation.update({ where: { id: chat.chatId }, data: { state: "erased" } }),
    );
    expect((await listAiTraces(services, { organizationId: org2, limit: 50 }, NOW)).traces).toEqual([]);
    await expect(openAiTrace(services, admin, { organizationId: org2, traceId: turn.id }, NOW)).rejects.toMatchObject({
      reason: "AI_TRACE_NOT_FOUND",
    });
  });

  it("opening reads the file and the chat's messages as kept now, and logs it", async () => {
    const { organizationId, a } = await agency();
    const trace = await aTurn(organizationId, a, 1);
    const detail = await openAiTrace(services, admin, { organizationId, traceId: trace.id }, NOW);
    expect(detail.priced).toBe(true);
    expect(detail.trace.id).toBe(trace.id);
    expect(detail.file?.understand?.blocks.map((block) => block.title)).toEqual(["Agency", "Lead card"]);
    expect(detail.file?.understand?.answer).toBe('{"intents":["hello"]}');
    expect(detail.file?.messages.map((message) => [message.from, message.text])).toEqual([
      ["customer", "A: Hi, kedarnath please"],
      ["you", "A: Hello! Which dates?"],
    ]);
    expect(detail.file?.messagesGone).toBe(0);
    expect(detail.file?.sent.messages.map((message) => message.text)).toEqual(["A: Hello! Which dates?"]);
    expect(detail.file?.lookups[0]?.result).toBe(
      JSON.stringify({ tool: "find_packages", words: "kedarnath", exact: [], closest: [] }, null, 2),
    );
    expect(detail.file?.write?.answers).toEqual(['{"text":"Hello"}']);
    expect(detail.file?.actions).toEqual(["lead:adults"]);
    const log = await opened(organizationId);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      action: "ai-trace.opened",
      actorUserId: admin.userId,
      targetType: "ai_turn_trace",
      targetId: trace.id,
      targetOrganizationId: organizationId,
      before: null,
      after: null,
    });
  });

  it("a message of another chat is never shown", async () => {
    const { organizationId, a, b } = await agency();
    const trace = await aTurn(organizationId, a, 1, {
      messageIds: [a.messageIds[0] ?? "", b.messageIds[0] ?? "", "m1"],
    });
    const detail = await openAiTrace(services, admin, { organizationId, traceId: trace.id }, NOW);
    expect(detail.file?.messages.map((message) => message.id)).toEqual([a.messageIds[0]]);
    expect(detail.file?.messagesGone).toBe(2);
  });

  it("a missing file gives the row and no file", async () => {
    const { organizationId, a } = await agency();
    const trace = await aTurn(organizationId, a, 1);
    const row = await db.forOrg(organizationId, (tx) => tx.aiTurnTrace.findFirstOrThrow({ where: { id: trace.id } }));
    await storage.delete(row.fileKey);
    expect(await readTraceFile(storage, row.fileKey)).toBeNull();
    const detail = await openAiTrace(services, admin, { organizationId, traceId: trace.id }, NOW);
    expect(detail.file).toBeNull();
    expect(detail.trace.id).toBe(trace.id);
    expect(await opened(organizationId)).toHaveLength(1);
  });

  it("a turn on an older prompt names both versions", async () => {
    const { organizationId, a } = await agency();
    const current = promptVersions()["understand.instructions"];
    const trace = await aTurn(organizationId, a, 1, {
      promptVersions: { "understand.instructions": current, "old.piece": 3 } as never,
    });
    const detail = await openAiTrace(services, admin, { organizationId, traceId: trace.id }, NOW);
    expect(detail.file?.promptVersions).toEqual([
      { name: "understand.instructions", used: current, current },
      { name: "old.piece", used: 3, current: null },
    ]);
  });

  it("another organization's trace is not found, and an unknown organization is refused", async () => {
    const mine = await agency();
    const theirs = await agency();
    const trace = await aTurn(theirs.organizationId, theirs.a, 1);
    await expect(
      openAiTrace(services, admin, { organizationId: mine.organizationId, traceId: trace.id }, NOW),
    ).rejects.toMatchObject({ reason: "AI_TRACE_NOT_FOUND" });
    await expect(
      openAiTrace(services, admin, { organizationId: randomUUID(), traceId: trace.id }, NOW),
    ).rejects.toMatchObject({ reason: "ORGANIZATION_NOT_FOUND" });
    await expect(listAiTraces(services, { organizationId: randomUUID(), limit: 5 }, NOW)).rejects.toMatchObject({
      reason: "ORGANIZATION_NOT_FOUND",
    });
    expect(await opened(mine.organizationId)).toEqual([]);
  });

  it("a platform job without a user cannot open a trace", async () => {
    const { organizationId, a } = await agency();
    const trace = await aTurn(organizationId, a, 1);
    await expect(openAiTrace(services, { userId: null }, { organizationId, traceId: trace.id }, NOW)).rejects.toThrow(
      RangeError,
    );
  });

  it("a message of another chat or a non-uuid id is never shown as sent, and every gone id is counted", async () => {
    const { organizationId, a, b } = await agency();
    const trace = await aTurn(organizationId, a, 1, {
      messageIds: [a.messageIds[0] ?? ""],
      sent: { messageIds: [a.messageIds[1] ?? "", b.messageIds[1] ?? "", "not-a-uuid"], text: "x" },
    });
    const detail = await openAiTrace(services, admin, { organizationId, traceId: trace.id }, NOW);
    expect(detail.file?.sent.messages.map((message) => message.id)).toEqual([a.messageIds[1]]);
    expect(detail.file?.messagesGone).toBe(2);
  });

  it("messages of a chat erased after the row was found are not read", async () => {
    const { organizationId, a } = await agency();
    const read = () =>
      services.platformDb.transaction((tx) =>
        asOrganization(tx, organizationId, (orgTx) => traceMessages(orgTx, a.chatId, a.messageIds)),
      );
    expect(await read()).toHaveLength(3);
    await db.forOrg(organizationId, (tx) =>
      tx.whatsappConversation.update({ where: { id: a.chatId }, data: { state: "erased" } }),
    );
    expect(await read()).toEqual([]);
  });

  it("a storage outage on the file gives the row and no file, and the opening is logged once", async () => {
    const { organizationId, a } = await agency();
    const trace = await aTurn(organizationId, a, 1);
    const real = storage.get.bind(storage);
    storage.get = () => Promise.reject(new TypeError("storage down"));
    try {
      const detail = await openAiTrace(services, admin, { organizationId, traceId: trace.id }, NOW);
      expect(detail).toMatchObject({ file: null, trace: { id: trace.id } });
    } finally {
      storage.get = real;
    }
    expect(await opened(organizationId)).toHaveLength(1);
    expect(JSON.stringify(logger.entries)).not.toContain("Hi, kedarnath");
  });

  it("a cursor whose turn was swept is refused, and one only erased still pages", async () => {
    const { organizationId, a, b } = await agency();
    const made = [
      await aTurn(organizationId, a, 1),
      await aTurn(organizationId, a, 2),
      await aTurn(organizationId, b, 3),
    ];
    const first = await listAiTraces(services, { organizationId, limit: 1 }, NOW);
    expect(first.nextCursor).toBe(made[0]?.id);
    await db.forOrg(organizationId, (tx) =>
      tx.whatsappConversation.update({ where: { id: a.chatId }, data: { state: "erased" } }),
    );
    const rest = await listAiTraces(services, { organizationId, limit: 5, cursor: made[0]?.id ?? "" }, NOW);
    expect(rest.traces.map((row) => row.id)).toEqual([made[2]?.id]);
    await platform.aiTurnTrace.delete({ where: { id: made[0]?.id ?? "" } });
    await expect(
      listAiTraces(services, { organizationId, limit: 5, cursor: made[0]?.id ?? "" }, NOW),
    ).rejects.toMatchObject({ code: "NOT_FOUND", reason: "AI_TRACE_CURSOR_GONE" });
  });
});
