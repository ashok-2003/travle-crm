// The autopilot (AI step 2) obeys the agency and the customer: off by default; no AI for an agency whose plan lacks it or
// whose subscription is read-only, suspended or cancelled; STOP wins in every chat, one with no person linked too; only
// inside the 24-hour window; never past the shared monthly limit; never while a person answers; every message it sends is
// marked as the AI's and audited; a customer's erasure takes its memory of them and the lessons; the style it copies is
// read from one person's own messages alone.
import { randomUUID } from "node:crypto";
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { createMemoryAiModel } from "@travel-crm/integrations/ai";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  AI_TOKEN_PREFIX,
  MONTHLY_AI_LIMIT,
  learnChatVoice,
  learnFromChats,
  learnVoice,
  testAnswer,
  runAgentTurn,
  saveAiSettings,
  saveAutopilot,
} from "../../src/ai/index.js";
import { monthStartOf } from "../../src/inbox/index.js";
import { formatRupees, parseCalendarDate, systemActor } from "../../src/kernel/index.js";
import { eraseCustomerParts } from "../../src/platform/erase-customer.js";
import type { Entitlements } from "../../src/subscriptions/index.js";
import { aLead } from "../crm/support/records.js";
import { memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestInbox,
} from "../inbox/support.js";

const entitlements = (status: Entitlements["status"] = "active", modules = ["crm", "inbox", "ai"]): Entitlements => ({
  status,
  access: "full",
  planName: "Test",
  modules: new Set(modules) as Entitlements["modules"],
  limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1e9 },
  trialEndsOn: null,
  paidThrough: null,
  nextChangeOn: null,
});
const reply = (text = "Manali 5N/6D is Rs 18,500 per person. How many are travelling?") =>
  JSON.stringify({
    reply: text,
    handoff: false,
    handoffReason: "",
    attention: "",
    memory: "Wants Manali for 4 in December.",
    followUp: { needed: true, inHours: 3, why: "Waiting for the count" },
  });
const turnAt = new Date(testNow.getTime() + 60_000);
const today = parseCalendarDate("2026-11-10");
const day = (text: string) => new Date(`${text}T00:00:00Z`);

