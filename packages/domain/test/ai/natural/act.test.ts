// The natural agent's live act against the real database (plan 2, Task 5): in the turn's one transaction it sends the
// model's words as one or two messages, a brochure's files, and after a hold the agency's payment lines and QR; it saves
// the lead's fields, notes and tasks, moves the stage forward, hands over, and settles the chat. A person replying while
// the model worked, a pause, or seats that went send nothing and keep nothing.
import { randomUUID } from "node:crypto";
import { naturalFacts, type BookingTerms, type NaturalFacts } from "@travel-crm/contracts/ai";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { replyDayOf } from "../../../src/ai/may-write.js";
import {
  actOnNaturalTurn,
  type NaturalActDeps,
  type NaturalActInput,
  type NaturalActResult,
} from "../../../src/ai/natural/act.js";
import type { QuoteFigures, StagedAction, StagedSet } from "../../../src/ai/natural/types.js";
import { tripFieldValues } from "../../../src/crm/index.js";
import {
  addWorkingMinutes,
  DomainError,
  instantAt,
  parseCalendarDate,
  parseTimeOfDay,
  type WorkingHours,
} from "../../../src/kernel/index.js";
import { aLead } from "../../crm/support/records.js";
import { createTestInbox, testNow, type TestInbox } from "../../inbox/support.js";
import { actAgency, actNow, actToday, type ActAgency } from "./support/act-agency.js";
import { NATURAL_UPI } from "./support/natural-agency.js";

const TIME_ZONE = "Asia/Kolkata";
const MINUTE_MS = 60_000;
/** Open every day, 10 am to 7 pm. */
const WORKING: WorkingHours = { workdays: 127, opensMinute: 10 * 60, closesMinute: 19 * 60 };
/** Who gets a task on a lead nobody owns: the first member holding leads:assign, read before the act. */
const ASSIGNER = randomUUID();

const freshFacts = (): NaturalFacts => naturalFacts.parse({ agent: "natural" });
const stagedOf = (...actions: StagedAction[]): StagedSet => new Map(actions.map((action) => [action.tool, action]));
const failure = (error: unknown) => (error instanceof DomainError ? error.reason : String(error));
const done = (result: NaturalActResult) => {
  if (result === "already" || "stopped" in result || "refused" in result) {
    throw new Error(`expected the turn to act: ${JSON.stringify(result)}`);
  }
  return result;
};
const at = (day: string, time: string) => instantAt(parseCalendarDate(day), parseTimeOfDay(time), TIME_ZONE);

