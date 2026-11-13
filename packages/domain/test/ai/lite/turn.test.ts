// The lite agent's whole turn against the real database, dispatched by runAgentTurn: Understand, decide, Write and act
// with a scripted model, the gates that stop it before any call, what it logs, and the trace it hands to the sink.
import { randomUUID } from "node:crypto";
import { withoutAmountsAndDates } from "@travel-crm/contracts/ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inventedSpans } from "../../../src/ai/bench/rubric.js";
import { fixedText } from "../../../src/ai/lite/fixed-texts.js";
import { promptVersions } from "../../../src/ai/lite/prompts/library.js";
import { runLiteTurn } from "../../../src/ai/lite/turn.js";
import type { LiteTrace } from "../../../src/ai/lite/types.js";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { createMemoryStorage } from "@travel-crm/integrations/storage";
import { gunzipSync } from "node:zlib";
import { readTraceFile } from "../../../src/ai/traces/trace-file.js";
import { createTraceSink } from "../../../src/ai/traces/trace-sink.js";
import { formatRupees } from "../../../src/kernel/index.js";
import { createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";
import { countingDatabase } from "./support/counting-db.js";
import { liteAgency } from "./support/lite-agency.js";
import {
  at,
  calls,
  greeting,
  newestIn,
  outbound,
  says,
  understood,
  withFacts,
  written,
  type Agency,
} from "./support/turn-script.js";

describe("the lite agent's turn", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("hi gets the packages", async () => {
    const on = await liteAgency(test);
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    expect(await on.turn()).toBe("replied");
    const sent = await outbound(on);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.clientToken).toBe(`ai:${on.message.id}`);
    expect(sent[0]?.body).toContain("Kedarnath Yatra 4N");
    expect(sent[0]?.body).toContain(formatRupees(599_900));
    expect(on.model.requests[0]?.schema?.name).toBe("understand_form");
    expect(on.model.requests[1]?.schema?.name).toBe("write_move");
    const lead = await on.inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: on.leadId } }));
    expect(lead.stage).toBe("contacted");
    const moved = await on.inOrg((tx) =>
      tx.leadTimelineEntry.findFirstOrThrow({ where: { leadId: on.leadId, kind: "stage-changed" } }),
    );
    expect(moved).toMatchObject({ stage: "contacted", byAi: true });
    expect(await calls(on)).toBe(2);
  });

  it("a price question gets the price in code's words", async () => {
    const on = await liteAgency(test);
    await withFacts(on, { packageId: on.packageId, lastMove: "greet" });
    const token = await says(on, "price for kedarnath on 14 nov, 2 people, double?", 30);
    on.model.answer(
      understood([["price_question", "price for kedarnath"]], {
        details: {
          package: { name: "Kedarnath Yatra 4N", proof: "price for kedarnath", changed: false },
          date: { day: "2026-11-14", month: null, proof: "14 nov", changed: false },
          adults: { count: 2, proof: "2 people", changed: false },
          room: { type: "double", proof: "double", changed: false },
        },
      }),
      written("Which city will you join us from?"),
    );
    expect(await on.turn(at(60), { token })).toBe("replied");
    const sent = await outbound(on);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toContain(formatRupees(1_399_800));
    expect(sent[0]?.body).toContain(formatRupees(400_000));
    expect(sent[0]?.body).toContain("Which city will you join us from?");
    const lead = await on.inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: on.leadId } }));
    expect(lead).toMatchObject({ stage: "quote_sent", adults: 2 });
    const note = await on.inOrg((tx) => tx.leadNote.findFirstOrThrow({ where: { leadId: on.leadId } }));
    expect(note.body.startsWith("Price given for Kedarnath Yatra 4N, ")).toBe(true);
    const row = await on.inOrg((tx) =>
      tx.leadAiField.findFirstOrThrow({ where: { leadId: on.leadId, field: "adults" } }),
    );
    expect(row.state).toBe("suggested");

    // Then "book": the hold, the booking, the QR and the payment details.
    const book = await says(on, "book it, joining from Delhi, Riya Sharma", 90);
    on.model.answer(
      understood([["wants_to_book", "book it"]], {
        details: {
          pickup_city: { words: "Delhi", proof: "joining from Delhi", changed: false },
          name: { full: "Riya Sharma", proof: "Riya Sharma" },
        },
      }),
    );
    expect(await on.turn(at(120), { token: book })).toBe("replied");
    // Their order is the act step's to test: one transaction gives them one time.
    const tokens = (await outbound(on)).slice(1).map((one) => one.clientToken);
    expect(tokens.sort()).toEqual([`ai:${book}`, `ai:${book}:pay`, `ai:${book}:qr`]);
    expect(await on.inOrg((tx) => tx.departureHold.count())).toBe(1);
    expect((await on.inOrg((tx) => tx.aiBooking.findFirstOrThrow())).expectedPaise).toBe(400_000n);
    // Understand twice, Write once: book's words are code's own.
    expect(await calls(on)).toBe(3);
  });

  it("a day and book in one turn books, at the price of that day", async () => {
    const on = await liteAgency(test);
    await withFacts(on, { packageId: on.packageId, lastMove: "greet", name: "Riya Sharma" });
    const token = await says(on, "book 14 nov for 2, double, from Delhi", 30);
    on.model.answer(
      understood([["wants_to_book", "book 14 nov"]], {
        details: {
          date: { day: "2026-11-14", month: null, proof: "book 14 nov", changed: false },
          adults: { count: 2, proof: "for 2", changed: false },
          room: { type: "double", proof: "double", changed: false },
          pickup_city: { words: "Delhi", proof: "from Delhi", changed: false },
        },
      }),
    );
    expect(await on.turn(at(60), { token })).toBe("replied");
    expect((await outbound(on)).map((one) => one.clientToken).sort()).toEqual([
      `ai:${token}`,
      `ai:${token}:pay`,
      `ai:${token}:qr`,
    ]);
    const booking = await on.inOrg((tx) => tx.aiBooking.findFirstOrThrow({ include: { quote: true } }));
    expect(booking.expectedPaise).toBe(400_000n);
    expect(booking.quote?.totalPaise).toBe(1_399_800n);
  });

  it("an ad's chat that names a day and books is booked on the ad's trip", async () => {
    const on = await liteAgency(test);
    await on.inOrg(async (tx) => {
      const ad = await tx.whatsappAd.create({
        data: {
          adKey: randomUUID(),
          headline: "Kedarnath",
          packageId: on.packageId,
          firstSeenAt: testNow,
          lastSeenAt: testNow,
        },
        select: { id: true },
      });
      await tx.whatsappConversation.update({ where: { id: on.chat.id }, data: { lastAdId: ad.id } });
    });
    await withFacts(on, { name: "Riya Sharma" });
    const token = await says(on, "book 14 nov for 2, double, from Delhi", 30);
    on.model.answer(
      understood([["wants_to_book", "book 14 nov"]], {
        details: {
          date: { day: "2026-11-14", month: null, proof: "book 14 nov", changed: false },
          adults: { count: 2, proof: "for 2", changed: false },
          room: { type: "double", proof: "double", changed: false },
          pickup_city: { words: "Delhi", proof: "from Delhi", changed: false },
        },
      }),
    );
    expect(await on.turn(at(60), { token })).toBe("replied");
    expect((await on.inOrg((tx) => tx.aiBooking.findFirstOrThrow())).expectedPaise).toBe(400_000n);
  });

  it("discount hands over", async () => {
    const on = await liteAgency(test);
    const token = await says(on, "Kuch discount milega kya?", 30);
    on.model.answer(understood([["discount", "discount milega"]], { language: "hinglish" }));
    expect(await on.turn(at(60), { token })).toBe("handed_off");
    const sent = await outbound(on);
    expect(sent.map((one) => one.body)).toEqual([fixedText("hand_over", "hinglish", {}).text]);
    expect(on.model.requests).toHaveLength(1);
    const chat = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow());
    expect(chat.handedOffAt).not.toBeNull();
  });

  it("a voice note hands over without the model", async () => {
    const on = await liteAgency(test);
    await on.inOrg((tx) =>
      tx.whatsappMessage.create({
        data: {
          conversationId: on.chat.id,
          direction: "in",
          origin: "customer",
          kind: "audio",
          wamid: randomUUID(),
          status: "received",
          occurredAt: at(30),
        },
      }),
    );
    expect(await on.turn(at(60), { token: await newestIn(on) })).toBe("handed_off");
    expect(on.model.requests).toHaveLength(0);
    expect((await outbound(on)).map((one) => one.body)).toEqual([fixedText("voice_note", "english", {}).text]);
  });

  it("a customer who already has a booking goes to a person without the model", async () => {
    const on = await liteAgency(test);
    // Confirmed for the 14 Nov departure, still to come.
    await on.inOrg(async (tx) => {
      const quote = await tx.quote.create({
        data: {
          leadId: on.leadId,
          title: "Kedarnath Yatra 4N",
          status: "accepted",
          subtotalPaise: 1_399_800n,
          totalPaise: 1_399_800n,
          departureId: on.departures[0]?.id ?? null,
        },
        select: { id: true },
      });
      await tx.aiBooking.create({
        data: {
          leadId: on.leadId,
          conversationId: on.chat.id,
          summary: "Kedarnath for 2",
          status: "confirmed",
          quoteId: quote.id,
        },
      });
    });
    const token = await says(on, "What time is the pickup?", 30);
    expect(await on.turn(at(60), { token })).toBe("handed_off");
    expect(on.model.requests).toHaveLength(0);
  });

  it("ok after the closing is silent, and stops the follow-ups", async () => {
    const on = await liteAgency(test);
    await withFacts(on, { packageId: on.packageId, lastMove: "fixed", asked: [] });
    const token = await says(on, "Ok 👍", 30);
    on.model.answer(understood([["ok_thanks", "Ok"]]));
    expect(await on.turn(at(60), { token })).toBe("silent");
    expect(await outbound(on)).toHaveLength(0);
    const chat = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow());
    expect(chat).toMatchObject({ followUpAt: null, followUpsStopped: true });
  });

  it("the score and summary come from Understand", async () => {
    const on = await liteAgency(test);
    const summary = "Asked about Kedarnath, budget ₹15,000 per person.";
    on.model.answer(understood([["hello", "Hi"]], { summary, chance: 64 }), written(greeting));
    expect(await on.turn()).toBe("replied");
    const insight = await on.inOrg((tx) => tx.leadAiInsight.findFirstOrThrow({ where: { leadId: on.leadId } }));
    expect(insight.score).toBe(64);
    const chat = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow());
    expect(chat.summary).toBe(withoutAmountsAndDates(summary).trim());
    expect(chat.summary).not.toContain("15,000");
  });

  it("setup not ready answers nothing", async () => {
    const on = await liteAgency(test, { ready: false });
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    expect(await on.turn()).toBe("not_ready");
    expect(on.model.requests).toHaveLength(0);
    expect(await outbound(on)).toHaveLength(0);
  });

  it("the owner's switch off answers nothing", async () => {
    const on = await liteAgency(test);
    await on.inOrg((tx) => tx.aiAutopilot.updateMany({ data: { autopilot: false } }));
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    expect(await on.turn()).toBe("off");
    expect(on.model.requests).toHaveLength(0);
  });

  it("a lite agency's grounded switch is ignored", async () => {
    const on = await liteAgency(test);
    await on.inOrg((tx) => tx.aiAutopilot.updateMany({ data: { grounded: true } }));
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    expect(await on.turn()).toBe("replied");
    expect(on.model.requests[0]?.schema?.name).toBe("understand_form");
  });

  it("the AI module off answers nothing, though the lite switch is on", async () => {
    const on = await liteAgency(test);
    await on.inOrg((tx) => tx.aiSettings.updateMany({ data: { enabled: false } }));
    expect(await on.turn()).toBe("off");
    expect(on.model.requests).toHaveLength(0);
  });

  /** Runs `meanwhile` as the model is asked to read the chat: after the turn's checks, before it acts. */
  function whileReading(on: Agency, meanwhile: () => Promise<unknown>) {
    const complete = on.model.complete.bind(on.model);
    on.model.complete = async (request) => {
      if (request.schema?.name === "understand_form") await meanwhile();
      return complete(request);
    };
  }

  it("a staff reply while the AI works ends the turn quietly: nothing sent, nothing flagged", async () => {
    const on = await liteAgency(test);
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    whileReading(on, () =>
      on.inOrg((tx) =>
        tx.whatsappMessage.create({
          data: {
            conversationId: on.chat.id,
            direction: "out",
            origin: "staff_crm",
            kind: "text",
            body: "Hi Rahul, calling you now.",
            status: "sent",
            occurredAt: at(30),
          },
        }),
      ),
    );
    expect(await on.turn()).toBe("answered");
    expect((await outbound(on)).map((one) => one.origin)).toEqual(["staff_crm"]);
    const chat = await on.inOrg((tx) => tx.aiChat.findFirst({ where: { conversationId: on.chat.id } }));
    expect(chat?.attentionAt ?? null).toBeNull();
    expect(chat?.handedOffAt ?? null).toBeNull();
  });

  it("a take-over while the AI works ends the turn quietly", async () => {
    const on = await liteAgency(test);
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    whileReading(on, () =>
      on.inOrg((tx) =>
        tx.aiChat.upsert({
          where: { organizationId_conversationId: { organizationId: on.organizationId, conversationId: on.chat.id } },
          create: { conversationId: on.chat.id, mode: "off" },
          update: { mode: "off" },
        }),
      ),
    );
    expect(await on.turn()).toBe("off");
    expect(await outbound(on)).toHaveLength(0);
    const chat = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
    expect(chat.attentionAt).toBeNull();
  });

  it("the log holds no customer words", async () => {
    const on = await liteAgency(test);
    const token = await says(on, "Hi, I am Riya Sharma, can we go on 14 nov?", 30);
    on.model.answer(
      understood([["hello", "Hi"]], { details: { name: { full: "Riya Sharma", proof: "I am Riya Sharma" } } }),
      written(greeting),
    );
    expect(await on.turn(at(60), { token })).toBe("replied");
    const logged = JSON.stringify(on.logger.entries);
    expect(logged).not.toContain("Riya Sharma");
    expect(logged).not.toContain("14 nov");
    const turns = on.logger.entries.filter((entry) => entry.event === "ai.turn");
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ agent: "lite", outcome: "replied", kind: "reply", move: "greet" });
  });

  it("the trace sink gets the whole turn", async () => {
    const on = await liteAgency(test);
    const traces: LiteTrace[] = [];
    const sink = { record: (trace: LiteTrace) => Promise.resolve(void traces.push(trace)) };
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    expect(await on.turn(undefined, { traces: sink })).toBe("replied");
    expect(traces).toHaveLength(1);
    const [trace] = traces;
    expect(trace).toMatchObject({ outcome: "replied", move: "greet", intents: ["hello"], messageIds: [on.message.id] });
    expect(trace?.promptVersions).toEqual(promptVersions());
    expect(trace?.understand?.blocks).not.toHaveProperty("Messages");
    expect(trace?.understand?.blocks).toHaveProperty("Package index");
    expect(trace?.write?.blocks).not.toHaveProperty("Messages");
    expect(trace?.write?.raw).toEqual([written(greeting)]);
    expect(trace?.sent.messageIds).toHaveLength(1);

    const unready = await liteAgency(test, { ready: false });
    const none: LiteTrace[] = [];
    await unready.turn(undefined, { traces: { record: (trace) => Promise.resolve(void none.push(trace)) } });
    expect(none).toHaveLength(0);
  });

  it("the trace keeps what plan 3b stores: the note, the task, the suggestion, and the words actually sent", async () => {
    const traced = async (on: Agency, token?: string) => {
      const traces: LiteTrace[] = [];
      const sink = { record: (trace: LiteTrace) => Promise.resolve(void traces.push(trace)) };
      await on.turn(token === undefined ? undefined : at(60), {
        traces: sink,
        ...(token === undefined ? {} : { token }),
      });
      return traces[0];
    };
    const closing = await liteAgency(test);
    const notNow = await says(closing, "Not interested, thanks", 30);
    closing.model.answer(understood([["not_interested", "Not interested"]]));
    expect(await traced(closing, notNow)).toMatchObject({
      note: "not_interested",
      task: null,
      suggest: { kind: "lost", lostReason: "other" },
      sent: { text: fixedText("close", "english", {}).text },
    });
    const calling = await liteAgency(test);
    const call = await says(calling, "Please call me", 30);
    calling.model.answer(understood([["wants_call", "Please call me"]]));
    expect(await traced(calling, call)).toMatchObject({
      note: "handed_over",
      task: "call_back",
      suggest: null,
      sent: { text: fixedText("hand_over", "english", {}).text },
    });
  });

  it("a booking's trace holds the money message it sent", async () => {
    const on = await liteAgency(test);
    await withFacts(on, { packageId: on.packageId, lastMove: "greet" });
    const token = await says(on, "book kedarnath on 14 nov for 2, double, from Delhi, Riya Sharma", 30);
    on.model.answer(
      understood([["wants_to_book", "book kedarnath"]], {
        details: {
          package: { name: "Kedarnath Yatra 4N", proof: "book kedarnath", changed: false },
          date: { day: "2026-11-14", month: null, proof: "14 nov", changed: false },
          adults: { count: 2, proof: "for 2", changed: false },
          room: { type: "double", proof: "double", changed: false },
          pickup_city: { words: "Delhi", proof: "from Delhi", changed: false },
          name: { full: "Riya Sharma", proof: "Riya Sharma" },
        },
      }),
    );
    const traces: LiteTrace[] = [];
    const sink = { record: (trace: LiteTrace) => Promise.resolve(void traces.push(trace)) };
    expect(await on.turn(at(60), { token, traces: sink })).toBe("replied");
    const [reply] = await outbound(on);
    expect(traces[0]?.move).toBe("book");
    expect(traces[0]?.sent.text).toBe(reply?.body);
    expect(traces[0]?.sent.text).toContain(formatRupees(400_000));
  });

  it("the trace names what code wrote and what it asked", async () => {
    const on = await liteAgency(test);
    await withFacts(on, { packageId: on.packageId, lastMove: "greet" });
    const token = await says(on, "price for kedarnath on 14 nov, 2 people, double?", 30);
    on.model.answer(
      understood([["price_question", "price for kedarnath"]], {
        details: {
          package: { name: "Kedarnath Yatra 4N", proof: "price for kedarnath", changed: false },
          date: { day: "2026-11-14", month: null, proof: "14 nov", changed: false },
          adults: { count: 2, proof: "2 people", changed: false },
          room: { type: "double", proof: "double", changed: false },
        },
      }),
      written("Which city will you join us from?"),
    );
    const traces: LiteTrace[] = [];
    const sink = { record: (trace: LiteTrace) => Promise.resolve(void traces.push(trace)) };
    await on.turn(at(60), { token, traces: sink });
    const [trace] = traces;
    expect(trace?.asked).toBe("pickup");
    const text = trace?.sent.text ?? "";
    const spans = (trace?.sent.filled ?? []).map((span) => text.slice(span.start, span.end));
    expect(spans).toEqual(expect.arrayContaining([formatRupees(1_399_800), formatRupees(400_000)]));
    expect(inventedSpans(text, trace?.sent.filled ?? [])).toEqual([]);

    const handing = await liteAgency(test);
    const discount = await says(handing, "thoda discount do na", 30);
    handing.model.answer(understood([["discount", "discount do"]]));
    const handed: LiteTrace[] = [];
    await handing.turn(at(60), {
      token: discount,
      traces: { record: (one) => Promise.resolve(void handed.push(one)) },
    });
    expect(handed[0]?.asked).toBeNull();
    expect(inventedSpans(handed[0]?.sent.text ?? "", handed[0]?.sent.filled ?? [])).toEqual([]);
  });

  it("an unfit answer is counted as a call, its tokens with it, as the trace counts them", async () => {
    const on = await liteAgency(test);
    const complete = on.model.complete.bind(on.model);
    on.model.complete = async (request) => {
      const result = await complete(request);
      return result.ok ? { ...result, inputTokens: 1200, outputTokens: 80 } : result;
    };
    on.model.answer('{"intents": "not a list"}');
    const traces: LiteTrace[] = [];
    const sink = { record: (trace: LiteTrace) => Promise.resolve(void traces.push(trace)) };
    expect(await on.turn(undefined, { traces: sink })).toBe("unfit");
    const usage = await on.inOrg((tx) => tx.aiUsage.findFirstOrThrow());
    expect(usage).toMatchObject({ calls: 1, inputTokens: 1200n, outputTokens: 80n });
    expect(traces[0]).toMatchObject({ inputTokens: 1200, outputTokens: 80 });
  });

  it("a follow-up task's turn reads nothing: the team makes that call", async () => {
    const on = await liteAgency(test);
    const counting = countingDatabase(test.db);
    const deps = {
      db: counting.db,
      ai: on.model,
      agencyName: () => Promise.resolve("Sharma Holidays"),
      files: test.files,
      managers: () => Promise.resolve([]),
    };
    const input = { organizationId: on.organizationId, conversationId: on.chat.id, token: "follow-up:1" };
    expect(await runLiteTurn(deps, { ...input, kind: "followUp" }, at(600))).toBe("off");
    expect(counting.count()).toBe(0);
    expect(on.model.requests).toHaveLength(0);
  });

  it("a sink that throws changes nothing", async () => {
    const on = await liteAgency(test);
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    const broken = { record: () => Promise.reject(new TypeError("down")) };
    expect(await on.turn(undefined, { traces: broken })).toBe("replied");
    expect(on.logger.entries.some((entry) => entry.event === "ai.trace-failed")).toBe(true);
  });

  it("a worker-built turn writes its trace", async () => {
    const on = await liteAgency(test);
    const storage = createMemoryStorage();
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    const traces = createTraceSink({ db: test.db, storage, logger: createMemoryLogger() });
    expect(await on.turn(undefined, { traces })).toBe("replied");
    const rows = await on.inOrg((tx) => tx.aiTurnTrace.findMany({ where: { conversationId: on.chat.id } }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: "replied", move: "greet", kind: "reply" });
    expect(await storage.head(rows[0]?.fileKey ?? "")).not.toBeNull();
  });

  it("the stored file names the messages and never holds their words", async () => {
    const on = await liteAgency(test);
    const storage = createMemoryStorage();
    on.model.answer(understood([["hello", "Hi"]]), written(greeting));
    const traces = createTraceSink({ db: test.db, storage, logger: createMemoryLogger() });
    expect(await on.turn(undefined, { traces })).toBe("replied");
    const row = await on.inOrg((tx) => tx.aiTurnTrace.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
    const file = await readTraceFile(storage, row.fileKey);
    expect(file?.trace.messageIds).toEqual([on.message.id]);
    expect(file?.trace.understand?.blocks).toHaveProperty("Package index");
    expect(file?.trace.understand?.blocks).not.toHaveProperty("Messages");
    expect(file?.trace.write?.blocks).not.toHaveProperty("Messages");
    const bytes = await storage.get(row.fileKey);
    expect(bytes).not.toBeNull();
    expect(gunzipSync(bytes ?? new Uint8Array()).toString("utf8")).not.toContain("is the Kedarnath yatra running");
  });
});