describe("the autopilot", () => {
  let test: TestInbox;
  let platformDb: PlatformDatabase;
  beforeAll(() => {
    test = createTestInbox();
    platformDb = createPlatformDatabase(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await platformDb.disconnect();
    await test.close();
  });

  /** An agency whose customer has written; the AI's switch on, the autopilot as asked (off unless told). */
  async function agency({ autopilot = false, text = "Hi, Manali for 4 adults in December. Price?" } = {}) {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const owner = memberOf(organizationId, "org-owner");
    await deliver(
      test,
      fromCustomer(connection, { customerNumber: freshPhone().replace("+", ""), customerName: "Rahul Sharma", text }),
    );
    const chat = await inOrg((tx) => tx.whatsappConversation.findFirstOrThrow());
    const message = await inOrg((tx) => tx.whatsappMessage.findFirstOrThrow({ where: { direction: "in" } }));
    await inOrg((tx) =>
      aLead(tx, { ...(chat.personId === null ? {} : { personId: chat.personId }), stage: "contacted" }),
    );
    await inOrg((tx) =>
      saveAiSettings(
        tx,
        owner,
        { enabled: true, scoring: true, instructions: "" },
        { providerReady: true, now: testNow },
      ),
    );
    const settings = {
      autopilot,
      grounded: false,
      agentName: "Riya",
      followUpHours: 4,
      maxRepliesPerDay: 25,
      language: "customer" as const,
      languageOther: "",
      style: "human" as const,
      emojis: "few" as const,
      tone: "friendly" as const,
      handoff: "alert" as const,
      smartFollowUp: true,
      learning: false,
      persona: "sales" as const,
      leadNotes: true,
      sendMedia: true,
      paymentDetails: "",
      strictRules: "",
      followUpTasks: true,
    };
    await inOrg((tx) => saveAutopilot(tx, owner, settings, today));
    const model = createMemoryAiModel();
    const turn = (status: Entitlements["status"] = "active", modules?: string[], at = turnAt) =>
      runAgentTurn(
        {
          db: test.db,
          ai: model,
          subscriptions: { entitlementsOf: () => Promise.resolve(entitlements(status, modules)) },
          agencyName: () => Promise.resolve("Sharma Holidays"),
          files: test.files,
          managers: () => Promise.resolve([]),
        },
        { organizationId, conversationId: chat.id, kind: "reply", token: message.id },
        at,
      );
    return { connection, organizationId, inOrg, owner, chat, message, model, turn, settings };
  }

  /** A package the AI may sell today: priced for the season, an advance, one open departure, a destination unless not. */
  async function aSellablePackage(on: Awaited<ReturnType<typeof agency>>, { destination = true } = {}) {
    await on.inOrg(async (tx) => {
      const place = destination
        ? await tx.destination.create({ data: { name: `Spiti ${randomUUID()}` }, select: { id: true } })
        : null;
      const template = await tx.quoteTemplate.create({
        data: {
          name: destination ? "Spiti" : "Spiti, no place",
          title: "Spiti",
          kind: "group",
          destinationId: place?.id ?? null,
          roomTypes: ["double"],
          advancePerPersonPaise: 500_000n,
          aiSellable: true,
          nights: 6,
        },
        select: { id: true },
      });
      await tx.packageSeason.create({
        data: {
          templateId: template.id,
          label: "Nov",
          startsOn: day("2026-11-01"),
          endsOn: day("2026-11-30"),
          priceDoublePaise: 699_900n,
        },
      });
      await tx.departure.create({
        data: {
          title: "Batch",
          startDate: day("2026-11-14"),
          endDate: day("2026-11-20"),
          seatsTotal: 12,
          templateId: template.id,
        },
      });
    });
  }

  it("turning grounded on needs a sellable package", async () => {
    const on = await agency();
    const turnOn = () => on.inOrg((tx) => saveAutopilot(tx, on.owner, { ...on.settings, grounded: true }, today));
    const reason = await turnOn().then(
      () => null,
      (error: unknown) => (error as { reason?: string }).reason ?? "other",
    );
    expect(reason).toBe("NO_SELLABLE_PACKAGES");
    expect((await on.inOrg((tx) => tx.aiAutopilot.findFirstOrThrow())).grounded).toBe(false);
    // A sellable package with no destination is one the agent can't see: it doesn't count.
    await aSellablePackage(on, { destination: false });
    const unseen = await turnOn().then(
      () => null,
      (error: unknown) => (error as { reason?: string }).reason ?? "other",
    );
    expect(unseen).toBe("NO_SELLABLE_PACKAGES");
    await aSellablePackage(on);
    expect((await turnOn()).grounded).toBe(true);
    const entries = await on.inOrg((tx) => tx.auditEntry.findMany({ where: { action: "ai-autopilot.changed" } }));
    expect(entries.at(-1)?.after).toMatchObject({ grounded: true });
    expect(entries.at(-1)?.before).toMatchObject({ grounded: false });
    // Turning it off always works, even with no package left to sell.
    await on.inOrg((tx) => tx.quoteTemplate.updateMany({ data: { aiSellable: false } }));
    expect(
      (await on.inOrg((tx) => saveAutopilot(tx, on.owner, { ...on.settings, grounded: false }, today))).grounded,
    ).toBe(false);
  });

  it("a save without grounded keeps it, and saving other settings never needs a package once it is on", async () => {
    const on = await agency();
    await aSellablePackage(on);
    const withoutGrounded: Parameters<typeof saveAutopilot>[2] = { ...on.settings };
    delete withoutGrounded.grounded;
    const save = (input: Parameters<typeof saveAutopilot>[2]) =>
      on.inOrg((tx) => saveAutopilot(tx, on.owner, input, today));
    expect((await save(withoutGrounded)).grounded).toBe(false);
    await save({ ...on.settings, grounded: true });
    expect((await save(withoutGrounded)).grounded).toBe(true);
    // The last sellable package goes away: other changes still save while it stays on.
    await on.inOrg((tx) => tx.quoteTemplate.updateMany({ data: { aiSellable: false } }));
    expect((await save({ ...on.settings, grounded: true, agentName: "Asha" })).agentName).toBe("Asha");
    expect((await save({ ...withoutGrounded, agentName: "Meera" })).grounded).toBe(true);
  });

  it("a lesson keeps no amount or date", async () => {
    const lessons = async (grounded: boolean) => {
      const on = await agency({ autopilot: true });
      for (const [name, number] of [
        ["Meera", freshPhone()],
        ["Dev", freshPhone()],
      ] as const) {
        for (const text of ["Spiti trip?", "How many days?"]) {
          await deliver(
            test,
            fromCustomer(on.connection, { customerNumber: number.replace("+", ""), customerName: name, text }),
          );
        }
      }
      await on.inOrg((tx) => tx.aiAutopilot.updateMany({ data: { learning: true, grounded } }));
      on.model.answer(
        JSON.stringify({
          learnings: [
            { id: null, kind: "faq", text: "Customers ask if Spiti is Rs 6,999 from 14 Nov", evidence: 2 },
            { id: null, kind: "need", text: "12 Dec", evidence: 1 },
            { id: null, kind: "winning", text: "Sending the brochure first got replies", evidence: 2 },
            { id: null, kind: "objection", text: "Too costly: offer a smaller batch", evidence: 2 },
          ],
        }),
      );
      await learnFromChats(
        { db: test.db, ai: on.model, agencyName: () => Promise.resolve("Sharma Holidays") },
        on.organizationId,
        turnAt,
      );
      const stored = (await on.inOrg((tx) => tx.aiLearning.findMany())).map((row) => row.text);
      return { stored, prompt: JSON.stringify(on.model.requests[0]?.messages[0]) };
    };
    const grounded = await lessons(true);
    expect(grounded.stored).toEqual(["Customers ask if Spiti is from"]);
    expect(grounded.prompt).not.toContain("winning");
    expect(grounded.prompt).toContain("how customers talk");
    const old = await lessons(false);
    expect(old.stored.join(" ")).toContain("6,999");
    expect(old.stored).toHaveLength(4);
    expect(old.prompt).toContain("winning");
  });

  it("is off by default: it answers nothing and asks the AI nothing until the autopilot is turned on", async () => {
    const off = await agency();
    off.model.answer(reply());
    expect(await off.turn()).toBe("off");
    expect(off.model.requests).toHaveLength(0);
    expect(await off.inOrg((tx) => tx.whatsappMessage.count({ where: { direction: "out" } }))).toBe(0);
  });

  it("answers inside the window, marks the message as the AI's, audits it and keeps its tokens", async () => {
    const on = await agency({ autopilot: true });
    on.model.answer(reply());
    expect(await on.turn()).toBe("replied");
    const sent = await on.inOrg((tx) => tx.whatsappMessage.findFirstOrThrow({ where: { direction: "out" } }));
    expect(sent).toMatchObject({ origin: "automation", status: "queued" });
    expect(sent.clientToken).toBe(`${AI_TOKEN_PREFIX}${on.message.id}`);
    expect(sent.body).toContain("18,500");
    const audited = await on.inOrg((tx) => tx.auditEntry.findFirstOrThrow({ where: { action: "ai.message-sent" } }));
    expect(audited.entityId).toBe(sent.id);
    expect(JSON.stringify(audited)).not.toContain("18,500");
    const state = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow());
    expect(state).toMatchObject({ memory: "Wants Manali for 4 in December.", repliesCount: 1 });
    expect(state.followUpAt).not.toBeNull();
    // The same message is answered once, whatever runs twice.
    on.model.answer(reply());
    expect(await on.turn()).toBe("answered");
    expect(await on.inOrg((tx) => tx.whatsappMessage.count({ where: { direction: "out" } }))).toBe(1);
  });

  it("gives no AI to an agency whose plan lacks it or whose subscription is read-only, suspended or cancelled", async () => {
    const on = await agency({ autopilot: true });
    on.model.answer(reply());
    for (const status of ["read_only", "suspended", "cancelled"] as const)
      expect(await on.turn(status)).toBe("not_allowed");
    expect(await on.turn("active", ["crm", "inbox"])).toBe("not_allowed");
    expect(on.model.requests).toHaveLength(0);
  });

  it("lets STOP win in a chat of a person, and in one with no person linked", async () => {
    const stopped = await agency({ autopilot: true });
    await stopped.inOrg(async (tx) => {
      const personId = (await tx.whatsappConversation.findFirstOrThrow()).personId;
      if (personId === null) throw new Error("the chat has no person");
      await tx.personConsent.create({
        data: {
          personId,
          purpose: "whatsapp",
          action: "withdrawn",
          wording: "STOP",
          wordingVersion: 1,
          source: "customer",
          recordedAt: testNow,
        },
      });
    });
    stopped.model.answer(reply());
    expect(await stopped.turn()).toBe("opted_out");
    const unlinked = await agency({ autopilot: true });
    await unlinked.inOrg(async (tx) => {
      await tx.whatsappConversation.updateMany({ data: { personId: null } });
      await tx.whatsappMessage.create({
        data: {
          conversationId: unlinked.chat.id,
          direction: "in",
          origin: "customer",
          kind: "text",
          body: "STOP",
          wamid: randomUUID(),
          status: "received",
          occurredAt: new Date(testNow.getTime() + 1000),
        },
      });
    });
    unlinked.model.answer(reply());
    expect(await unlinked.turn()).toBe("opted_out");
    expect(stopped.model.requests.length + unlinked.model.requests.length).toBe(0);
  });

  it("writes only inside the 24-hour window, within the monthly limit, and never while a person answers", async () => {
    const late = await agency({ autopilot: true });
    late.model.answer(reply());
    expect(await late.turn("active", undefined, new Date(testNow.getTime() + 25 * 3_600_000))).toBe("window_closed");
    const full = await agency({ autopilot: true });
    await full.inOrg((tx) =>
      tx.aiUsage.create({ data: { month: monthStartOf(turnAt, "Asia/Kolkata"), calls: MONTHLY_AI_LIMIT } }),
    );
    full.model.answer(reply());
    expect(await full.turn()).toBe("limit");
    const busy = await agency({ autopilot: true });
    await busy.inOrg((tx) =>
      tx.whatsappMessage.create({
        data: {
          conversationId: busy.chat.id,
          direction: "out",
          origin: "staff_crm",
          kind: "text",
          body: "I will call you",
          status: "sent",
          occurredAt: new Date(testNow.getTime() + 30_000),
        },
      }),
    );
    busy.model.answer(reply());
    expect(["answered", "person_answering"]).toContain(await busy.turn());
    expect(late.model.requests.length + full.model.requests.length + busy.model.requests.length).toBe(0);
  });

  it("is erased with the customer: its memory of the chat, and the lessons", async () => {
    const on = await agency({ autopilot: true });
    on.model.answer(reply());
    await on.turn();
    await on.inOrg((tx) => tx.aiLearning.create({ data: { kind: "need", text: "People ask for Manali" } }));
    const personId = (await on.inOrg((tx) => tx.whatsappConversation.findFirstOrThrow())).personId ?? "";
    await platformDb.transaction((tx) =>
      eraseCustomerParts(tx, systemActor(on.organizationId), { organizationId: on.organizationId, personId }, testNow),
    );
    expect(await on.inOrg((tx) => tx.aiChat.count())).toBe(0);
    expect(await on.inOrg((tx) => tx.aiLearning.count())).toBe(0);
  });

  it("learns a way of talking from one person's own messages alone, and keeps no customer's words", async () => {
    const on = await agency({ autopilot: true });
    const own = ["hn bhai ho jayega", "kal bhej dunga", "ok done", "theek hai ji", "thnx bro"];
    on.model.answer(
      JSON.stringify({ profile: "Short Hinglish, no full stops.", examples: ["hn bhai ho jayega", "made up"] }),
    );
    const voice = await learnVoice(
      { db: test.db, ai: on.model },
      { ...on.owner },
      { personName: "Asha", ownMessages: own },
      turnAt,
    );
    expect(voice).toEqual({ name: "Asha", profile: "Short Hinglish, no full stops.", examples: 1 });
    const sent = JSON.stringify(on.model.requests[0]?.messages);
    for (const line of own) expect(sent).toContain(line);
    expect(sent).not.toContain("Them");
    const row = await on.inOrg((tx) => tx.aiAutopilot.findFirstOrThrow());
    expect(row).toMatchObject({ voiceName: "Asha", voiceExamples: ["hn bhai ho jayega"] });
  });

  it("copies one chat's own way of talking, with what the two said before, over the agency's, and asks nothing else of it", async () => {
    const on = await agency({ autopilot: true });
    on.model.answer(
      JSON.stringify({
        profile: "Short Hinglish, no full stops.",
        examples: ["hn bhai ho jayega"],
        context: "Rahul is planning Kerala with his family for December.",
      }),
    );
    const messages = [
      { own: false, text: "Bhai Kerala ka plan hai December mein" },
      { own: true, text: "hn bhai ho jayega" },
      { own: true, text: "kal bhej dunga" },
      { own: true, text: "ok done" },
      { own: true, text: "theek hai ji" },
      { own: true, text: "thnx bro" },
    ];
    const voice = await learnChatVoice(
      { db: test.db, ai: on.model },
      on.owner,
      { conversationId: on.chat.id, personName: "Asha", messages },
      turnAt,
    );
    expect(voice).toEqual({ name: "Asha", profile: "Short Hinglish, no full stops.", examples: 1 });
    on.model.answer(reply());
    expect(await on.turn()).toBe("replied");
    const prompt =
      on.model.requests
        .at(-1)
        ?.messages.map((message) => message.content)
        .join("\n") ?? "";
    expect(prompt).toContain("Short Hinglish, no full stops.");
    expect(prompt).toContain("Rahul is planning Kerala with his family");
    expect(prompt).toContain("Them: Bhai Kerala ka plan hai December mein");
  });

  describe("the test box of an agency answering from its packages (M4)", () => {
    const groundedRead = JSON.stringify({
      places: [{ destination: "D1", words: "Spiti", evidence: "Spiti" }],
      startsOn: { date: "2026-11-14", month: null, evidence: "14 Nov" },
      rooms: [],
      travellers: { count: 2, evidence: "2 people" },
      budgetRupees: null,
      pickupCity: null,
      chosen: null,
      wants: "price",
      wantsEvidence: "price",
      special: null,
      nearest: [],
    });
    const groundedWrite = (reply: string, actions: object = {}) =>
      JSON.stringify({
        reply,
        actions: {
          sendFiles: [],
          sendAgencyFiles: false,
          sendPayment: false,
          requestBooking: false,
          flag: null,
          handOver: null,
          note: null,
          task: null,
          ...actions,
        },
      });
    async function switched() {
      const on = await agency({ autopilot: true });
      await aSellablePackage(on);
      await on.inOrg((tx) => saveAutopilot(tx, on.owner, { ...on.settings, autopilot: true, grounded: true }, today));
      const ask = () =>
        testAnswer(
          { db: test.db, ai: on.model, agencyName: () => Promise.resolve("Sharma Holidays") },
          on.owner,
          "Spiti on 14 Nov for 2 people, price?",
          turnAt,
        );
      return { ...on, ask };
    }

    it("runs the grounded turn as a dry run: the filled reply and what code would do, nothing sent or kept", async () => {
      const on = await switched();
      on.model.answer(
        groundedRead,
        groundedWrite("Spiti on [departure P1] is [price P1 double] per person.", {
          flag: "wants a call",
          note: "Spiti",
        }),
      );
      const answered = await on.ask();
      expect(answered.answer).toBe(`Spiti on Sat 14 Nov is ${formatRupees(699_900)} per person.`);
      expect(answered).toMatchObject({ handoff: false, grounded: { actions: ["flag", "note"], blocked: null } });
      expect(JSON.stringify(on.model.requests[0]?.messages)).toContain("READ_CHAT.");
      expect(JSON.stringify(on.model.requests[1]?.messages)).toContain("WRITE_REPLY.");
      expect(await on.inOrg((tx) => tx.whatsappMessage.count({ where: { direction: "out" } }))).toBe(0);
      expect(await on.inOrg((tx) => tx.aiChat.count())).toBe(0);
      expect(await on.inOrg((tx) => tx.departureHold.count())).toBe(0);
      expect((await on.inOrg((tx) => tx.aiUsage.findFirstOrThrow())).calls).toBe(2);
    });

    it("shows why nothing would be sent when the check refuses the reply twice", async () => {
      const on = await switched();
      on.model.answer(groundedRead, groundedWrite("Spiti is ₹5,000."), groundedWrite("Still ₹5,000."));
      const answered = await on.ask();
      expect(answered).toMatchObject({ answer: "", handoff: false, grounded: { actions: [], blocked: "amount" } });
    });
  });

  it("answers a test question from the knowledge alone, spending one call and sending nothing", async () => {
    const on = await agency();
    await on.inOrg((tx) =>
      tx.aiKnowledge.create({ data: { title: "Kerala 5N", body: "Kerala 5 nights is Rs 18,500." } }),
    );
    on.model.answer(reply("Kerala 5 nights is Rs 18,500 per person."));
    const answered = await testAnswer(
      { db: test.db, ai: on.model, agencyName: () => Promise.resolve("Sharma Holidays") },
      on.owner,
      "How much is Kerala?",
      turnAt,
    );
    expect(answered).toMatchObject({
      answer: "Kerala 5 nights is Rs 18,500 per person.",
      handoff: false,
      grounded: null,
    });
    expect(JSON.stringify(on.model.requests[0]?.messages)).toContain("Kerala 5 nights is Rs 18,500.");
    expect(await on.inOrg((tx) => tx.whatsappMessage.count({ where: { direction: "out" } }))).toBe(0);
    expect((await on.inOrg((tx) => tx.aiUsage.findFirstOrThrow())).calls).toBe(1);
  });
});
