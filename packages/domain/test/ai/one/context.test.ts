// The one agent's context: the cached system string, the whole chat as turns, and the turn block last.
import { naturalFacts, type AgencyAnswers } from "@travel-crm/contracts/ai";
import { describe, expect, it } from "vitest";
import { renderNaturalPrompt } from "../../../src/ai/natural/prompt.js";
import type { NaturalChatLine, NaturalLeadView, TripSheet } from "../../../src/ai/natural/types.js";
import { buildOneContext, type OneContextInput } from "../../../src/ai/one/context.js";
import { fenced } from "../../../src/ai/fenced.js";
import { tripInFull } from "../../../src/ai/natural/trips/trip-text.js";
import { EARLIER_HEADING, ONE_LINE_CUT } from "../../../src/ai/one/history.js";
import { BUILT_IN_ONE_PROMPT } from "../../../src/ai/one/prompt.js";
import { parseCalendarDate } from "../../../src/kernel/index.js";

const today = parseCalendarDate("2026-11-14");
const now = new Date("2026-11-14T18:13:00Z");
const DAY = 86_400_000;
const answers: AgencyAnswers = { cancellation: "50% back up to 15 days before the trek." };
const lead: NaturalLeadView = {
  name: "Riya Sharma",
  cameFrom: "WhatsApp profile name",
  packageId: null,
  day: null,
  month: "2026-12",
  adults: 2,
  childrenAges: [],
  pickupCity: null,
  room: null,
  stage: "contacted",
  summary: null,
  teamNotes: [],
  openTasks: [],
};
/** A customer with nothing saved: no notes open the chat. */
const bare: NaturalLeadView = { ...lead, month: null, adults: null };
const FILE = "0192f1a0-0000-7000-8000-000000000001";
const sheet: TripSheet = {
  label: "T1",
  packageId: "package-1",
  title: "Kedarkantha Trek",
  place: "Sankri",
  destinationId: null,
  nights: 5,
  startCity: "Dehradun",
  summary: "A winter trek.",
  highlights: [],
  days: [],
  pickups: [],
  inclusions: "Tents",
  exclusions: "Gear",
  notes: "",
  cancellation: "50% back",
  rooms: ["triple"],
  seasons: [],
  pricesIncludeGst: true,
  taxRateBasisPoints: 500,
  fromPaise: 949_900,
  advancePerPersonPaise: 300_000,
  departures: [],
  fileIds: [],
  brochures: [],
  photoIds: [],
};

let ids = 0;
function line(from: NaturalChatLine["from"], daysAgo: number, text: string, more: Partial<NaturalChatLine> = {}) {
  ids += 1;
  const at = new Date(now.getTime() - daysAgo * DAY - (1000 - ids) * 1000);
  return { id: `line-${String(ids)}`, from, at, kind: "text", text, ...more } satisfies NaturalChatLine;
}

function input(overrides: Partial<OneContextInput> = {}): OneContextInput {
  return {
    prompt: BUILT_IN_ONE_PROMPT,
    voice: { agentName: "Riya", agencyName: "Sharma Holidays", tone: "friendly" },
    timeZone: "Asia/Kolkata",
    today,
    now,
    answers,
    contact: { office: "", instagramUrl: "", about: "" },
    sheets: [sheet],
    lead,
    facts: naturalFacts.parse({ agent: "natural" }),
    lines: [line("customer", 0, "Hey")],
    cameFrom: null,
    notice: null,
    tools: "all",
    summary: null,
    ...overrides,
  };
}

const chat = (context: ReturnType<typeof buildOneContext>) => context.messages.slice(1, -1);
const chatText = (context: ReturnType<typeof buildOneContext>) =>
  chat(context)
    .map((m) => m.content)
    .join("\n");

