// The one agent's context: the cached system string, the whole chat as turns, and the turn block last.
import { naturalFacts, type AgencyAnswers } from "@travel-crm/contracts/ai";
import { describe, expect, it } from "vitest";
import { renderNaturalPrompt } from "../../../src/ai/natural/prompt.js";
import type { NaturalChatLine, NaturalLeadView, TripSheet } from "../../../src/ai/natural/types.js";
import { buildOneContext, type OneContextInput } from "../../../src/ai/one/context.js";
import { EARLIER_HEADING, ONE_LINE_CUT, SUMMARY_MARK } from "../../../src/ai/one/history.js";
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
    const context = buildOneContext(input({ lines }));
    const earlier = chat(context)[0];
    expect(earlier?.role).toBe("assistant");
    expect(earlier?.content).toBe(`${EARLIER_HEADING}\nThe trek is ₹21,000 a head, leaving 12 Dec.\nSeats are free.`);
  });

  it("keeps the earlier system's heading and the summary off our own lines", () => {
    const lines = [
      line("you", 3, "ours before"),
      line("earlier", 2, "old line"),
      line("you", 1, "ours after"),
      line("customer", 0, "ok"),
    ];
    const assistant = chat(buildOneContext(input({ lines }))).map((message) => message.content);
    expect(assistant).toEqual(["ours before", `${EARLIER_HEADING}\nold line`, "ours after"]);
    const summed = buildOneContext(
      input({ lines: [line("you", 1, "hello"), line("customer", 0, "ok")], summary: "S" }),
    );
    expect(chat(summed).map((message) => message.content)).toEqual([`${SUMMARY_MARK}\nS`, "hello"]);
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

  it("puts a summary first, marked as the app's, and none when there is none", () => {
    const lines = [line("customer", 1, "hi"), line("you", 1, "hello"), line("customer", 0, "ok")];
    const withSummary = buildOneContext(input({ lines, summary: "Wants Kedarkantha in December." }));
    expect(chat(withSummary)[0]).toEqual({
      role: "assistant",
      content: `${SUMMARY_MARK}\nWants Kedarkantha in December.`,
    });
    expect(chatText(buildOneContext(input({ lines })))).not.toContain(SUMMARY_MARK);
  });

  it("ends with the turn block: the lead, the notice, then the new messages", () => {
    const context = buildOneContext(
      input({ notice: "The app sent the brochure.", lines: [line("customer", 0, "Price?")] }),
    );
    const last = context.messages.at(-1);
    expect(last?.role).toBe("user");
    const turn = last?.content ?? "";
    expect(turn.indexOf("<lead>")).toBeLessThan(turn.indexOf("The app sent the brochure."));
    expect(turn.indexOf("The app sent the brochure.")).toBeLessThan(turn.indexOf("New messages:"));
    expect(turn.indexOf("New messages:")).toBeLessThan(turn.indexOf("Price?"));
    expect(context.newLines).toHaveLength(1);
  });

  it("lists the brochures in the system message and the ones sent in the turn block", () => {
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
      "## Brochures\nB1 · T1 Kedarkantha Trek · Winter plan: Dates and costs",
    );
    const turn = context.messages.at(-1)?.content ?? "";
    expect(turn.indexOf("Brochures sent in this chat: B1 Winter plan.")).toBeGreaterThan(-1);
    expect(turn.indexOf("Brochures sent in this chat")).toBeLessThan(turn.indexOf("The app sent a QR."));
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