describe("the natural agent's live act", () => {
  let test: TestInbox;
  let platform: PlatformClient;
  beforeAll(() => {
    test = createTestInbox();
    platform = createPlatformClient(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await platform.$disconnect();
    await test.close();
  });

  const deps = (changes: Partial<NaturalActDeps> = {}): NaturalActDeps => ({
    files: test.files,
    recipients: () => Promise.resolve([]),
    storageLimitBytes: null,
    supplierStateCode: "05",
    taskOwner: ASSIGNER,
    workingHours: WORKING,
    ...changes,
  });
  const inputOf = (on: ActAgency, changes: Partial<NaturalActInput>): NaturalActInput => ({
    organizationId: on.organizationId,
    conversationId: on.chat.id,
    token: on.message.id,
    kind: "reply",
    now: actNow,
    timeZone: TIME_ZONE,
    today: actToday,
    messages: [],
    staged: new Map(),
    quoted: [],
    facts: freshFacts(),
    sheets: on.sheets,
    typed: {},
    handOver: null,
    task: null,
    traceId: "trace-1",
    model: null,
    agencyName: "Case Trips",
    ...changes,
  });
  /** Acts in one transaction, as the turn does. */
  const act = (on: ActAgency, changes: Partial<NaturalActInput> = {}, actDeps = deps()) =>
    on.inOrg((tx) => actOnNaturalTurn(tx, actDeps, inputOf(on, changes)));

  const outbound = (on: ActAgency) =>
    on.inOrg((tx) =>
      tx.whatsappMessage.findMany({
        where: { conversationId: on.chat.id, direction: "out" },
        orderBy: { createdAt: "asc" },
        select: { clientToken: true, body: true, caption: true, kind: true, occurredAt: true },
      }),
    );
  const tokensOf = (sent: readonly { clientToken: string | null }[]) => sent.map((message) => message.clientToken);
  const textOf = (message: { body: string | null } | undefined) => message?.body ?? null;
  const chatState = (on: ActAgency) =>
    on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
  /** What a turn could have kept: seats, bookings, quotes, the AI's messages, tasks, notes, the chat's reply time. */
  const kept = (on: ActAgency) =>
    on.inOrg(async (tx) => ({
      holds: await tx.departureHold.count({ where: { leadId: on.leadId, status: "active" } }),
      bookings: await tx.aiBooking.count({ where: { conversationId: on.chat.id, status: "awaiting_payment" } }),
      quotes: await tx.quote.count({ where: { leadId: on.leadId } }),
      sent: await tx.whatsappMessage.count({
        where: { conversationId: on.chat.id, clientToken: { startsWith: "ai:" } },
      }),
      tasks: await tx.task.count({ where: { recordId: on.leadId } }),
      notes: await tx.leadNote.count({ where: { leadId: on.leadId } }),
      lastReplyAt:
        (await tx.aiChat.findFirst({ where: { conversationId: on.chat.id }, select: { lastReplyAt: true } }))
          ?.lastReplyAt ?? null,
    }));
  const nothingKept = { holds: 0, bookings: 0, quotes: 0, sent: 0, tasks: 0, notes: 0, lastReplyAt: null };

  /** Three adults in a triple tent on Kedarkantha's 19 Dec batch: ₹9,499 each, ₹3,000 each to book. */
  const threeOn19Dec = (on: ActAgency): BookingTerms => ({
    packageId: on.kedarkantha,
    startsOn: parseCalendarDate("2026-12-19"),
    adults: 3,
    childrenAges: [],
    room: "triple",
    payInFull: false,
  });
  const bookOf = (figures: QuoteFigures): StagedAction => ({
    tool: "book",
    terms: figures.terms,
    figures,
    fullName: "Rahul Verma",
    customerWords: "haan book karo",
    via: "offer",
  });
  const offerOf = (figures: QuoteFigures, now = actNow): StagedAction => ({
    tool: "offer_booking",
    offer: {
      ...figures.terms,
      departureId: figures.departureId,
      totalPaise: figures.totalPaise,
      advancePaise: figures.advancePaise,
      at: now.toISOString(),
    },
    figures,
  });
  /** The customer's next line, `minutes` after the act, and the input of the turn that answers it then. */
  async function nextTurn(on: ActAgency, text: string, minutes: number) {
    const line = await on.say(text, new Date(actNow.getTime() + (minutes - 1) * MINUTE_MS));
    return { token: line.id, now: new Date(actNow.getTime() + minutes * MINUTE_MS) };
  }
  /** Seats held on the 19 Dec batch for another lead, as staff hold them. */
  const holdSeats = (on: ActAgency, departureId: string, seats: number) =>
    on.inOrg(async (tx) =>
      tx.departureHold.create({
        data: { departureId, leadId: (await aLead(tx)).id, seats, expiresAt: new Date("2027-01-01") },
      }),
    );

  /** Pauses the agent for this agency, from the platform's own connection, as platform staff do. */
  async function pause(on: ActAgency) {
    const plan = await platform.plan.create({
      data: {
        key: `plan-${randomUUID().slice(0, 8)}`,
        name: "Starter",
        monthlyPricePaise: 250_000,
        seatLimit: 5,
        whatsappNumberLimit: 1,
        storageLimitBytes: 5_000_000_000n,
        modules: ["crm", "inbox", "ai"],
      },
    });
    await platform.subscription.create({
      data: {
        organizationId: on.organizationId,
        planId: plan.id,
        billingCycle: "monthly",
        status: "trial",
        statusChangedAt: testNow,
        trialEndsOn: new Date("2099-01-01"),
        aiAgentPausedAt: testNow,
        aiAgentPausedBy: randomUUID(),
      },
    });
  }

  it("sends the words as one or two messages with ai: tokens, and nothing twice for a repeated token", async () => {
    const on = await actAgency(test);
    const token = on.message.id;
    const messages = ["Hi Rahul! Yes, Kedarkantha runs every Saturday in December.", "How many of you are coming?"];
    const result = done(await act(on, { messages }));
    const sent = await outbound(on);
    expect(tokensOf(sent)).toEqual([`ai:${token}`, `ai:${token}:m2`]);
    expect(sent.map(textOf)).toEqual(messages);
    expect(result.sentIds).toHaveLength(2);
    expect(result.facts).toMatchObject({ agent: "natural", leadId: on.leadId, lastTurnAt: actNow.toISOString() });

    expect(await act(on, { messages })).toBe("already");
    expect(await outbound(on)).toEqual(sent);

    const one = await actAgency(test);
    done(await act(one, { messages: ["Hi Rahul! Which month suits you?"] }));
    expect(tokensOf(await outbound(one))).toEqual([`ai:${one.message.id}`]);
  });

  it("holds the seats, then sends the agency's payment lines and QR after the words", async () => {
    const on = await actAgency(test);
    const token = on.message.id;
    const figures = await on.quote(threeOn19Dec(on));
    const result = done(
      await act(on, {
        messages: ["Done, Rahul: 3 seats on Sat 19 Dec are held for you."],
        staged: stagedOf(bookOf(figures)),
        quoted: [figures],
      }),
    );
    const sent = await outbound(on);
    expect(tokensOf(sent)).toEqual([`ai:${token}`, `ai:${token}:pay`, `ai:${token}:qr`]);
    expect(textOf(sent[1])).toBe(`UPI: ${NATURAL_UPI}`);
    expect(sent[2]).toMatchObject({ kind: "image", caption: null });
    const booking = await on.inOrg((tx) =>
      tx.aiBooking.findFirstOrThrow({ where: { conversationId: on.chat.id }, include: { quote: true } }),
    );
    expect(result.bookingId).toBe(booking.id);
    expect(Number(booking.expectedPaise)).toBe(figures.advancePaise);
    expect(Number(booking.quote?.totalPaise)).toBe(figures.totalPaise);
    expect(await kept(on)).toMatchObject({ holds: 1, bookings: 1 });
    expect(result.facts.bookingId).toBe(booking.id);
    expect(result.actions).toEqual(expect.arrayContaining(["booking", "pay", "qr"]));
  });

  it("sends a brochure's files captioned with the trip's title", async () => {
    const on = await actAgency(test);
    const token = on.message.id;
    const brochure: StagedAction = { tool: "send_brochure", packageId: on.kedarkantha, fileIds: [on.brochureId] };
    const result = done(await act(on, { messages: ["Here's the Kedarkantha brochure."], staged: stagedOf(brochure) }));
    const sent = await outbound(on);
    expect(tokensOf(sent)).toEqual([`ai:${token}`, `ai:${token}:f1`]);
    expect(sent[1]).toMatchObject({ kind: "document", caption: "Kedarkantha Trek" });
    expect(result.facts.sentTripIds).toEqual([on.kedarkantha]);
    expect(result.facts.sentFileIds).toEqual([on.brochureId]);

    // A file this chat was sent before (by either agent) never goes again.
    const next = await nextTurn(on, "Send the brochure again?", 5);
    done(await act(on, { ...next, messages: ["It's just above."], staged: stagedOf(brochure), facts: result.facts }));
    expect(tokensOf(await outbound(on))).toEqual([`ai:${token}`, `ai:${token}:f1`, `ai:${next.token}`]);
  });

  it("saves update_lead's fields AI-marked, and a person's value stays with the other as a note", async () => {
    const on = await actAgency(test, { adults: 2 });
    const note = "Customer now says 3 adults; the lead says 2.";
    const update: StagedAction = {
      tool: "update_lead",
      fields: {
        packageId: on.kedarkantha,
        day: parseCalendarDate("2026-12-19"),
        adults: 3,
        pickupCity: "Dehradun ISBT",
        name: "Rahul Verma",
      },
      notes: [note],
    };
    const result = done(await act(on, { messages: ["Noted, Rahul."], staged: stagedOf(update), typed: { adults: 2 } }));
    const lead = await on.inOrg(async (tx) => ({
      values: await tripFieldValues(tx, on.leadId),
      marked: await tx.leadAiField.findMany({ where: { leadId: on.leadId }, select: { field: true, state: true } }),
      notes: await tx.leadNote.findMany({ where: { leadId: on.leadId }, select: { body: true, byAi: true } }),
      person: await tx.person.findFirstOrThrow({ where: { id: on.chat.personId ?? "" }, select: { name: true } }),
    }));
    const sankri = on.sheets.find((sheet) => sheet.packageId === on.kedarkantha)?.destinationId;
    expect(lead.values).toMatchObject({
      destination: { kind: "existing", destinationId: sankri },
      when: { kind: "dates", from: "2026-12-19", to: "2026-12-24" },
      departure_city: "Dehradun ISBT",
      // The person's two adults stand, whatever the turn staged.
      adults: 2,
    });
    expect(lead.marked.map((one) => one.field).sort()).toEqual(["departure_city", "destination", "when"]);
    expect(lead.marked.every((one) => one.state === "suggested")).toBe(true);
    expect(lead.notes).toEqual([{ body: note, byAi: true }]);
    expect(lead.person.name).toBe("Rahul Verma");
    expect(result.actions).toEqual(
      expect.arrayContaining(["lead:destination", "lead:when", "lead:departure_city", "name", "note"]),
    );
  });

  it("assigns a task to the lead's owner, due in 2 working hours, and joins a second question to the open one", async () => {
    const on = await actAgency(test);
    const question = (text: string): StagedAction => ({ tool: "create_task", kind: "question", text, callAt: null });
    const tasks = () =>
      on.inOrg((tx) =>
        tx.task.findMany({
          where: { recordId: on.leadId },
          orderBy: { createdAt: "asc" },
          select: { kind: true, title: true, assigneeUserId: true, dueAt: true, byAi: true, recordType: true },
        }),
      );
    const first = done(
      await act(on, {
        messages: ["Let me check that with the team."],
        staged: stagedOf(question("Is there a student discount?")),
      }),
    );
    expect(first.actions).toContain("task:question");
    expect(await tasks()).toEqual([
      {
        kind: "task",
        title: "Is there a student discount?",
        assigneeUserId: on.owner.userId,
        dueAt: addWorkingMinutes(actNow, 120, WORKING, TIME_ZONE),
        byAi: true,
        recordType: "lead",
      },
    ]);

    const second = await nextTurn(on, "Also, can I bring my dog?", 5);
    const joined = done(
      await act(on, {
        ...second,
        messages: ["I'll ask about that too."],
        staged: stagedOf(question("Can they bring a dog?")),
      }),
    );
    expect(joined.actions).toContain("task:joined");
    expect((await tasks()).map((task) => task.title)).toEqual([
      "Is there a student discount?\n— Can they bring a dog?",
    ]);

    // A lead nobody owns: a call-back goes to the member holding leads:assign, due when they asked to be called; the
    // fallback's question joins the open one.
    await on.inOrg((tx) => tx.lead.update({ where: { id: on.leadId }, data: { ownerUserId: null } }));
    const third = await nextTurn(on, "Call me at 6?", 10);
    const callAt = at("2026-10-23", "18:00");
    done(
      await act(on, {
        ...third,
        messages: ["Sure, the team will call you at 6."],
        staged: stagedOf({ tool: "create_task", kind: "call_back", text: "Call Rahul about the dates", callAt }),
        task: { kind: "question", text: "Wants a call at 6" },
      }),
    );
    const after = await tasks();
    expect(after).toHaveLength(2);
    expect(after[0]?.title).toBe("Is there a student discount?\n— Can they bring a dog?\n— Wants a call at 6");
    expect(after[1]).toMatchObject({
      kind: "follow-up",
      title: "Call Rahul about the dates",
      assigneeUserId: ASSIGNER,
      dueAt: callAt,
    });
  });

  it("moves the stage forward only", async () => {
    const on = await actAgency(test);
    const stage = () => on.inOrg(async (tx) => (await tx.lead.findUniqueOrThrow({ where: { id: on.leadId } })).stage);
    // A reply while the trip isn't known leaves the lead New (stages move when their details are complete).
    done(await act(on, { messages: ["Hi Rahul! Which trek are you looking at?"] }));
    expect(await stage()).toBe("new");

    const second = await nextTurn(on, "Kedarkantha", 5);
    const update: StagedAction = { tool: "update_lead", fields: { packageId: on.kedarkantha }, notes: [] };
    done(await act(on, { ...second, messages: ["Lovely choice."], staged: stagedOf(update) }));
    expect(await stage()).toBe("contacted");

    const third = await nextTurn(on, "3 of us, 19 Dec", 10);
    const figures = await on.quote(threeOn19Dec(on));
    const offered = done(
      await act(on, {
        ...third,
        messages: ["For 3 on Sat 19 Dec: total ₹28,497, advance ₹9,000. Shall I book?"],
        staged: stagedOf(offerOf(figures, third.now)),
        quoted: [figures],
      }),
    );
    expect(await stage()).toBe("quote_sent");
    expect(offered.facts.offer).toMatchObject({ packageId: on.kedarkantha, totalPaise: figures.totalPaise });
    expect(offered.facts.told).toEqual([
      expect.objectContaining({ startsOn: "2026-12-19", adults: 3, totalPaise: figures.totalPaise }),
    ]);

    await on.inOrg((tx) => tx.lead.update({ where: { id: on.leadId }, data: { stage: "booking_requested" } }));
    const fourth = await nextTurn(on, "Ok thanks", 15);
    const back = done(
      await act(on, { ...fourth, messages: ["Anytime!"], staged: stagedOf(update), facts: offered.facts }),
    );
    expect(await stage()).toBe("booking_requested");
    expect(back.actions.some((code) => code.startsWith("stage:"))).toBe(false);
    // A turn that made no offer ends the last one; the totals told stay.
    expect(back.facts.offer).toBeNull();
    expect(back.facts.told).toHaveLength(1);
  });

  it("hands over, tells the owner, and keeps the reason", async () => {
    const on = await actAgency(test);
    const result = done(
      await act(on, {
        messages: ["I've asked the team about a group price; they'll reply here."],
        handOver: { reason: "discount", summary: "Wants 20% off for 6 people" },
      }),
    );
    const reason = "Asked for a discount or a better price: Wants 20% off for 6 people";
    expect(result).toMatchObject({ handedOver: true });
    expect(result.actions).toContain("handover:discount");
    expect(await chatState(on)).toMatchObject({ handedOffAt: actNow, handoffReason: reason, followUpAt: null });
    const notice = await on.inOrg((tx) =>
      tx.notification.findFirstOrThrow({
        where: { kind: "ai.handoff" },
        select: { recipientUserId: true, body: true },
      }),
    );
    expect(notice).toEqual({ recipientUserId: on.owner.userId, body: reason });
    // In the agency's audit log by its code alone: the summary may hold the customer's words.
    const audited = await on.inOrg((tx) =>
      tx.auditEntry.findMany({
        where: { action: "ai.chat-handed-off" },
        select: { actorUserId: true, entityType: true, entityId: true, after: true },
      }),
    );
    expect(audited).toEqual([
      { actorUserId: null, entityType: "whatsapp_conversation", entityId: on.chat.id, after: { reason: "discount" } },
    ]);
  });

  it("hands over at the day's cap, while the cap stops any other reply", async () => {
    const on = await actAgency(test);
    await on.inOrg(async (tx) => {
      const { maxRepliesPerDay } = await tx.aiAutopilot.findFirstOrThrow();
      await tx.aiChat.upsert({
        where: { organizationId_conversationId: { organizationId: on.organizationId, conversationId: on.chat.id } },
        create: { conversationId: on.chat.id, repliesOn: replyDayOf(actNow), repliesCount: maxRepliesPerDay },
        update: { repliesOn: replyDayOf(actNow), repliesCount: maxRepliesPerDay },
      });
    });
    expect(await act(on, { messages: ["Kedarkantha is lovely in December."] })).toEqual({ stopped: "day_limit" });
    expect(await kept(on)).toEqual(nothingKept);

    const line = "Let me check this with the team; they'll reply here.";
    const result = done(await act(on, { messages: [line], handOver: { reason: "day_cap", summary: "" } }));
    expect(tokensOf(await outbound(on))).toEqual([`ai:${on.message.id}`]);
    expect(result.handedOver).toBe(true);
    expect((await chatState(on)).handoffReason).toBe("Wrote more than the AI answers in a day");
  });

  it("plans the follow-up the model chose, in waking hours", async () => {
    const on = await actAgency(test);
    const tomorrow = at("2026-10-24", "10:00");
    done(
      await act(on, {
        messages: ["Take your time and tell me which date suits you."],
        staged: stagedOf({ tool: "plan_follow_up", at: tomorrow, about: "Ask which date suits them" }),
      }),
    );
    // The reply's time is the turn's own, the same as its messages', so a reaction on them counts (ruling 13).
    expect(await chatState(on)).toMatchObject({
      followUpAt: tomorrow,
      followUpReason: "Ask which date suits them",
      followUpsSent: 0,
      lastReplyAt: actNow,
    });
    expect((await outbound(on)).map((message) => message.occurredAt)).toEqual([actNow]);

    // A time at night goes at 9 the next morning instead.
    const late = await actAgency(test);
    done(
      await act(late, {
        messages: ["I'll check back later."],
        staged: stagedOf({ tool: "plan_follow_up", at: at("2026-10-23", "23:30"), about: "Check back" }),
      }),
    );
    expect((await chatState(late)).followUpAt).toEqual(at("2026-10-24", "09:00"));
  });

  it("counts a follow-up it sends, and a reaction on our message stops the next", async () => {
    const on = await actAgency(test);
    const fourHours = at("2026-10-23", "19:31");
    done(
      await act(on, {
        messages: ["Which date suits you?"],
        staged: stagedOf({ tool: "plan_follow_up", at: fourHours, about: "Ask about the date" }),
      }),
    );
    const nudge = { kind: "nudge" as const, token: `nudge:${on.chat.id}:1`, now: fourHours };
    done(await act(on, { ...nudge, messages: ["Hi Rahul, did a date work out?"] }));
    const counted = await chatState(on);
    expect(counted).toMatchObject({ followUpsSent: 1, lastNudgeAt: fourHours, lastReplyAt: fourHours });
    // The second follow-up, about 20 hours after the customer's line, in waking hours.
    expect(counted.followUpAt).toEqual(new Date(testNow.getTime() + 20 * 3_600_000));

    await on.inOrg((tx) =>
      tx.whatsappMessage.updateMany({
        where: { conversationId: on.chat.id, clientToken: `ai:${nudge.token}` },
        data: { reaction: "👍" },
      }),
    );
    const second = { kind: "nudge" as const, token: `nudge:${on.chat.id}:2`, now: counted.followUpAt ?? actNow };
    expect(await act(on, { ...second, messages: ["Just checking in!"] })).toEqual({ stopped: "answered" });
  });

  it("sends nothing and keeps nothing when a person replied while the model worked", async () => {
    const on = await actAgency(test);
    const figures = await on.quote(threeOn19Dec(on));
    const turn = {
      messages: ["Done: 3 seats held."],
      staged: stagedOf(
        bookOf(figures),
        { tool: "add_note", text: "Keen on 19 Dec" },
        { tool: "create_task", kind: "question", text: "Is there a student discount?", callAt: null },
      ),
      quoted: [figures],
    };
    await on.inOrg((tx) =>
      tx.whatsappMessage.create({
        data: {
          conversationId: on.chat.id,
          direction: "out",
          origin: "staff_crm",
          kind: "text",
          body: "Hi Rahul, I'll call you in five minutes.",
          status: "sent",
          occurredAt: new Date(testNow.getTime() + 20_000),
        },
      }),
    );
    expect(await act(on, turn)).toEqual({ stopped: "answered" });
    expect(await kept(on)).toEqual(nothingKept);

    // A person takes the chat over while the act works (the booking asks whom to tell partway through). The chat's AI
    // row is there already, as the customer's line left it queued for this turn.
    const taken = await actAgency(test);
    await taken.inOrg((tx) => tx.aiChat.create({ data: { conversationId: taken.chat.id, turnState: "thinking" } }));
    const takeOver = async () => {
      await platform.aiChat.upsert({
        where: {
          organizationId_conversationId: { organizationId: taken.organizationId, conversationId: taken.chat.id },
        },
        create: { organizationId: taken.organizationId, conversationId: taken.chat.id, mode: "off" },
        update: { mode: "off" },
      });
      return [];
    };
    const takenFigures = await taken.quote(threeOn19Dec(taken));
    const refused = await act(
      taken,
      { ...turn, staged: stagedOf(bookOf(takenFigures)), quoted: [takenFigures] },
      deps({ recipients: takeOver }),
    ).catch(failure);
    expect(refused).toBe("AGENT_STOPPED");
    expect(await kept(taken)).toEqual(nothingKept);
  });

  it("rolls everything back and answers refused when the seats went", async () => {
    const on = await actAgency(test);
    const figures = await on.quote(threeOn19Dec(on));
    await holdSeats(on, figures.departureId, 18);
    const result = await act(on, {
      messages: ["Done: 3 seats held."],
      staged: stagedOf(bookOf(figures), { tool: "add_note", text: "Booked 19 Dec" }),
      quoted: [figures],
    });
    expect(result).toEqual({ refused: "NOT_ENOUGH_SEATS", message: expect.any(String) as unknown });
    expect(await kept(on)).toEqual(nothingKept);

    // A lapsed hold whose seats went meanwhile: the old booking is cancelled only with the new one, so it stays.
    const lapsed = await actAgency(test);
    const terms = threeOn19Dec(lapsed);
    const told = await lapsed.quote(terms);
    done(await act(lapsed, { messages: ["Held."], staged: stagedOf(bookOf(told)), quoted: [told] }));
    await lapsed.inOrg((tx) =>
      tx.departureHold.updateMany({ where: { leadId: lapsed.leadId }, data: { expiresAt: testNow } }),
    );
    await holdSeats(lapsed, told.departureId, 18);
    const next = await nextTurn(lapsed, "Please send the QR again", 5);
    const facts = { ...freshFacts(), told: [{ ...terms, totalPaise: told.totalPaise, at: actNow.toISOString() }] };
    const again = await act(lapsed, {
      ...next,
      messages: ["Here it is again."],
      staged: stagedOf({ tool: "resend_payment" }),
      facts,
    });
    expect(again).toMatchObject({ refused: "NOT_ENOUGH_SEATS" });
    const bookings = await lapsed.inOrg((tx) =>
      tx.aiBooking.findMany({ where: { conversationId: lapsed.chat.id }, select: { status: true } }),
    );
    expect(bookings).toEqual([{ status: "awaiting_payment" }]);
    expect(tokensOf(await outbound(lapsed))).toEqual([
      `ai:${lapsed.message.id}`,
      `ai:${lapsed.message.id}:pay`,
      `ai:${lapsed.message.id}:qr`,
    ]);
  });

  it("takes a lapsed hold again at the total told before the payment details go again", async () => {
    const on = await actAgency(test);
    const terms = threeOn19Dec(on);
    const figures = await on.quote(terms);
    const first = done(await act(on, { messages: ["Held."], staged: stagedOf(bookOf(figures)), quoted: [figures] }));
    await on.inOrg((tx) => tx.departureHold.updateMany({ where: { leadId: on.leadId }, data: { expiresAt: testNow } }));
    const next = await nextTurn(on, "Please send the QR again", 5);
    const facts = { ...first.facts, told: [{ ...terms, totalPaise: figures.totalPaise, at: actNow.toISOString() }] };
    const again = done(
      await act(on, { ...next, messages: ["Here it is again."], staged: stagedOf({ tool: "resend_payment" }), facts }),
    );
    expect(again.bookingId).not.toBeNull();
    expect(again.bookingId).not.toBe(first.bookingId);
    const bookings = await on.inOrg((tx) =>
      tx.aiBooking.findMany({ where: { conversationId: on.chat.id }, select: { id: true, status: true } }),
    );
    expect(bookings).toEqual(
      expect.arrayContaining([
        { id: first.bookingId, status: "cancelled" },
        { id: again.bookingId, status: "awaiting_payment" },
      ]),
    );
    expect(tokensOf(await outbound(on)).slice(3)).toEqual([
      `ai:${next.token}`,
      `ai:${next.token}:pay`,
      `ai:${next.token}:qr`,
    ]);
    expect(await kept(on)).toMatchObject({ holds: 1, bookings: 1 });
  });

  it("rolls everything back when the agent was paused during the act", async () => {
    const on = await actAgency(test);
    const figures = await on.quote(threeOn19Dec(on));
    // The booking asks whom to tell partway through the act: the pause lands then, from another connection.
    const pausing = deps({ recipients: async () => (await pause(on), []) });
    const refused = await act(
      on,
      {
        messages: ["Done: 3 seats held."],
        staged: stagedOf(bookOf(figures), { tool: "add_note", text: "Booked 19 Dec" }),
        quoted: [figures],
      },
      pausing,
    ).catch(failure);
    expect(refused).toBe("AGENT_PAUSED");
    expect(await kept(on)).toEqual(nothingKept);
  });
});
