// A tap on the offer card, against the real database, the memory model and the in-memory tool agent: Book on the live
// offer holds the seats and sends the fixed line, the payment message and the QR with no model call; a second tap, an
// old offer's, a refused one and Change run the agent with a notice; a tap with no id is words; the gates stop a tap.
import { randomUUID } from "node:crypto";
import { naturalFacts } from "@travel-crm/contracts/ai";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import type { AiRequest } from "@travel-crm/integrations/ai";
import { createMemoryToolAgent } from "@travel-crm/integrations/tool-agent";
import { createMemoryTracing, notedTurn } from "@travel-crm/integrations/tracing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { replyDayOf } from "../../../src/ai/may-write.js";
import { BOOK_TITLE, CHANGE_TITLE } from "../../../src/ai/one/card.js";
import { tapBookedLine } from "../../../src/ai/one/tap.js";
import { runOneTurn } from "../../../src/ai/one/turn.js";
import { aLead } from "../../crm/support/records.js";
import { createTestInbox, type TestInbox } from "../../inbox/support.js";
import { FIRST_AT, liveAgency, liveAt } from "../natural/support/live-agency.js";

const offerCall = (adults: number) => ({
  name: "offer_booking",
  arguments: { trip_id: "T1", date: "2026-12-19", adults, room: "triple" },
});
const offerWords = "Ye raha aapka offer, check kar lijiye.";
const answerWords = "Ji, bataiye kya badalna hai?";
/** The line the model reads last: the turn block, which holds the notice. */
const turnBlockOf = (request: AiRequest | undefined) => request?.messages.at(-1)?.content ?? "";

