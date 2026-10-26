// The automatic answers (sales inbox spec 6, owner decision 3 of 2026-10-26): a welcome, a keyword answer and an away message,
// written as "automation" (never as staff), never to someone who asked to stop or whose consent is withdrawn, at most once
// per chat per cooldown, and paused in a chat once a person has replied there.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AUTOMATION_COOLDOWN_MS,
  answerAutomatically,
  createKeywordReply,
  queueText,
  saveAutomation,
  sendQueued,
  recordWhatsappOptOut,
} from "../../src/inbox/index.js";
import { newUuidV7, systemActor } from "../../src/kernel/index.js";
import { listenerContext, memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestInbox,
} from "./support.js";

const HOUR = 3_600_000;
const never = { awayEnabled: false, awayMessage: "", welcomeEnabled: false, welcomeMessage: "" };
const closedAllWeek = { openFrom: 600, openUntil: 1140, openDays: [] as number[] };

describe("automatic answers", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /** An agency with the given automation; helpers to have the customer write and the answer decided. */
  async function agency(
    settings: Partial<Parameters<typeof saveAutomation>[2]> = {},
    keywords: Record<string, string> = {},
  ) {
    const connection = await aConnectedAgency(test);
    const member = memberOf(connection.organizationId);
    await test.db.forOrg(connection.organizationId, async (tx) => {
      await saveAutomation(tx, member, { ...never, ...closedAllWeek, ...settings });
      for (const [keyword, reply] of Object.entries(keywords)) await createKeywordReply(tx, member, { keyword, reply });
    });
    const customerNumber = freshPhone().replace("+", "");
    let first = true;
    /** The customer writes `text` at `at`; the automatic answer is decided as the worker would. */
    const writes = async (text: string, at: Date = testNow) => {
      await deliver(test, fromCustomer(connection, { customerNumber, text, ts: Math.floor(at.getTime() / 1000) }), at);
      const chat = await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappConversation.findFirstOrThrow());
      const message = await test.db.forOrg(connection.organizationId, (tx) =>
        tx.whatsappMessage.findFirstOrThrow({
          where: { direction: "in" },
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        }),
      );
      const firstEver = first;
      first = false;
      return test.db.forOrg(connection.organizationId, (tx) =>
        answerAutomatically(
          tx,
          {
            conversationId: chat.id,
            messageId: message.id,
            eventId: randomUUID(),
            firstEver,
            timeZone: "Asia/Kolkata",
          },
          at,
        ),
      );
    };
    const automaticMessages = () =>
      test.db.forOrg(connection.organizationId, (tx) =>
        tx.whatsappMessage.findMany({ where: { direction: "out" }, orderBy: { id: "asc" } }),
      );
    const chat = () => test.db.forOrg(connection.organizationId, (tx) => tx.whatsappConversation.findFirstOrThrow());
    return { connection, member, customerNumber, writes, automaticMessages, chat };
  }

  it("writes the welcome as automation, not as staff, and leaves the chat waiting for a person", async () => {
    const { writes, automaticMessages, chat } = await agency({ welcomeEnabled: true, welcomeMessage: "Welcome!" });
    expect(await writes("Hi")).toBe("welcome");
    const [message] = await automaticMessages();
    expect(message).toMatchObject({ origin: "automation", body: "Welcome!", sentBy: null, status: "queued" });
    expect((await chat()).needsReply).toBe(true);
  });

  it("welcomes a chat once: a second first-ever event for the same chat adds nothing", async () => {
    const { writes, automaticMessages } = await agency({ welcomeEnabled: true, welcomeMessage: "Welcome!" });
    await writes("Hi");
    await writes("Hello again", new Date(testNow.getTime() + 30 * HOUR));
    expect(await automaticMessages()).toHaveLength(1);
  });

  it("never answers a customer who writes STOP, however the agency set it up", async () => {
    const { writes, automaticMessages } = await agency(
      { welcomeEnabled: true, welcomeMessage: "Welcome!", awayEnabled: true, awayMessage: "We are closed" },
      { stop: "Sorry to hear that" },
    );
    expect(await writes("STOP")).toBe("none");
    expect(await automaticMessages()).toHaveLength(0);
  });

  it("answers nobody whose WhatsApp consent is withdrawn", async () => {
    const { writes, automaticMessages, connection } = await agency({}, { price: "Packages start at 30,000" });
    expect(await writes("price?")).toBe("keyword");
    const person = await test.db.forOrg(connection.organizationId, (tx) => tx.person.findFirstOrThrow());
    await test.db.forOrg(connection.organizationId, (tx) =>
      recordWhatsappOptOut(tx, systemActor(connection.organizationId), { personId: person.id, now: testNow }),
    );
    expect(await writes("price please", new Date(testNow.getTime() + 13 * HOUR))).toBe("none");
    expect(await automaticMessages()).toHaveLength(1);
  });

  it("answers a keyword at most once per cooldown per chat, and again after it", async () => {
    const { writes, automaticMessages } = await agency({}, { price: "Packages start at 30,000" });
    expect(await writes("What is the price?")).toBe("keyword");
    expect(await writes("price?", new Date(testNow.getTime() + HOUR))).toBe("none");
    expect(await automaticMessages()).toHaveLength(1);
    expect(await writes("and the price again", new Date(testNow.getTime() + AUTOMATION_COOLDOWN_MS + HOUR))).toBe(
      "keyword",
    );
    expect(await automaticMessages()).toHaveLength(2);
  });

  it("sends the away message once per cooldown per chat", async () => {
    const { writes, automaticMessages } = await agency({ awayEnabled: true, awayMessage: "We open at ten" });
    expect(await writes("Anyone there?")).toBe("away");
    expect(await writes("Hello??", new Date(testNow.getTime() + HOUR))).toBe("none");
    expect(await automaticMessages()).toHaveLength(1);
  });

  it("pauses in a chat once a person has replied there, until the cooldown passes", async () => {
    const { writes, automaticMessages, connection, member } = await agency({}, { price: "Packages start at 30,000" });
    await writes("hello");
    const chat = await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappConversation.findFirstOrThrow());
    await test.db.forOrg(connection.organizationId, (tx) =>
      queueText(
        tx,
        member,
        { conversationId: chat.id, clientToken: randomUUID(), text: "Hi, this is Asha" },
        { whatsappConfigured: true },
        new Date(testNow.getTime() + HOUR),
      ),
    );
    expect(await writes("price?", new Date(testNow.getTime() + 2 * HOUR))).toBe("none");
    expect(await automaticMessages()).toHaveLength(1);
    expect(await writes("price now?", new Date(testNow.getTime() + HOUR + AUTOMATION_COOLDOWN_MS + HOUR))).toBe(
      "keyword",
    );
  });

  it("does not send an automatic answer that was queued before the customer asked to stop", async () => {
    const { writes, automaticMessages, connection } = await agency({}, { price: "Packages start at 30,000" });
    expect(await writes("price?")).toBe("keyword");
    const [queued] = await automaticMessages();
    const person = await test.db.forOrg(connection.organizationId, (tx) => tx.person.findFirstOrThrow());
    await test.db.forOrg(connection.organizationId, (tx) =>
      recordWhatsappOptOut(tx, systemActor(connection.organizationId), { personId: person.id, now: testNow }),
    );
    const outcome = await sendQueued(
      {
        provider: test.provider,
        files: test.files,
        limiter: test.dependencies.limiter,
        logger: test.logger,
        managers: test.dependencies.managers,
      },
      listenerContext(test, connection.organizationId),
      { id: newUuidV7(), messageId: queued?.id ?? "" },
      new Date(testNow.getTime() + 60_000),
    );
    expect(outcome).toBe("failed");
    expect((await automaticMessages())[0]).toMatchObject({ status: "failed", failureCode: "opted_out" });
    expect(test.provider.sent).toHaveLength(0);
  });
});
