// The natural agent's live act against the real database (plan 2, Task 5): in the turn's one transaction it sends the
// model's words as one or two messages, a brochure's files, and after a hold the agency's payment lines and QR; it saves
// the lead's fields, notes and tasks, moves the stage forward, hands over, and settles the chat. A person replying while
// the model worked, a pause, or seats that went send nothing and keep nothing.
import { randomUUID } from "node:crypto";
import { naturalFacts, type BookingTerms, type NaturalFacts } from "@travel-crm/contracts/ai";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { AI_BOOKING_KIND } from "../../../src/ai/booking.js";
import { replyDayOf } from "../../../src/ai/may-write.js";
import {
  actOnNaturalTurn,
  type NaturalActDeps,
  type NaturalActInput,
  type NaturalActResult,
} from "../../../src/ai/natural/act.js";
import { offerButtons } from "../../../src/ai/one/card.js";
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
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { FIRST_AT, liveAgency, liveNow, liveToday, type LiveAgency } from "./support/live-agency.js";
import { NATURAL_UPI } from "./support/natural-agency.js";

const TIME_ZONE = "Asia/Kolkata";
const MINUTE_MS = 60_000;
/** Open every day, 10 am to 7 pm. */
const WORKING: WorkingHours = { workdays: 127, opensMinute: 10 * 60, closesMinute: 19 * 60 };
/** Who gets a task on a lead nobody owns: the first member holding leads:assign, read before the act. */
const ASSIGNER = randomUUID();

