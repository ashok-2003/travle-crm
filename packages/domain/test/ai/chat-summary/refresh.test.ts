// The chat summary's refresh against a real database: kept up to 30 messages past the point, written afresh past it,
// the point only moving forward, and a failed or uncounted call changing nothing.
import { randomUUID } from "node:crypto";
import { createMemoryAiModel, type MemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@travel-crm/db";
import { countAfter, linesAfter } from "../../../src/ai/chat-summary/lines.js";
import { refreshChatSummary } from "../../../src/ai/chat-summary/refresh.js";
import { EARLIER_AGENTS_UNTIL } from "../../../src/ai/natural/chat-lines.js";
import { countedModel } from "../../../src/ai/natural/counted-model.js";
import { MONTHLY_AI_LIMIT } from "../../../src/ai/usage.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";
import { aConnectedAgency, createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";
import { lead } from "../natural/fixtures.js";

const ZONE = "Asia/Kolkata";
const clock = { today: parseCalendarDate("2026-11-14"), timeZone: ZONE };
const MINUTE = 60_000;

describe("the chat summary's refresh", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  async function chat() {
    const { organizationId, connectionId } = await aConnectedAgency(test);
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const conversation = await inOrg((tx) =>
      tx.whatsappConversation.create({
        data: { connectionId, phoneE164: `+9199${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}` },
        select: { id: true },
      }),
    );
    let clockMinutes = 0;
    /** Adds `count` messages, one a minute after the last; returns the newest one's id and time. */
    async function add(count: number, over: Record<string, unknown> = {}) {
      let newest = { id: "", at: testNow };
      for (let n = 0; n < count; n += 1) {
        clockMinutes += 1;
        const at = new Date(testNow.getTime() - 100_000 * MINUTE + clockMinutes * MINUTE);
        const row = await inOrg((tx) =>
          tx.whatsappMessage.create({
            data: {
              conversationId: conversation.id,
              direction: "in",
              origin: "customer",
              kind: "text",
              body: `message ${String(clockMinutes)}`,
              wamid: randomUUID(),
              status: "received",
              occurredAt: at,
              ...over,
            },
            select: { id: true },
          }),
        );
        newest = { id: row.id, at };
      }
      return newest;
    }
    const model: MemoryAiModel = createMemoryAiModel();
    const call = countedModel(model, { db: test.db, organizationId, now: testNow, timeZone: ZONE });
    const refresh = (over: Partial<Parameters<typeof refreshChatSummary>[0]> = {}) =>
      refreshChatSummary(
        { db: test.db, call, ...over },
        {
          organizationId,
          conversationId: conversation.id,
          agencyName: "Sharma Holidays",
          lead,
          clock,
          now: testNow,
        },
      );
    const stored = () =>
      inOrg((tx) =>
        tx.aiChat.findUnique({
          where: { organizationId_conversationId: { organizationId, conversationId: conversation.id } },
        }),
      );
    return { organizationId, conversationId: conversation.id, inOrg, add, model, refresh, stored, call };
  }

  it("keeps the summary when 30 or fewer messages follow the point", async () => {
    const { add, model, refresh, stored } = await chat();
    await add(30);
    expect(await refresh()).toEqual({ kind: "kept", summary: { text: "", throughId: null, throughAt: null } });
    expect(model.requests).toHaveLength(0);
    expect(await stored()).toBeNull();
  });

  it("writes it afresh past 30 and moves the point to the newest message", async () => {
    const { add, model, refresh, stored } = await chat();
    const newest = await add(31);
    model.answer("  Customer: Asha\n  ");
    const step = await refresh();
    expect(step).toEqual({
      kind: "refreshed",
      summary: { text: "Customer: Asha", throughId: newest.id, throughAt: newest.at },
    });
    expect(await stored()).toMatchObject({
      chatSummary: "Customer: Asha",
      chatSummaryThroughId: newest.id,
      chatSummaryThroughAt: newest.at,
    });
    expect(model.requests[0]).toMatchObject({
      feature: "sales_agent",
      maxTokens: 1_500,
      reasoning: { effort: "minimal" },
      timeoutMs: 60_000,
    });
    // The next call asks for nothing until 31 more follow.
    await add(30);
    expect((await refresh()).kind).toBe("kept");
  });

  it("starts from the lite summary when there is no point", async () => {
    const { add, model, refresh, inOrg, conversationId } = await chat();
    await add(31);
    await inOrg((tx) => tx.aiChat.create({ data: { conversationId, summary: "Wants Kedarkantha in December." } }));
    model.answer("Wants: Kedarkantha");
    await refresh();
    expect(model.requests[0]?.messages.at(-1)?.content).toContain("Previous notes:\nWants Kedarkantha in December.");
  });

  it("gives the model every line whole, the earlier system's figures and dates included, with the lead card", async () => {
    const { add, model, refresh } = await chat();
    await add(30);
    await add(1, {
      direction: "out",
      origin: "automation",
      body: "Total ₹12,999 for 20 Dec",
      clientToken: "ai:old",
      occurredAt: new Date(EARLIER_AGENTS_UNTIL.getTime() - 10 * MINUTE),
    });
    await add(1, { kind: "audio", body: null, aiText: "I want to book", aiTextKind: "transcript" });
    model.answer("notes");
    await refresh();
    const sent = model.requests[0]?.messages;
    expect(sent?.[0]?.content).toContain("# Chat summary for Sharma Holidays");
    const user = sent?.at(-1)?.content ?? "";
    expect(user).toContain("Customer, ");
    expect(user).toMatch(/Earlier system, [^\n]*: Total ₹12,999 for 20 Dec/);
    expect(user).toContain('[voice note] heard: "I want to book"');
    expect(user).toContain("Previous notes:\nnone");
    expect(user).toContain("The lead card now:\n<lead>");
  });

  it("reads at most the newest 400 and keeps 4,000 characters", async () => {
    const { add, model, refresh, stored } = await chat();
    await add(401);
    model.answer("word ".repeat(1_000));
    const step = await refresh();
    const user = model.requests[0]?.messages.at(-1)?.content ?? "";
    expect(user).not.toContain(": message 1\n");
    expect(user).toContain(": message 2\n");
    expect(user).toContain(": message 401\n");
    expect(step.summary.text.length).toBeLessThanOrEqual(4_000);
    expect((await stored())?.chatSummary.length).toBeLessThanOrEqual(4_000);
  });

  it("never moves the point back when two refreshes race", async () => {
    const { add, model, refresh, stored, call } = await chat();
    await add(31);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    // The first refresh's model call waits until the second has finished.
    const slow = refresh({
      call: async (request) => {
        await held;
        return call(request);
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const newest = await add(31);
    model.answer("later notes", "earlier notes");
    await refresh();
    release();
    await slow;
    expect(await stored()).toMatchObject({ chatSummary: "later notes", chatSummaryThroughId: newest.id });
  });

  it("keeps the old summary and point when the model fails or the month is full", async () => {
    const { add, model, refresh, stored, inOrg } = await chat();
    const first = await add(31);
    model.answer("Customer: Asha");
    await refresh();
    await add(31);
    model.answer({ ok: false, reason: "unavailable" });
    expect(await refresh()).toMatchObject({
      kind: "failed",
      reason: "unavailable",
      summary: { text: "Customer: Asha", throughId: first.id },
    });
    model.answer("   ");
    expect(await refresh()).toMatchObject({ kind: "failed", reason: "empty" });
    await inOrg((tx) => tx.aiUsage.updateMany({ data: { calls: MONTHLY_AI_LIMIT } }));
    expect(await refresh()).toMatchObject({ kind: "failed", reason: "limit" });
    expect(await stored()).toMatchObject({ chatSummary: "Customer: Asha", chatSummaryThroughId: first.id });
  });

  it("names the team member who wrote a line, and keeps Team for one who has left", async () => {
    const { add, model, refresh } = await chat();
    const amit = randomUUID();
    const gone = randomUUID();
    await add(30);
    await add(1, { direction: "out", origin: "staff_crm", body: "Rs 500 off", sentBy: amit });
    await add(1, { direction: "out", origin: "staff_crm", body: "Call you soon", sentBy: gone });
    model.answer("notes");
    const identity = { memberContacts: () => Promise.resolve([{ userId: amit, name: "Amit Rao", email: null }]) };
    await refresh({ identity });
    const user = model.requests[0]?.messages.at(-1)?.content ?? "";
    expect(user).toMatch(/Team \(Amit\), [^\n]*: Rs 500 off/);
    expect(user).toMatch(/\nTeam, [^\n]*: Call you soon/);
  });

  it("reads a message sent in the same instant as the point, by id", async () => {
    const { add, inOrg, conversationId } = await chat();
    const point = await add(1);
    await add(1, { occurredAt: point.at });
    expect(await inOrg((tx) => countAfter(tx, conversationId, point))).toBe(1);
    const { lines } = await inOrg((tx) => linesAfter(tx, conversationId, point));
    expect(lines).toHaveLength(1);
  });

  it("goes on with the old summary when the database fails", async () => {
    const { add, refresh } = await chat();
    await add(31);
    const db = { forOrg: () => Promise.reject(new Error("connection lost")) } as unknown as Database;
    expect(await refresh({ db })).toMatchObject({ kind: "failed", reason: "error" });
  });

  it("counts the call against the month", async () => {
    const { add, model, refresh, inOrg } = await chat();
    await add(31);
    model.answer("notes");
    await refresh();
    expect(await inOrg((tx) => tx.aiUsage.findFirstOrThrow())).toMatchObject({ calls: 1 });
  });
});