describe("a tap on the offer card", () => {
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

  async function world() {
    const on = await liveAgency(test);
    const tracing = createMemoryTracing();
    /** The turn for the line `token` at `at`, on the worker's dependencies with `changes`. */
    const turn = (token: string, at: Date, changes: Partial<ReturnType<typeof on.dependencies>> = {}) =>
      runOneTurn(
        { ...on.dependencies(), ...changes, tracing, toolAgent: createMemoryToolAgent() },
        on.turnInput(token),
        at,
      );
    const writes = (text: string, seconds: number) => on.write({ direction: "in", at: liveAt(seconds), body: text });
    const facts = async () =>
      naturalFacts.parse(
        (await on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }))).facts,
      );
    /** The customer asks in `words` at `seconds`, and the model offers 19 Dec for `adults` a minute later; its id. */
    const offered = async (words = "Kedarkantha 19 Dec, 2 log", seconds = -60, adults = 2) => {
      const asked = await writes(words, seconds);
      on.model.answer({ text: offerWords, toolCalls: [offerCall(adults)] }, "");
      expect(await turn(asked, liveAt(seconds + 60))).toBe("replied");
      return (await facts()).offer?.id ?? "";
    };
    /** The customer taps `title` at `seconds` with the button id `id`; null: the tap came as its words alone. */
    const taps = async (id: string | null, seconds: number, title = BOOK_TITLE) => {
      const line = await writes(title, seconds);
      if (id !== null) {
        await on.inOrg((tx) => tx.whatsappMessage.update({ where: { id: line }, data: { buttonReplyId: id } }));
      }
      return line;
    };
    const outbound = () =>
      on.inOrg((tx) =>
        tx.whatsappMessage.findMany({
          where: { conversationId: on.chat.id, direction: "out" },
          orderBy: { createdAt: "asc" },
          select: { clientToken: true, body: true },
        }),
      );
    const bookings = () => on.inOrg((tx) => tx.aiBooking.count({ where: { conversationId: on.chat.id } }));
    /** Seats on the 19 Dec batch held for another lead, as staff hold them. */
    const holdSeats = (seats: number) =>
      on.inOrg(async (tx) => {
        const departure = await tx.departure.findFirstOrThrow({
          where: { templateId: on.kedarkantha, startDate: new Date("2026-12-19T00:00:00Z") },
        });
        await tx.departureHold.create({
          data: { departureId: departure.id, leadId: (await aLead(tx)).id, seats, expiresAt: new Date("2027-01-01") },
        });
      });
    return { ...on, tracing, turn, writes, facts, offered, taps, outbound, bookings, holdSeats };
  }

  /** Pauses the agent for this agency, from the platform's own connection, as platform staff do. */
  async function pause(organizationId: string) {
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
        organizationId,
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

  it("spends no summary call on a Book tap, even in a long chat", async () => {
    const on = await world();
    const offerId = await on.offered();
    for (let n = 0; n < 31; n += 1) await on.writes(`older line ${String(n)}`, -3_000 + n);
    const calls = on.model.requests.length;
    const tap = await on.taps(`book:${offerId}`, 240);
    expect(await on.turn(tap, liveAt(300))).toBe("replied");
    expect(on.model.requests).toHaveLength(calls);
    const stored = await on.inOrg((tx) => tx.aiChat.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
    expect(stored.chatSummaryThroughId).toBeNull();
  });

  it("holds the seats on a Book tap and sends the line, the payment message and the QR, with no model call", async () => {
    const on = await world();
    const offerId = await on.offered();
    const calls = on.model.requests.length;
    const tap = await on.taps(`book:${offerId}`, 240);
    expect(await on.turn(tap, liveAt(300))).toBe("replied");
    expect(on.model.requests).toHaveLength(calls);
    const sent = (await on.outbound()).slice(2);
    expect(sent.map((message) => message.clientToken)).toEqual([`ai:${tap}`, `ai:${tap}:pay`, `ai:${tap}:qr`]);
    expect(sent[0]?.body).toBe("Your seats are held. The payment details are below.");
    const booking = await on.inOrg((tx) => tx.aiBooking.findFirstOrThrow({ where: { conversationId: on.chat.id } }));
    expect(booking).toMatchObject({ status: "awaiting_payment", leadId: on.leadId, expectedPaise: 600_000n });
    const traced = on.tracing.turns.at(-1);
    expect(traced === undefined ? null : notedTurn(traced)).toMatchObject({ metadata: { flags: ["tap:book"] } });

    // The job again: nothing books or goes twice.
    expect(await on.turn(tap, liveAt(310))).toBe("answered");
    expect(await on.bookings()).toBe(1);
    expect(await on.outbound()).toHaveLength(5);
  });

  it("writes the line in the language they wrote in", async () => {
    const hinglish = await world();
    const tap = await hinglish.taps(`book:${await hinglish.offered("Kedarkantha 19 Dec ka kitna hoga? 2 log")}`, 240);
    expect(await hinglish.turn(tap, liveAt(300))).toBe("replied");
    expect((await hinglish.outbound())[2]?.body).toBe(tapBookedLine("hinglish"));
    expect(tapBookedLine("hinglish")).toBe("Aapki seats hold ho gayi hain, payment ki details neeche hain.");

    const hindi = await world();
    const tapped = await hindi.taps(`book:${await hindi.offered("केदारकांठा 19 दिसंबर, 2 लोग")}`, 240);
    expect(await hindi.turn(tapped, liveAt(300))).toBe("replied");
    expect((await hindi.outbound())[2]?.body).toBe("आपकी सीटें होल्ड हो गई हैं, पेमेंट की डिटेल नीचे है।");

    // Their latest lines, as the prompt's rule reads them: Hinglish once, then English.
    const switched = await world();
    await switched.writes("Bhai Kedarkantha ka kitna hai?", -110);
    await switched.writes("Actually, we are two adults", -100);
    await switched.writes("December works for us", -90);
    const latest = await switched.taps(`book:${await switched.offered("Kedarkantha on 19 Dec please")}`, 240);
    expect(await switched.turn(latest, liveAt(300))).toBe("replied");
    expect((await switched.outbound())[2]?.body).toBe(tapBookedLine("english"));
  });

  it("books nothing on a second Book tap, and tells the agent what stands", async () => {
    const on = await world();
    const offerId = await on.offered();
    expect(await on.turn(await on.taps(`book:${offerId}`, 240), liveAt(300))).toBe("replied");
    const again = await on.taps(`book:${offerId}`, 360);
    on.model.answer({ text: "Aapki seats pehle se hold hain, bas payment baaki hai." });
    expect(await on.turn(again, liveAt(420))).toBe("replied");
    expect(await on.bookings()).toBe(1);
    const notice = turnBlockOf(on.model.requests.at(-1));
    expect(notice).toContain('They tapped "Book these seats" on an offer that is no longer live (Kedarkantha Trek;');
    expect(notice).toContain("Nothing was booked. There is no live offer now.");
    expect(notice).toContain(
      "Their booking is already held and waits for payment. Say so; resend_payment sends the payment details again " +
        "if they ask.",
    );
    expect(notice).not.toContain("offer again");
  });

  it("books nothing on an old offer's tap, and names the live one", async () => {
    // A newer offer replaced the one tapped.
    const replaced = await world();
    const old = await replaced.offered();
    await replaced.offered("3 log ho jayenge", 120, 3);
    replaced.model.answer({ text: "Woh offer purana hai; naya offer 3 logon ka hai." });
    expect(await replaced.turn(await replaced.taps(`book:${old}`, 240), liveAt(300))).toBe("replied");
    expect(await replaced.bookings()).toBe(0);
    const notice = turnBlockOf(replaced.model.requests.at(-1));
    expect(notice).toContain("on an offer that is no longer live (Kedarkantha Trek; Sat 19 Dec · 2 adults");
    expect(notice).toContain("The live offer is Kedarkantha Trek, ");
    expect(notice).toContain("3 adults, triple, total ₹28,497.");

    // The agency's automation wrote after the card: the offer is no longer the one they answer.
    const automatic = await world();
    const offerId = await automatic.offered();
    await automatic.write({ direction: "out", at: liveAt(100), body: "Our office is closed on Sunday." });
    automatic.model.answer({ text: offerWords });
    expect(await automatic.turn(await automatic.taps(`book:${offerId}`, 240), liveAt(300))).toBe("replied");
    expect(await automatic.bookings()).toBe(0);
    expect(turnBlockOf(automatic.model.requests.at(-1))).toContain("There is no live offer now.");

    // An offer this chat never made: named by nothing.
    const other = await world();
    await other.offered();
    other.model.answer({ text: offerWords });
    expect(await other.turn(await other.taps(`book:${randomUUID()}`, 240), liveAt(300))).toBe("replied");
    expect(await other.bookings()).toBe(0);
    expect(turnBlockOf(other.model.requests.at(-1))).toContain(
      'They tapped "Book these seats" on an offer that is no longer live. Nothing was booked. The live offer is Kedarkantha Trek, ',
    );
  });

  it("books nothing when the seats went, or the price or the advance changed, and gives the open dates once", async () => {
    const seats = await world();
    const offerId = await seats.offered();
    await seats.holdSeats(19);
    seats.model.answer({ text: "19 Dec ki seats chali gayi; 26 Dec chalega?" });
    expect(await seats.turn(await seats.taps(`book:${offerId}`, 240), liveAt(300))).toBe("replied");
    expect(await seats.bookings()).toBe(0);
    const notice = turnBlockOf(seats.model.requests.at(-1));
    expect(notice).toContain('They tapped "Book these seats" on the offer (Kedarkantha Trek, ');
    expect(notice).toContain(
      "The seats couldn't be held: 1 left on Sat 19 Dec and the party is 2; open with seats: Sat 5 Dec, Sat 12 Dec, " +
        "Sat 26 Dec. Nothing was sent; reply again.",
    );
    expect(notice).not.toContain("Open:");

    const price = await world();
    const offered = await price.offered();
    await price.inOrg((tx) =>
      tx.packageSeason.updateMany({ where: { templateId: price.kedarkantha }, data: { priceTriplePaise: 1_099_900 } }),
    );
    price.model.answer({ text: "Price badal gaya hai, naya offer bhejti hoon." });
    expect(await price.turn(await price.taps(`book:${offered}`, 240), liveAt(300))).toBe("replied");
    expect(await price.bookings()).toBe(0);
    expect(turnBlockOf(price.model.requests.at(-1))).toContain("the price changed since the offer");

    // The card said ₹6,000 advance now; the trip asks ₹3,500 a person since.
    const advance = await world();
    const shown = await advance.offered();
    await advance.inOrg((tx) =>
      tx.quoteTemplate.update({ where: { id: advance.kedarkantha }, data: { advancePerPersonPaise: 350_000n } }),
    );
    advance.model.answer({ text: "Advance badal gaya hai, naya offer bhejti hoon." });
    expect(await advance.turn(await advance.taps(`book:${shown}`, 240), liveAt(300))).toBe("replied");
    expect(await advance.bookings()).toBe(0);
    expect(turnBlockOf(advance.model.requests.at(-1))).toContain(
      "The seats couldn't be held: the advance changed since the offer: it is now ₹7,000; make the offer again",
    );
  });

  it("books nothing when the act finds the seats gone, and gives the open dates", async () => {
    const on = await world();
    const offerId = await on.offered();
    // The seats go after book's checks, as the act reads whom to tell of the booking.
    let held = false;
    const managers = async () => {
      if (!held) await on.holdSeats(19);
      held = true;
      return [on.owner.userId];
    };
    on.model.answer({ text: "19 Dec ki seats abhi chali gayi; 26 Dec chalega?" });
    const tap = await on.taps(`book:${offerId}`, 240);
    expect(await on.turn(tap, liveAt(300), { managers })).toBe("replied");
    expect(held).toBe(true);
    expect(await on.bookings()).toBe(0);
    const notice = turnBlockOf(on.model.requests.at(-1));
    expect(notice).toContain('They tapped "Book these seats" on the offer (Kedarkantha Trek, ');
    expect(notice).toContain("The seats couldn't be held: ");
    expect(notice).toContain("Open: Sat 5 Dec, Sat 12 Dec, Sat 26 Dec. Nothing was sent; reply again.");
    // Nothing went with the refused hold: the model's line goes under the tap's own token.
    expect((await on.outbound()).slice(2)).toEqual([
      { clientToken: `ai:${tap}`, body: "19 Dec ki seats abhi chali gayi; 26 Dec chalega?" },
    ]);
  });

  it("runs the agent with a notice on Change", async () => {
    const on = await world();
    const offerId = await on.offered();
    on.model.answer({ text: answerWords });
    expect(await on.turn(await on.taps(`change:${offerId}`, 240, CHANGE_TITLE), liveAt(300))).toBe("replied");
    expect(await on.bookings()).toBe(0);
    const notice = turnBlockOf(on.model.requests.at(-1));
    expect(notice).toContain('They tapped "Change something" on the offer (Kedarkantha Trek, ');
    expect(notice).toContain("2 adults, triple, total ₹18,998). Ask what they'd like to change.");
    expect((await on.outbound()).at(-1)?.body).toBe(answerWords);
  });

  it("leaves a tap's notice turn the model can't answer to the team: nothing sent, and a task", async () => {
    const on = await world();
    const offerId = await on.offered();
    const quiet = { name: "stay_quiet", arguments: { reason: "nothing to add" } };
    on.model.answer({ toolCalls: [quiet] }, "");
    const tap = await on.taps(`change:${offerId}`, 240, CHANGE_TITLE);
    expect(await on.turn(tap, liveAt(300))).toBe("fallback");
    expect((await on.outbound()).map((message) => message.clientToken)).not.toContain(`ai:${tap}`);
    expect(await on.inOrg((tx) => tx.task.count({ where: { byAi: true } }))).toBe(1);
    expect(await on.bookings()).toBe(0);
  });

  it("lets the agent answer what they wrote with the tap, and book if they still want it", async () => {
    const on = await world();
    const offerId = await on.offered();
    await on.writes("Pickup Delhi se ho sakta hai?", 230);
    const tap = await on.taps(`book:${offerId}`, 240);
    const calls = on.model.requests.length;
    const words = "Pickup Dehradun se hai. 2 seats hold kar di hain, payment ki details neeche hain.";
    on.model.answer(
      { toolCalls: [{ name: "book", arguments: { trip_id: "T1", date: "2026-12-19", adults: 2, room: "triple" } }] },
      { text: words },
    );
    expect(await on.turn(tap, liveAt(300))).toBe("replied");
    expect(on.model.requests.length).toBeGreaterThan(calls);
    expect(turnBlockOf(on.model.requests[calls])).toContain(
      'They tapped "Book these seats" on the live offer (Kedarkantha Trek, ',
    );
    expect(turnBlockOf(on.model.requests[calls])).toContain(
      "and wrote more. Nothing is booked yet: answer what they wrote, and book on these terms if they still want them.",
    );
    expect((await on.outbound()).slice(2).map((message) => message.clientToken)).toEqual([
      `ai:${tap}`,
      `ai:${tap}:pay`,
      `ai:${tap}:qr`,
    ]);
    expect((await on.outbound())[2]?.body).toBe(words);
    expect(await on.bookings()).toBe(1);
  });

  it("answers a tap with no id as words", async () => {
    const on = await world();
    await on.offered();
    const tap = await on.taps(null, 240);
    const calls = on.model.requests.length;
    on.model.answer(
      { toolCalls: [{ name: "book", arguments: { trip_id: "T1", date: "2026-12-19", adults: 2, room: "triple" } }] },
      { text: "Done! 2 seats hold kar di hain, payment ki details neeche hain." },
    );
    expect(await on.turn(tap, liveAt(300))).toBe("replied");
    expect(on.model.requests.length).toBeGreaterThan(calls);
    expect(turnBlockOf(on.model.requests.at(-1))).not.toContain("They tapped");
    expect(await on.bookings()).toBe(1);
  });

  it("never books a tap while the AI is paused, taken over or at its limit", async () => {
    const paused = await world();
    const tap = await paused.taps(`book:${await paused.offered()}`, 240);
    await pause(paused.organizationId);
    expect(await paused.turn(tap, liveAt(300))).toBe("paused");

    const takenOver = await world();
    const tapped = await takenOver.taps(`book:${await takenOver.offered()}`, 240);
    await takenOver.inOrg((tx) => tx.aiChat.updateMany({ data: { mode: "off" } }));
    expect(await takenOver.turn(tapped, liveAt(300))).toBe("off");

    const atCap = await world();
    const capped = await atCap.taps(`book:${await atCap.offered()}`, 240);
    await atCap.inOrg(async (tx) => {
      const { maxRepliesPerDay } = await tx.aiAutopilot.findFirstOrThrow();
      await tx.aiChat.updateMany({ data: { repliesOn: replyDayOf(liveAt(300)), repliesCount: maxRepliesPerDay } });
    });
    const calls = atCap.model.requests.length;
    expect(await atCap.turn(capped, liveAt(300))).toBe("handed_off");
    expect(atCap.model.requests).toHaveLength(calls);

    // A newer line from the customer: the newer turn answers both.
    const newer = await world();
    const early = await newer.taps(`book:${await newer.offered()}`, 240);
    await newer.writes("Ek sawaal hai", 250);
    expect(await newer.turn(early, liveAt(300))).toBe("superseded");

    // Nothing booked, and nothing went after the offer's words and card.
    for (const [one, sent] of [
      [paused, 2],
      [takenOver, 2],
      [atCap, 2],
      [newer, 2],
    ] as const) {
      expect(await one.bookings()).toBe(0);
      expect(await one.outbound()).toHaveLength(sent);
    }
  });
});