describe("the one agent's context", () => {
  it("shows every line read, none dropped by age or budget", () => {
    const lines = Array.from({ length: 60 }, (_, index) =>
      line(index % 2 === 0 ? "customer" : "you", 30 - index / 2, `message number ${String(index)} ${"x".repeat(900)}`),
    );
    const context = buildOneContext(input({ lines: [...lines, line("customer", 0, "latest")] }));
    for (let index = 0; index < 60; index += 1) expect(chatText(context)).toContain(`message number ${String(index)} `);
  });

  it("writes the earlier system's lines whole, figures and dates kept, under the heading", () => {
    const lines = [
      line("earlier", 20, "The trek is ₹21,000 a head, leaving 12 Dec."),
      line("earlier", 20, "Seats are free."),
      line("customer", 0, "ok"),
    ];
    const context = buildOneContext(input({ lines, lead: bare }));
    const earlier = chat(context)[0];
    expect(earlier?.role).toBe("assistant");
    expect(earlier?.content).toBe(`${EARLIER_HEADING}\nThe trek is ₹21,000 a head, leaving 12 Dec.\nSeats are free.`);
  });

  it("names each voice note and photo m1 on, with what was heard or seen", () => {
    const lines = [
      line("customer", 3, "", { kind: "audio", aiText: { kind: "transcript", text: "do log hain" } }),
      line("you", 2, "ok"),
      line("customer", 1, "", { kind: "image" }),
      line("customer", 1, "", { kind: "sticker" }),
      line("customer", 0, "see", { kind: "audio" }),
    ];
    const context = buildOneContext(input({ lines }));
    const text = `${chatText(context)}\n${context.messages.at(-1)?.content ?? ""}`;
    expect(text).toContain('[voice note m1] (heard: "do log hain")');
    expect(text).toContain("[photo m2]");
    expect(text).toContain("[voice note m3] see");
    expect(text).not.toContain("m4");
    expect(context.media.get("m2")).toEqual({ messageId: lines[2]?.id, kind: "image" });
    expect([...context.media.keys()]).toEqual(["m1", "m2", "m3"]);
    expect(context.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["transcribe_voice_note", "look_at_image"]),
    );
    expect(buildOneContext(input()).tools.map((tool) => tool.name)).not.toContain("look_at_image");
  });

  it("keeps the earlier system's heading and the summary off our own lines", () => {
    const lines = [
      line("you", 3, "ours before"),
      line("earlier", 2, "old line"),
      line("you", 1, "ours after"),
      line("customer", 0, "ok"),
    ];
    const assistant = chat(buildOneContext(input({ lines, lead: bare }))).map((message) => message.content);
    expect(assistant).toEqual(["ours before", `${EARLIER_HEADING}\nold line`, "ours after"]);
    const summed = buildOneContext(
      input({ lines: [line("you", 1, "hello"), line("customer", 0, "ok")], summary: "S" }),
    );
    expect(chat(summed).map((message) => message.content)).toEqual([
      "<customer>\nDetails: December, no day yet · 2 adults\n</customer>\n<chat_summary>\nS\n</chat_summary>",
      "hello",
    ]);
  });

  it("names the team member, and marks an automatic line", () => {
    const lines = [
      line("customer", 3, "hi"),
      line("team", 2, "Call me", { teamName: "Amit" }),
      line("automatic", 1, "Reminder"),
      line("customer", 0, "ok"),
    ];
    const text = chatText(buildOneContext(input({ lines })));
    expect(text).toContain("(Team, Amit) Call me");
    expect(text).toContain("[automatic] Reminder");
  });

  it("cuts only a message past 4,000 characters", () => {
    const lines = [
      line("customer", 2, "a".repeat(3_900)),
      line("you", 1, "b".repeat(5_000)),
      line("customer", 0, "ok"),
    ];
    const text = chatText(buildOneContext(input({ lines })));
    expect(text).toContain("a".repeat(3_900));
    expect(text).not.toContain("b".repeat(ONE_LINE_CUT + 1));
    expect(text).toContain("b".repeat(1_000));
  });

  it("opens the chat with the customer's details and the summary, each tagged, and with neither when there is nothing", () => {
    const lines = [line("customer", 1, "hi"), line("you", 1, "hello"), line("customer", 0, "ok")];
    const withSummary = buildOneContext(input({ lines, summary: "Wants Kedarkantha in December." }));
    expect(chat(withSummary)[0]).toEqual({
      role: "assistant",
      content:
        "<customer>\nDetails: December, no day yet · 2 adults\n</customer>\n" +
        "<chat_summary>\nWants Kedarkantha in December.\n</chat_summary>",
    });
    const nothing = buildOneContext(input({ lines, lead: bare }));
    expect(chatText(nothing)).not.toContain("<customer>");
    expect(chatText(nothing)).not.toContain("<chat_summary>");
  });

  it("lists in the customer's block only what is there, never their name, stage or the follow-up hours", () => {
    const context = buildOneContext(
      input({
        lead: {
          ...lead,
          teamNotes: [{ at: now, by: "Amit", text: "Offered ₹500 off" }],
          openTasks: ["Confirm the pickup point"],
        },
        cameFrom: { source: "Instagram ad", packageId: "package-1" },
      }),
    );
    const opening = chat(context)[0]?.content ?? "";
    expect(opening).toBe(
      [
        "<customer>",
        "Details: December, no day yet · 2 adults",
        "Came from: Instagram ad for T1 Kedarkantha Trek.",
        'Team notes, newest first: Sat 14 Nov, Amit: "Offered ₹500 off"',
        "Open tasks: Confirm the pickup point.",
        "</customer>",
      ].join("\n"),
    );
    const everything = context.messages.map((message) => message.content).join("\n");
    for (const gone of ["Riya Sharma", "stage", "Follow-ups", "<now>", "<lead>", "Live offer", "Sent: none"])
      expect(everything).not.toContain(gone);
  });

  it("puts the customer's trip in full in their block, else the ad's, and no trip their words name", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      ...sheet,
      label: `T${String(index + 1)}`,
      packageId: `package-${String(index + 1)}`,
      title: `Trek ${String(index + 1)}`,
      summary: "A long day plan. ".repeat(60),
    }));
    const at = (number: number) => many[number - 1] ?? expect.unreachable();
    const said = [line("customer", 0, "Trek 3 ka rate?")];
    const theirs = buildOneContext(input({ sheets: many, lines: said, lead: { ...lead, packageId: "package-8" } }));
    const all = (context: ReturnType<typeof buildOneContext>) =>
      context.messages
        .slice(1)
        .map((message) => message.content)
        .join("\n");
    expect(chat(theirs)[0]?.content).toContain(`Their trip:\n${fenced(tripInFull(at(8), today))}`);
    expect(all(theirs)).not.toContain(tripInFull(at(3), today));
    const fromAd = buildOneContext(
      input({ sheets: many, lines: said, cameFrom: { source: "Instagram ad", packageId: "package-9" } }),
    );
    expect(chat(fromAd)[0]?.content).toContain(`Their trip:\n${fenced(tripInFull(at(9), today))}`);
  });

  it("ends with the notice and the new messages, stamped with the year, and nothing about the customer", () => {
    const context = buildOneContext(
      input({ notice: "The app sent the brochure.", lines: [line("customer", 0, "Price?")] }),
    );
    const last = context.messages.at(-1);
    expect(last?.role).toBe("user");
    expect(last?.content).toMatch(
      /^The app sent the brochure\.\nNew messages:\n\[Sat 14 Nov 2026, \d{1,2}:\d{2} [ap]m\] Price\?$/u,
    );
    expect(context.newLines).toHaveLength(1);
  });

  it("tells the agency's office, Instagram and about after its name, each only when given", () => {
    const contact = {
      office: "12 MG Road, Pune",
      instagramUrl: "https://instagram.com/sharma",
      about: "Treks\nsince 2015.",
    };
    const system = buildOneContext(input({ contact })).messages[0]?.content ?? "";
    expect(system).toContain(
      "Agency: Sharma Holidays. Agent: Riya. Time zone: Asia/Kolkata.\n" +
        "Office: 12 MG Road, Pune\nInstagram: https://instagram.com/sharma\nAbout the agency: Treks since 2015.\n",
    );
    expect(buildOneContext(input()).messages[0]?.content).not.toMatch(/Office:|Instagram:|About the agency:/u);
  });

  it("says the time when no new message came, as on a follow-up", () => {
    const context = buildOneContext(input({ lines: [line("customer", 1, "hi"), line("you", 0, "hello")] }));
    expect(context.messages.at(-1)?.content).toBe("Now: Sat 14 Nov 2026, 11:43 pm.");
  });

  it("lists the brochures in the system message and the ones sent in the customer's block", () => {
    const withBrochure = {
      ...sheet,
      fileIds: [FILE],
      brochures: [{ attachmentId: FILE, name: "Winter plan", description: "Dates and costs" }],
    };
    const context = buildOneContext(
      input({
        sheets: [withBrochure],
        notice: "The app sent a QR.",
        facts: naturalFacts.parse({ agent: "natural", sentFileIds: [FILE] }),
      }),
    );
    expect(context.messages[0]?.content).toContain(
      "\nBrochure ID: B1\nTrip: T1 Kedarkantha Trek\nName: Winter plan\nAbout: Dates and costs",
    );
    expect(chat(context)[0]?.content).toContain("Brochures sent in this chat: B1 Winter plan.");
    const turn = context.messages.at(-1)?.content ?? "";
    expect(turn).not.toContain("Brochures sent");
    expect(turn).toContain("The app sent a QR.");
    expect(context.tools.map((tool) => tool.name)).toContain("send_brochure");
    expect(buildOneContext(input()).tools.map((tool) => tool.name)).not.toContain("send_brochure");
  });

  it("offers all tools, none, or stay_quiet alone, and no trip tools without trips", () => {
    const names = (tools: OneContextInput["tools"], sheets = [sheet]) =>
      buildOneContext(input({ tools, sheets })).tools.map((tool) => tool.name);
    expect(names("all")).toEqual(expect.arrayContaining(["find_trips", "book", "stay_quiet"]));
    expect(names("none")).toEqual([]);
    expect(names("stay_quiet")).toEqual(["stay_quiet"]);
    expect(names("all", [])).not.toContain("find_trips");
  });

  it("keeps the system message the same while the data is", () => {
    const first = buildOneContext(input());
    const second = buildOneContext(input({ lines: [line("customer", 0, "something else")], notice: "x" }));
    expect(first.messages[0]).toEqual(second.messages[0]);
    const prompt = renderNaturalPrompt(BUILT_IN_ONE_PROMPT, input().voice).trimEnd();
    expect(first.messages[0]?.content.startsWith(`${prompt}\n\n# The agency's data`)).toBe(true);
  });
});