const freshFacts = (): NaturalFacts => naturalFacts.parse({ agent: "natural" });
const stagedSet = (...actions: StagedAction[]): StagedSet => new Map(actions.map((action) => [action.tool, action]));
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
    supplierStateCode: "05",
    taskOwner: ASSIGNER,
    workingHours: WORKING,
    ...changes,
  });
  const inputOf = (on: LiveAgency, changes: Partial<NaturalActInput>): NaturalActInput => ({
    organizationId: on.organizationId,
    conversationId: on.chat.id,
    token: on.message.id,
    kind: "reply",
    now: liveNow,
    timeZone: TIME_ZONE,
    today: liveToday,
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
  const act = (on: LiveAgency, changes: Partial<NaturalActInput> = {}, actDeps = deps()) =>
    on.inOrg((tx) => actOnNaturalTurn(tx, actDeps, inputOf(on, changes)));

  const outbound = (on: LiveAgency) =>
    on.inOrg((tx) =>
      tx.whatsappMessage.findMany({
        where: { conversationId: on.chat.id, direction: "out" },
        orderBy: { createdAt: "asc" },
        select: { clientToken: true, body: true, caption: true, kind: true, occurredAt: true },
      }),
    );
  const tokensOf = (sent: readonly { clientToken: string | null }[]) => sent.map((message) => message.clientToken);
  const textOf = (message: { body: string | null } | undefined) => message?.body ?? null;
  const chatState = (on: LiveAgency) =>
    on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
  /** What a turn could have kept: seats, bookings, quotes, the AI's messages, tasks, notes, the chat's reply time. */
  const kept = (on: LiveAgency) =>
    on.inOrg(async (tx) => ({
      holds: await tx.departureHold.count({ where: { leadId: on.leadId, status: "active" } }),
      bookings: await tx.aiBooking.count({ where: { conversationId: on.chat.id, status: "awaiting_payment" } }),
      quotes: await tx.quote.count({ where: { leadId: on.leadId } }),
      sent: await tx.whatsappMessage.count({
        where: { conversationId: on.chat.id, clientToken: { startsWith: "ai:" } },
      }),
      tasks: await tx.task.count({ where: { recordId: on.leadId } }),
      notes: await tx.leadNote.count({ where: { leadId: on.leadId, byAi: true } }),
      lastReplyAt:
        (await tx.aiChat.findFirst({ where: { conversationId: on.chat.id }, select: { lastReplyAt: true } }))
          ?.lastReplyAt ?? null,
    }));
  const nothingKept = { holds: 0, bookings: 0, quotes: 0, sent: 0, tasks: 0, notes: 0, lastReplyAt: null };

  /** Three adults in a triple tent on Kedarkantha's 19 Dec batch: ₹9,499 each, ₹3,000 each to book. */
  const threeOn19Dec = (on: LiveAgency): BookingTerms => ({
    packageId: on.kedarkantha,
    startsOn: parseCalendarDate("2026-12-19"),
    adults: 3,
    childrenAges: [],
    room: "triple",
    payInFull: false,
  });
  const bookOf = (figures: QuoteFigures, fullName = "Rahul Verma"): StagedAction => ({
    tool: "book",
    terms: figures.terms,
    figures,
    fullName,
    customerWords: "haan book karo",
    via: "offer",
  });
  const offerOf = (figures: QuoteFigures, now = liveNow): StagedAction => ({
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
  async function nextTurn(on: LiveAgency, text: string, minutes: number) {
    const line = await on.say(text, new Date(liveNow.getTime() + (minutes - 1) * MINUTE_MS));
    return { token: line.id, now: new Date(liveNow.getTime() + minutes * MINUTE_MS) };
  }
  /** Seats held on the 19 Dec batch for another lead, as staff hold them. */
  const holdSeats = (on: LiveAgency, departureId: string, seats: number) =>
    on.inOrg(async (tx) =>
      tx.departureHold.create({
        data: { departureId, leadId: (await aLead(tx)).id, seats, expiresAt: new Date("2027-01-01") },
      }),
    );

  /** Pauses the agent for this agency, from the platform's own connection, as platform staff do. */
  async function pause(on: LiveAgency) {
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
        statusChangedAt: FIRST_AT,
        trialEndsOn: new Date("2099-01-01"),
        aiAgentPausedAt: FIRST_AT,
        aiAgentPausedBy: randomUUID(),
      },
    });
  }

  it("sends the words as one or two messages with ai: tokens, and nothing twice for a repeated token", async () => {
    const on = await liveAgency(test);
    const token = on.message.id;
    const messages = ["Hi Rahul! Yes, Kedarkantha runs every Saturday in December.", "How many of you are coming?"];
    const result = done(await act(on, { messages }));
    const sent = await outbound(on);
    expect(tokensOf(sent)).toEqual([`ai:${token}`, `ai:${token}:m2`]);
    expect(sent.map(textOf)).toEqual(messages);
    expect(result.sentIds).toHaveLength(2);
    expect(result.facts).toMatchObject({ agent: "natural", leadId: on.leadId, lastTurnAt: liveNow.toISOString() });

    expect(await act(on, { messages })).toBe("already");
    expect(await outbound(on)).toEqual(sent);

    const one = await liveAgency(test);
    done(await act(one, { messages: ["Hi Rahul! Which month suits you?"] }));
    expect(tokensOf(await outbound(one))).toEqual([`ai:${one.message.id}`]);
  });

  it("sends the card after the words, once per turn", async () => {
    const on = await liveAgency(test);
    const token = on.message.id;
    const figures = await on.quote(threeOn19Dec(on));
    const offerId = "0194f5a0-0000-7000-8000-000000000002";
    const made = offerOf(figures);
    if (made.tool !== "offer_booking") throw new Error("not an offer");
    const offer: StagedAction = { ...made, card: true, offer: { ...made.offer, id: offerId } };
    const changes = { messages: ["Ye raha aapka offer."], staged: stagedSet(offer), quoted: [figures] };
    const result = done(await act(on, changes));
    const sent = await outbound(on);
    expect(tokensOf(sent)).toEqual([`ai:${token}`, `ai:${token}:card`]);
    expect(textOf(sent[1])).toContain("Total ₹28,497");
    expect(result.facts.offer?.id).toBe(offerId);
    const card = await on.inOrg((tx) =>
      tx.whatsappMessage.findFirstOrThrow({ where: { clientToken: `ai:${token}:card` }, select: { buttons: true } }),
    );
    expect(card.buttons).toEqual(offerButtons(offerId));
    expect(await act(on, changes)).toBe("already");
    expect(tokensOf(await outbound(on))).toEqual(tokensOf(sent));
  });

  it("sends no card beside a booking or a hand-over staged in the same turn", async () => {
    const on = await liveAgency(test);
    const figures = await on.quote(threeOn19Dec(on));
    const made = { ...offerOf(figures), card: true } as StagedAction;
    const idOf = (action: StagedAction): StagedAction =>
      action.tool === "offer_booking"
        ? { ...action, offer: { ...action.offer, id: "0194f5a0-0000-7000-8000-000000000003" } }
        : action;
    done(await act(on, { messages: ["Done."], staged: stagedSet(idOf(made), bookOf(figures)), quoted: [figures] }));
    expect(tokensOf(await outbound(on)).filter((token) => token?.endsWith(":card"))).toEqual([]);

    const other = await liveAgency(test);
    const handed = await act(other, {
      messages: ["Ek minute."],
      staged: stagedSet(idOf(made)),
      handOver: { reason: "discount", summary: "Wants a discount" },
    });
    done(handed);
    expect(tokensOf(await outbound(other)).filter((token) => token?.endsWith(":card"))).toEqual([]);
  });

  it("sends nothing on a fallback, no words and no card, and leaves the team its task", async () => {
    const on = await liveAgency(test);
    const task = { kind: "question" as const, text: "The AI wrote no reply, so nothing went to the customer." };
    const result = done(await act(on, { messages: [], task }));
    expect(await outbound(on)).toEqual([]);
    expect(result.sentIds).toEqual([]);
    const tasks = await on.inOrg((tx) => tx.task.findMany({ where: { byAi: true }, select: { title: true } }));
    expect(tasks).toEqual([{ title: task.text }]);
  });

  it("holds the seats, then sends the agency's payment lines and QR after the words", async () => {
    const on = await liveAgency(test);
    const token = on.message.id;
    const figures = await on.quote(threeOn19Dec(on));
    const result = done(
      await act(on, {
        messages: ["Done, Rahul: 3 seats on Sat 19 Dec are held for you."],
        staged: stagedSet(bookOf(figures)),
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

  it("keeps the full name the customer booked under, which the managers' notice names", async () => {
    // WhatsApp's profile says only "R"; they booked as Rohan Mehta (spec case 8).
    const on = await liveAgency(test, { customerName: "R" });
    const figures = await on.quote(threeOn19Dec(on));
    const result = done(
      await act(on, {
        messages: ["Done, Rohan: 3 seats on Sat 19 Dec are held for you."],
        staged: stagedSet(bookOf(figures, "Rohan Mehta")),
        quoted: [figures],
      }),
    );
    expect(result.actions).toContain("name");
    const seen = await on.inOrg(async (tx) => ({
      person: (await tx.person.findUniqueOrThrow({ where: { id: on.chat.personId ?? "" } })).name,
      notice: (await tx.notification.findFirstOrThrow({ where: { kind: AI_BOOKING_KIND } })).title,
    }));
    expect(seen).toEqual({ person: "Rohan Mehta", notice: "New booking: Rohan Mehta said yes" });
  });

  it("keeps the booked name as a note beside a name a person typed, which stands", async () => {
    const on = await liveAgency(test);
    // The team typed the customer's name: neither a WhatsApp stand-in nor their profile name ("Rahul").
    await on.inOrg((tx) => tx.person.update({ where: { id: on.chat.personId ?? "" }, data: { name: "Rahul Sharma" } }));
    const figures = await on.quote(threeOn19Dec(on));
    const result = done(
      await act(on, {
        messages: ["Done: 3 seats on Sat 19 Dec are held for you."],
        staged: stagedSet(bookOf(figures, "Rahul Verma")),
        quoted: [figures],
      }),
    );
    expect(result.actions).not.toContain("name");
    const seen = await on.inOrg(async (tx) => ({
      person: (await tx.person.findUniqueOrThrow({ where: { id: on.chat.personId ?? "" } })).name,
      noted: await tx.leadNote.count({
        where: { leadId: on.leadId, byAi: true, body: "Booked under the name Rahul Verma." },
      }),
    }));
    expect(seen).toEqual({ person: "Rahul Sharma", noted: 1 });
  });

  it("sends a brochure's files captioned with the trip's title", async () => {
    const on = await liveAgency(test);
    const token = on.message.id;
    const brochure: StagedAction = { tool: "send_brochure", packageId: on.kedarkantha, fileIds: [on.brochureId] };
    const result = done(await act(on, { messages: ["Here's the Kedarkantha brochure."], staged: stagedSet(brochure) }));
    const sent = await outbound(on);
    expect(tokensOf(sent)).toEqual([`ai:${token}`, `ai:${token}:f1`]);
    expect(sent[1]).toMatchObject({ kind: "document", caption: "Kedarkantha Trek" });
    expect(result.facts.sentTripIds).toEqual([on.kedarkantha]);
    expect(result.facts.sentFileIds).toEqual([on.brochureId]);

    // A file this chat was sent before (by either agent) never goes again.
    const next = await nextTurn(on, "Send the brochure again?", 5);
    done(await act(on, { ...next, messages: ["It's just above."], staged: stagedSet(brochure), facts: result.facts }));
    expect(tokensOf(await outbound(on))).toEqual([`ai:${token}`, `ai:${token}:f1`, `ai:${next.token}`]);
  });

  it("sends the brochure again with its name as the caption, within three files", async () => {
    const on = await liveAgency(test);
    const token = on.message.id;
    const asked: StagedAction = { tool: "send_brochure", packageId: on.kedarkantha, fileIds: [on.brochureId] };
    const first = done(await act(on, { messages: ["Here it is."], staged: stagedSet(asked) }));
    const next = await nextTurn(on, "Send the brochure again?", 5);
    // The one agent's stage: more files than three are cut by the act, and the brochure goes though this chat had it.
    const again: StagedAction = {
      ...asked,
      fileIds: [on.brochureId, randomUUID(), randomUUID(), randomUUID()],
      caption: "Winter plan",
      resend: [on.brochureId],
    };
    done(await act(on, { ...next, messages: ["Here again."], staged: stagedSet(again), facts: first.facts }));
    const sent = await outbound(on);
    expect(tokensOf(sent)).toEqual([`ai:${token}`, `ai:${token}:f1`, `ai:${next.token}`, `ai:${next.token}:f1`]);
    expect(sent[3]).toMatchObject({ kind: "document", caption: "Winter plan" });
  });

  it("skips a brochure removed since the turn read it, and still answers", async () => {
    const on = await liveAgency(test);
    const gone: StagedAction = {
      tool: "send_brochure",
      packageId: on.kedarkantha,
      fileIds: [randomUUID()],
      caption: "Winter plan",
      resend: [],
    };
    done(await act(on, { messages: ["Here it is."], staged: stagedSet(gone) }));
    expect(tokensOf(await outbound(on))).toEqual([`ai:${on.message.id}`]);
  });

  it("saves update_lead's fields AI-marked, and a person's value stays with the other as a note", async () => {
    const on = await liveAgency(test, { adults: 2 });
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
    const result = done(
      await act(on, { messages: ["Noted, Rahul."], staged: stagedSet(update), typed: { adults: 2 } }),
    );
    const lead = await on.inOrg(async (tx) => ({
      values: await tripFieldValues(tx, on.leadId),
      marked: await tx.leadAiField.findMany({ where: { leadId: on.leadId }, select: { field: true, state: true } }),
      notes: await tx.leadNote.findMany({
        where: { leadId: on.leadId, byAi: true },
        select: { body: true, byAi: true },
      }),
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

    // A day alone takes its nights from the trip the chat offered.
    const figures = await on.quote(threeOn19Dec(on));
    const offer = offerOf(figures);
    const facts = { ...result.facts, offer: offer.tool === "offer_booking" ? offer.offer : null };
    const later = await nextTurn(on, "Make it the 26th", 5);
    const day: StagedAction = { tool: "update_lead", fields: { day: parseCalendarDate("2026-12-26") }, notes: [] };
    done(await act(on, { ...later, messages: ["Done."], staged: stagedSet(day), facts }));
    expect((await on.inOrg((tx) => tripFieldValues(tx, on.leadId)))?.when).toEqual({
      kind: "dates",
      from: "2026-12-26",
      to: "2026-12-31",
    });
  });

  it("assigns a task to the lead's owner, due in 2 working hours, and joins a second question to the open one", async () => {
    const on = await liveAgency(test);
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
        messages: ["Let me check that and get back to you here."],
        staged: stagedSet(question("Is there a student discount?")),
      }),
    );
    expect(first.actions).toContain("task:question");
    expect(await tasks()).toEqual([
      {
        kind: "task",
        title: "Is there a student discount?",
        assigneeUserId: on.owner.userId,
        dueAt: addWorkingMinutes(liveNow, 120, WORKING, TIME_ZONE),
        byAi: true,
        recordType: "lead",
      },
    ]);

    const second = await nextTurn(on, "Also, can I bring my dog?", 5);
    const joined = done(
      await act(on, {
        ...second,
        messages: ["I'll ask about that too."],
        staged: stagedSet(question("Can they bring a dog?")),
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
    const callAt = at("2026-11-20", "18:00");
    done(
      await act(on, {
        ...third,
        messages: ["Sure, we will call you at 6."],
        staged: stagedSet({ tool: "create_task", kind: "call_back", text: "Call Rahul about the dates", callAt }),
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

  it("keeps a task's whole text in a lead note when its title can't hold it, and never loses a joined question", async () => {
    const on = await liveAgency(test);
    const POINTER = " (details in the lead's note)";
    const titles = async () =>
      (
        await on.inOrg((tx) =>
          tx.task.findMany({ where: { recordId: on.leadId }, orderBy: { createdAt: "asc" }, select: { title: true } }),
        )
      ).map((task) => task.title);
    const notes = async () =>
      (
        await on.inOrg((tx) =>
          tx.leadNote.findMany({ where: { leadId: on.leadId, byAi: true }, select: { body: true } }),
        )
      ).map((note) => note.body);
    const question = (text: string): StagedAction => ({ tool: "create_task", kind: "question", text, callAt: null });
    done(await act(on, { messages: ["Let me check."], staged: stagedSet(question("Is there a student discount?")) }));

    // A question the joined title can't hold: the title points to the note, which holds the title's questions and the
    // new one whole.
    const fitness = `Can a first-timer who runs ${"5 km twice a week and climbs stairs at the office, ".repeat(3)}do it?`;
    expect(fitness.length).toBeGreaterThan(150);
    const second = await nextTurn(on, "Am I fit enough?", 5);
    const joined = done(
      await act(on, { ...second, messages: ["Let me check."], staged: stagedSet(question(fitness)) }),
    );
    expect(joined.actions).toContain("task:joined");
    expect(await titles()).toEqual([`Is there a student discount?${POINTER}`]);
    expect(await notes()).toEqual([`Question for the team: Is there a student discount?\n— ${fitness}`]);

    // The fallback's task (ruling 6, up to 500 characters) and a long call-back: each title is cut at a word and points
    // to its note, which holds the text whole.
    const fallback = `The AI didn't answer (timeout), so nothing went to the customer. They wrote: "${"x ".repeat(80)}". Not done: may want to book Kedarkantha for 3 on 19 Dec.`;
    const callBack = `Call Rahul: ${"he wants to talk through the trek day by day before he books, ".repeat(4)}`;
    const third = await nextTurn(on, "Please call me", 10);
    done(
      await act(on, {
        ...third,
        messages: ["Sure."],
        staged: stagedSet({ tool: "create_task", kind: "call_back", text: callBack, callAt: null }),
        task: { kind: "question", text: fallback },
      }),
    );
    const [first, called] = await titles();
    expect(first).toBe(`Is there a student discount?${POINTER}`);
    expect(called?.length).toBeLessThanOrEqual(200);
    expect(called?.endsWith(`…${POINTER}`)).toBe(true);
    expect(await notes()).toEqual(
      expect.arrayContaining([`Question for the team: ${fallback}`, `Call back: ${callBack.trim()}`]),
    );

    // A quiet turn's task, its job run twice, is added once.
    const quietTurn = await nextTurn(on, "Also my friend may join", 15);
    const quiet = {
      ...quietTurn,
      staged: stagedSet(
        { tool: "stay_quiet", reason: "Nothing to say yet" },
        { tool: "create_task", kind: "call_back", text: "Ask if the friend is joining", callAt: null },
      ),
    };
    done(await act(on, quiet));
    done(await act(on, quiet));
    expect((await titles()).filter((title) => title === "Ask if the friend is joining")).toHaveLength(1);
  });

  it("notes every question the open title held when it first points to the note", async () => {
    const on = await liveAgency(test);
    const question = (text: string): StagedAction => ({ tool: "create_task", kind: "question", text, callAt: null });
    const first = `Does the trek fee cover ${"the tents, the meals and the porters on every day of it, ".repeat(2)}and the permits?`;
    expect(first).toHaveLength(154);
    done(await act(on, { messages: ["Let me check."], staged: stagedSet(question(first)) }));
    const second = await nextTurn(on, "And a student discount?", 5);
    const discount = question("Is there a student discount?");
    done(await act(on, { ...second, messages: ["Let me check."], staged: stagedSet(discount) }));
    const joined = `${first}\n— Is there a student discount?`;
    // The second still fits in the title, at 185 characters.
    expect(joined).toHaveLength(185);
    const title = () =>
      on.inOrg(async (tx) => (await tx.task.findFirstOrThrow({ where: { recordId: on.leadId } })).title);
    expect(await title()).toBe(joined);

    // The third doesn't (209): the title is cut and points to the note, which holds all three whole.
    const third = await nextTurn(on, "Can I bring my dog?", 10);
    done(
      await act(on, { ...third, messages: ["Let me check."], staged: stagedSet(question("Can they bring a dog?")) }),
    );
    expect((await title()).endsWith("… (details in the lead's note)")).toBe(true);
    const notes = await on.inOrg((tx) =>
      // The fixture's lead has its own note too: only the questions' notes are read.
      tx.leadNote.findMany({
        where: { leadId: on.leadId, body: { startsWith: "Question for the team" } },
        select: { body: true },
      }),
    );
    expect(notes).toEqual([{ body: `Question for the team: ${joined}\n— Can they bring a dog?` }]);
  });

  it("moves the stage forward only", async () => {
    const on = await liveAgency(test);
    const stage = () => on.inOrg(async (tx) => (await tx.lead.findUniqueOrThrow({ where: { id: on.leadId } })).stage);
    // A reply while the trip isn't known leaves the lead New (stages move when their details are complete).
    done(await act(on, { messages: ["Hi Rahul! Which trek are you looking at?"] }));
    expect(await stage()).toBe("new");

    const second = await nextTurn(on, "Kedarkantha", 5);
    const update: StagedAction = { tool: "update_lead", fields: { packageId: on.kedarkantha }, notes: [] };
    done(await act(on, { ...second, messages: ["Lovely choice."], staged: stagedSet(update) }));
    expect(await stage()).toBe("contacted");

    const third = await nextTurn(on, "3 of us, 19 Dec", 10);
    const figures = await on.quote(threeOn19Dec(on));
    const offered = done(
      await act(on, {
        ...third,
        messages: ["For 3 on Sat 19 Dec: total ₹28,497, advance ₹9,000. Shall I book?"],
        staged: stagedSet(offerOf(figures, third.now)),
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
      await act(on, { ...fourth, messages: ["Anytime!"], staged: stagedSet(update), facts: offered.facts }),
    );
    expect(await stage()).toBe("booking_requested");
    expect(back.actions.some((code) => code.startsWith("stage:"))).toBe(false);
    // A turn that made no offer ends the last one; the totals told stay.
    expect(back.facts.offer).toBeNull();
    expect(back.facts.told).toHaveLength(1);
  });

  it("hands over, tells the owner, and keeps the reason", async () => {
    const on = await liveAgency(test);
    const result = done(
      await act(on, {
        messages: ["Let me check a group price for you and get back to you here."],
        handOver: { reason: "discount", summary: "Wants 20% off for 6 people" },
      }),
    );
    const reason = "Asked for a discount or a better price: Wants 20% off for 6 people";
    expect(result).toMatchObject({ handedOver: true });
    expect(result.actions).toContain("handover:discount");
    expect(await chatState(on)).toMatchObject({ handedOffAt: liveNow, handoffReason: reason, followUpAt: null });
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
    /** The chat at the day's cap. */
    const atTheCap = (on: LiveAgency) =>
      on.inOrg(async (tx) => {
        const { maxRepliesPerDay } = await tx.aiAutopilot.findFirstOrThrow();
        await tx.aiChat.upsert({
          where: { organizationId_conversationId: { organizationId: on.organizationId, conversationId: on.chat.id } },
          create: { conversationId: on.chat.id, repliesOn: replyDayOf(liveNow), repliesCount: maxRepliesPerDay },
          update: { repliesOn: replyDayOf(liveNow), repliesCount: maxRepliesPerDay },
        });
      });
    const on = await liveAgency(test);
    await atTheCap(on);
    expect(await act(on, { messages: ["Kedarkantha is lovely in December."] })).toEqual({ stopped: "day_limit" });
    expect(await kept(on)).toEqual(nothingKept);

    // Code's hand-over at the cap sends nothing (the owner, 2026-11-24: no automatic holding line).
    const result = done(await act(on, { messages: [], handOver: { reason: "day_cap", summary: "" } }));
    expect(await outbound(on)).toEqual([]);
    expect(result.handedOver).toBe(true);
    expect((await chatState(on)).handoffReason).toBe("Wrote more than the AI answers in a day");

    // The month's limit reached as well: its hand-over goes too, whichever of the two the turn names.
    const both = await liveAgency(test);
    await atTheCap(both);
    done(await act(both, { messages: [], handOver: { reason: "month_limit", summary: "" } }));
    expect((await chatState(both)).handoffReason).toBe("This month's AI credits are used up");
  });

  it("plans the follow-up the model chose, in waking hours", async () => {
    const on = await liveAgency(test);
    const tomorrow = at("2026-11-21", "10:00");
    done(
      await act(on, {
        messages: ["Take your time and tell me which date suits you."],
        staged: stagedSet({ tool: "plan_follow_up", at: tomorrow, about: "Ask which date suits them" }),
      }),
    );
    // The reply's time is the turn's own, the same as its messages', so a reaction on them counts (ruling 13).
    expect(await chatState(on)).toMatchObject({
      followUpAt: tomorrow,
      followUpReason: "Ask which date suits them",
      followUpsSent: 0,
      lastReplyAt: liveNow,
    });
    expect((await outbound(on)).map((message) => message.occurredAt)).toEqual([liveNow]);

    // A time at night goes at 9 the next morning instead.
    const late = await liveAgency(test);
    done(
      await act(late, {
        messages: ["I'll check back later."],
        staged: stagedSet({ tool: "plan_follow_up", at: at("2026-11-20", "23:30"), about: "Check back" }),
      }),
    );
    expect((await chatState(late)).followUpAt).toEqual(at("2026-11-21", "09:00"));
  });

  it("keeps a quiet turn's planned follow-up, and a quiet turn without one leaves the earlier plan", async () => {
    const on = await liveAgency(test);
    done(
      await act(on, {
        messages: ["We go on 5, 12, 19 and 26 Dec."],
        staged: stagedSet({ tool: "plan_follow_up", at: at("2026-11-20", "19:00"), about: "Ask which date" }),
      }),
    );
    // "ok" at 16:10: the model stays quiet and plans tomorrow morning instead (spec case 12).
    const ok = await nextTurn(on, "ok", 40);
    const morning = at("2026-11-21", "10:00");
    const quiet = done(
      await act(on, {
        ...ok,
        staged: stagedSet(
          { tool: "stay_quiet", reason: "They said ok" },
          { tool: "plan_follow_up", at: morning, about: "Ask which date suits them" },
        ),
      }),
    );
    expect(quiet.sentIds).toEqual([]);
    const planned = { followUpAt: morning, followUpReason: "Ask which date suits them", followUpsSent: 0 };
    // Nothing went, so the last reply is still the dates'.
    expect(await chatState(on)).toMatchObject({ ...planned, lastReplyAt: liveNow });

    const thanks = await nextTurn(on, "Thanks!", 45);
    done(await act(on, { ...thanks, staged: stagedSet({ tool: "stay_quiet", reason: "They said thanks" }) }));
    expect(await chatState(on)).toMatchObject(planned);
  });

  it("leaves the earlier plan standing when a quiet turn plans a follow-up with no usable time", async () => {
    const on = await liveAgency(test);
    done(
      await act(on, {
        messages: ["We go on 5, 12, 19 and 26 Dec."],
        staged: stagedSet({ tool: "plan_follow_up", at: at("2026-11-20", "19:00"), about: "Ask which date" }),
      }),
    );
    const planned = { followUpAt: at("2026-11-20", "19:00"), followUpReason: "Ask which date" };
    const ok = await nextTurn(on, "ok", 40);
    done(
      await act(on, {
        ...ok,
        staged: stagedSet(
          { tool: "stay_quiet", reason: "They said ok" },
          { tool: "plan_follow_up", at: null, about: "Check back" },
        ),
      }),
    );
    expect(await chatState(on)).toMatchObject(planned);
  });

  it("counts a follow-up it sends, and a reaction on our message stops the next", async () => {
    const on = await liveAgency(test);
    const fourHours = at("2026-11-20", "19:30");
    done(
      await act(on, {
        messages: ["Which date suits you?"],
        staged: stagedSet({ tool: "plan_follow_up", at: fourHours, about: "Ask about the date" }),
      }),
    );
    const nudge = { kind: "nudge" as const, token: `nudge:${on.chat.id}:1`, now: fourHours };
    done(await act(on, { ...nudge, messages: ["Hi Rahul, did a date work out?"] }));
    const counted = await chatState(on);
    expect(counted).toMatchObject({ followUpsSent: 1, lastNudgeAt: fourHours, lastReplyAt: fourHours });
    // The second follow-up, about 20 hours after the customer's line, in waking hours.
    expect(counted.followUpAt).toEqual(new Date(FIRST_AT.getTime() + 20 * 3_600_000));

    await on.inOrg((tx) =>
      tx.whatsappMessage.updateMany({
        where: { conversationId: on.chat.id, clientToken: `ai:${nudge.token}` },
        data: { reaction: "👍" },
      }),
    );
    const second = { kind: "nudge" as const, token: `nudge:${on.chat.id}:2`, now: counted.followUpAt ?? liveNow };
    expect(await act(on, { ...second, messages: ["Just checking in!"] })).toEqual({ stopped: "answered" });
  });

  it("sends nothing and keeps nothing when a person replied while the model worked", async () => {
    const on = await liveAgency(test);
    const figures = await on.quote(threeOn19Dec(on));
    const turn = {
      messages: ["Done: 3 seats held."],
      staged: stagedSet(
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
          occurredAt: new Date(FIRST_AT.getTime() + 20_000),
        },
      }),
    );
    expect(await act(on, turn)).toEqual({ stopped: "answered" });
    expect(await kept(on)).toEqual(nothingKept);

    // A person takes the chat over while the act works (the booking asks whom to tell partway through). The chat's AI
    // row is there already, as the customer's line left it queued for this turn.
    const taken = await liveAgency(test);
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
      { ...turn, staged: stagedSet(bookOf(takenFigures)), quoted: [takenFigures] },
      deps({ recipients: takeOver }),
    ).catch(failure);
    expect(refused).toBe("AGENT_STOPPED");
    expect(await kept(taken)).toEqual(nothingKept);
  });

  it("rolls everything back and answers refused when the seats went", async () => {
    const on = await liveAgency(test);
    const figures = await on.quote(threeOn19Dec(on));
    await holdSeats(on, figures.departureId, 18);
    const result = await act(on, {
      messages: ["Done: 3 seats held."],
      staged: stagedSet(bookOf(figures), { tool: "add_note", text: "Booked 19 Dec" }),
      quoted: [figures],
    });
    expect(result).toEqual({ refused: "NOT_ENOUGH_SEATS", message: expect.any(String) as unknown });
    expect(await kept(on)).toEqual(nothingKept);
    // The name they booked under is undone with the booking.
    const person = await on.inOrg((tx) => tx.person.findUniqueOrThrow({ where: { id: on.chat.personId ?? "" } }));
    expect(person.name).toBe("Rahul");

    // A lapsed hold whose seats went meanwhile: the old booking is cancelled only with the new one, so it stays.
    const lapsed = await liveAgency(test);
    const terms = threeOn19Dec(lapsed);
    const told = await lapsed.quote(terms);
    done(await act(lapsed, { messages: ["Held."], staged: stagedSet(bookOf(told)), quoted: [told] }));
    await lapsed.inOrg((tx) =>
      tx.departureHold.updateMany({ where: { leadId: lapsed.leadId }, data: { expiresAt: FIRST_AT } }),
    );
    await holdSeats(lapsed, told.departureId, 18);
    const next = await nextTurn(lapsed, "Please send the QR again", 5);
    const facts = { ...freshFacts(), told: [{ ...terms, totalPaise: told.totalPaise, at: liveNow.toISOString() }] };
    const again = await act(lapsed, {
      ...next,
      messages: ["Here it is again."],
      staged: stagedSet({ tool: "resend_payment" }),
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

  it("takes a lapsed hold again at the total booked before the payment details go again", async () => {
    const on = await liveAgency(test);
    const figures = await on.quote(threeOn19Dec(on));
    // The offer's words state its date and advance, never its total (G2 asks no more), so no total counts as told.
    const offered = done(
      await act(on, {
        messages: ["3 seats on Sat 19 Dec: advance ₹9,000 to book. Shall I hold them?"],
        staged: stagedSet(offerOf(figures)),
        quoted: [figures],
      }),
    );
    expect(offered.facts.told).toEqual([]);
    // The yes, then the hold: the booking keeps its own terms and total for when its hold lapses.
    const yes = await nextTurn(on, "haan book karo, Rahul Verma", 5);
    const first = done(
      await act(on, {
        ...yes,
        messages: ["Done: 3 seats held."],
        staged: stagedSet(bookOf(figures)),
        quoted: [figures],
        facts: offered.facts,
      }),
    );
    expect(first.facts.offer).toBeNull();
    expect(first.facts.told).toEqual([
      expect.objectContaining({ startsOn: "2026-12-19", adults: 3, totalPaise: figures.totalPaise }),
    ]);
    await on.inOrg((tx) =>
      tx.departureHold.updateMany({ where: { leadId: on.leadId }, data: { expiresAt: FIRST_AT } }),
    );
    const next = await nextTurn(on, "Please send the QR again", 10);
    const resend = { messages: ["Here it is again."], staged: stagedSet({ tool: "resend_payment" }) };
    const again = done(await act(on, { ...next, ...resend, facts: first.facts }));
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
    expect(tokensOf(await outbound(on)).slice(4)).toEqual([
      `ai:${next.token}`,
      `ai:${next.token}:pay`,
      `ai:${next.token}:qr`,
    ]);
    expect(await kept(on)).toMatchObject({ holds: 1, bookings: 1 });
  });

  it("rolls everything back when the agent was paused during the act", async () => {
    const on = await liveAgency(test);
    const figures = await on.quote(threeOn19Dec(on));
    // The booking asks whom to tell partway through the act: the pause lands then, from another connection.
    const pausing = deps({ recipients: async () => (await pause(on), []) });
    const refused = await act(
      on,
      {
        messages: ["Done: 3 seats held."],
        staged: stagedSet(bookOf(figures), { tool: "add_note", text: "Booked 19 Dec" }),
        quoted: [figures],
      },
      pausing,
    ).catch(failure);
    expect(refused).toBe("AGENT_PAUSED");
    expect(await kept(on)).toEqual(nothingKept);
  });
});
