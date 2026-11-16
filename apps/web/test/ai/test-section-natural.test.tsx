// Try it on the new agent: the Agent choice sends turns to ai.testNatural with the state the last one handed back, the
// chat's lines (the customer's and each answer's history) and the test chat's id; changing the agent empties the chat.
// A turn shows its messages, the payment lines code would send after them, a status line, and a "Why" with each call's
// tools, the guards' verdicts and what it would do, in the screen's own forms.
import { money } from "@travel-crm/domain/kernel";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { TestSection } from "@/ai/test-section";
import { messages } from "@/i18n/messages";
import { formatCalendarDay, formatDayTime, formatRupees } from "@/lib/format";
import { fakeApi, newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";

const words = messages.ai.test;
const { choices, natural } = words;
const client = () => newQueryClient({ ...paidSubscription, modules: ["crm", "inbox", "ai"] as never });
beforeEach(() => {
  screenIs("wide");
  // Radix's Select reaches for pointer capture and scrolling, which jsdom lacks.
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

/** The state a natural turn hands back: the chat's facts and the dry lead, told apart by when the turn ran. */
const stateAt = (minute: number) => ({
  facts: {
    agent: "natural",
    leadId: null,
    sentTripIds: [],
    sentFileIds: [],
    offer: null,
    told: [],
    bookingId: null,
    lastTurnAt: `2026-11-16T10:${String(minute).padStart(2, "0")}:00.000Z`,
  },
  lead: {
    packageId: null,
    day: null,
    month: null,
    adults: null,
    childrenAges: [],
    pickupCity: null,
    room: null,
    name: null,
    stage: "new",
    notes: [],
    tasks: [],
    booking: null,
  },
});

const reply = "Sat 12 Dec works: ₹22,600 for both of you.";
const trace = {
  agent: "natural",
  promptVersion: "built-in-1",
  outcome: "replied",
  fallback: null,
  restarted: null,
  durationMs: 4200,
  calls: [
    {
      model: "google/gemini-3.5-flash-lite",
      ms: 1800,
      inputTokens: 6400,
      cachedTokens: 6000,
      outputTokens: 120,
      reasoningTokens: 300,
      finishReason: "tool_calls",
      words: null,
      tools: [
        {
          name: "quote",
          arguments: '{"trip_id":"T1","date":"2026-12-11","adults":2}',
          result: "refused: no departure on Fri 11 Dec; the open dates are Sat 12 Dec and Sat 19 Dec",
          refused: true,
        },
        {
          name: "quote",
          arguments: '{"trip_id":"T1","date":"2026-12-12","adults":2}',
          result: "Kedarkantha, Sat 12 Dec 2026, 2 adults: total ₹22,600, advance ₹6,000",
          refused: false,
        },
      ],
    },
    {
      model: "google/gemini-3.5-flash-lite",
      ms: 2100,
      inputTokens: 6900,
      cachedTokens: 6300,
      outputTokens: 80,
      reasoningTokens: 0,
      finishReason: "stop",
      words: "It is ₹21,000 for both.",
      tools: [],
    },
  ],
  guards: [
    { guard: "G1", passed: false, detail: "₹21,000 isn't in the agency's data" },
    { guard: "G1", passed: true, detail: null },
  ],
  staged: [],
  flags: ["seats_differ:T1"],
};

/** One natural turn's answer: its messages as the chat's lines, no payment, nothing staged, and a state of its own. */
const naturalTurn = (sent: string[], more: object = {}) => ({
  messages: sent,
  payment: null,
  actions: [],
  outcome: "replied",
  state: stateAt(1),
  history: sent.map((text) => ({ from: "agent", text })),
  trace,
  ...more,
});

async function send(text: string) {
  await userEvent.type(screen.getByLabelText(words.message), text);
  await userEvent.click(screen.getByRole("button", { name: words.send }));
}

async function choose(label: string, option: string) {
  await userEvent.click(screen.getByRole("combobox", { name: label }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

/** Sends one line to the new agent with the api answering `answer`. */
async function chat(answer: object) {
  stubApi({ "ai.testNatural": { data: answer } });
  renderWithApi(<TestSection />, client());
  await choose(choices.agent, choices.agents.natural);
  await send("Kedarkantha on 12 Dec for 2?");
}

const live = { model: "live", temperature: "default" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("Try it on the new agent", () => {
  it("sends the new agent's turns to ai.testNatural with the state it handed back", async () => {
    const api = fakeApi();
    renderWithApi(<TestSection />, client());
    await choose(choices.agent, choices.agents.natural);
    await send("Kedarkantha in Dec?");
    expect(api.last().path).toBe("ai.testNatural");
    expect(api.last().input).toEqual({
      messages: [{ from: "customer", text: "Kedarkantha in Dec?" }],
      state: null,
      ...live,
      chatId: expect.stringMatching(uuid) as unknown,
    });
    const { chatId } = api.last().input as { chatId: string };
    const first = naturalTurn(["Yes! It departs every Saturday in December."], { state: stateAt(1) });
    api.last().answer(first);
    expect(await screen.findByText("Yes! It departs every Saturday in December.")).toBeVisible();
    await send("12 Dec for 2");
    expect(api.last().path).toBe("ai.testNatural");
    // The same test chat, so the same id: its turns are one session of traces.
    expect(api.last().input).toMatchObject({ state: first.state, ...live, chatId });
  });

  it("starts a new test chat, with a new id, on Start again", async () => {
    const api = fakeApi();
    renderWithApi(<TestSection />, client());
    await choose(choices.agent, choices.agents.natural);
    await send("Kedarkantha in Dec?");
    const { chatId } = api.last().input as { chatId: string };
    api.last().answer(naturalTurn(["Yes! It departs every Saturday in December."]));
    await screen.findByText("Yes! It departs every Saturday in December.");
    await userEvent.click(screen.getByRole("button", { name: words.reset }));
    await send("Brahmatal?");
    expect(api.last().input).toMatchObject({ state: null, chatId: expect.stringMatching(uuid) as unknown });
    expect((api.last().input as { chatId: string }).chatId).not.toBe(chatId);
  });

  it("empties the chat when the agent changes, keeping the model and temperature", async () => {
    const api = fakeApi();
    renderWithApi(<TestSection />, client());
    await choose(choices.model, choices.models.flash);
    await choose(choices.temperature, choices.temperatures.point4);
    await send("hi");
    expect(api.last().path).toBe("ai.test");
    api.last().answer({
      answer: "Hello! Where would you like to go?",
      handoff: false,
      reason: "",
      dryRun: { actions: [], blocked: null },
      state: { facts: { agent: "lite", packageId: null }, summary: "Said hello." },
      trace: {
        models: { understand: null, write: null },
        intents: [],
        move: null,
        stage: null,
        why: null,
        lookups: [],
        checks: [],
        writes: [],
        handOver: null,
      },
    });
    await screen.findByText("Hello! Where would you like to go?");
    await choose(choices.agent, choices.agents.natural);
    expect(screen.queryByText("Hello! Where would you like to go?")).toBeNull();
    expect(screen.queryByText("hi")).toBeNull();
    await send("hello again");
    expect(api.last().path).toBe("ai.testNatural");
    expect(api.last().input).toEqual({
      messages: [{ from: "customer", text: "hello again" }],
      state: null,
      model: "flash",
      temperature: "0.4",
      chatId: expect.stringMatching(uuid) as unknown,
    });
    api.last().answer(naturalTurn(["Hello! Which trip are you looking at?"]));
    await screen.findByText("Hello! Which trip are you looking at?");
    await choose(choices.agent, choices.agents.current);
    expect(screen.queryByText("Hello! Which trip are you looking at?")).toBeNull();
    await send("back");
    expect(api.last().path).toBe("ai.test");
    expect(api.last().input).toEqual({
      messages: [{ from: "customer", text: "back" }],
      state: null,
      model: "flash",
      temperature: "0.4",
    });
  });

  it("shows two messages and the payment lines code would send after them", async () => {
    const sent = ["Done! I've held 2 seats on Sat 12 Dec.", "Pay the ₹6,000 advance to confirm them."];
    const payment = ["UPI: trails@okbank", "Kerala Trails, account 000012345678, IFSC BANK0000001"];
    await chat(naturalTurn(sent, { payment }));
    const second = await screen.findByText(sent[1] ?? "");
    expect(screen.getByText(sent[0] ?? "")).toBeVisible();
    const caption = screen.getByText(natural.payment);
    expect(second.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const line of payment) expect(screen.getByText(line)).toBeVisible();
    expect(
      caption.compareDocumentPosition(screen.getByText(payment[0] ?? "")) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("says it would hand the chat over, with the reason in words", async () => {
    const handOver = { tool: "hand_over", reason: "discount", summary: "Wants 10% off for 6 people." };
    await chat(naturalTurn(["Let me check that with the team."], { outcome: "handed_off", actions: [handOver] }));
    expect(await screen.findByText("Let me check that with the team.")).toBeVisible();
    expect(screen.getByText(words.handoff.replace("{reason}", natural.handOverReasons.discount))).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says when it would stay quiet, and why", async () => {
    const quiet = { tool: "stay_quiet", reason: "They only said ok." };
    await chat(naturalTurn([], { outcome: "quiet", actions: [quiet] }));
    expect(await screen.findByText(natural.quiet.replace("{reason}", "They only said ok."))).toBeVisible();
  });

  it("says it would send the fallback line and add a task", async () => {
    const task = { tool: "create_task", kind: "question", text: "The AI didn't answer (timeout)." };
    await chat(naturalTurn(["Let me check and get back to you."], { outcome: "fallback", actions: [task] }));
    expect(await screen.findByText(natural.fallback)).toBeVisible();
    expect(screen.queryByText(/^It would hand the chat to your team/)).toBeNull();
  });

  it("says under the fallback line that a person would take the chat, when the fallback hands it over", async () => {
    const actions = [
      { tool: "hand_over", reason: "discount", summary: "Asked for 10% off twice; the agency's answers give none." },
      { tool: "create_task", kind: "question", text: "The reply named a discount the agency hasn't given." },
    ];
    await chat(naturalTurn(["Let me check and get back to you."], { outcome: "fallback", actions }));
    const fallback = await screen.findByText(natural.fallback);
    const handOver = screen.getByText(words.handoff.replace("{reason}", natural.handOverReasons.discount));
    expect(handOver).toBeVisible();
    expect(fallback.compareDocumentPosition(handOver) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens Why on each call's tools, arguments, results and the guards' verdicts", async () => {
    await chat(naturalTurn([reply]));
    await screen.findByText(reply);
    expect(screen.queryByText("built-in-1")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: words.why.open }));
    expect(screen.getByText('quote({"trip_id":"T1","date":"2026-12-12","adults":2})')).toBeVisible();
    expect(screen.getByText(/refused: no departure on Fri 11 Dec/)).toBeVisible();
    expect(screen.getByText("built-in-1")).toBeVisible();
    expect(screen.getByText(natural.outcomes.replied)).toBeVisible();
    expect(screen.getByText(natural.why.seconds.replace("{seconds}", "4.2"))).toBeVisible();
    expect(screen.getByText("13,300 in, 12,300 cached, 200 out, 300 reasoning")).toBeVisible();
    expect(screen.getAllByText("google/gemini-3.5-flash-lite")).toHaveLength(2);
    expect(screen.getByText(natural.why.wrote.replace("{words}", "It is ₹21,000 for both."))).toBeVisible();
    expect(screen.getByText(natural.why.guardRefused.replace("{guard}", "G1"))).toBeVisible();
    expect(screen.getByText("₹21,000 isn't in the agency's data")).toBeVisible();
    expect(screen.getByText(natural.why.guardPassed.replace("{guard}", "G1"))).toBeVisible();
    expect(screen.getByText("seats_differ:T1")).toBeVisible();
    expect(screen.getByText(words.why.nothingMore)).toBeVisible();
  });

  it("says in Why what it would do: the trip's name, the day, the money and the time in the agency's zone", async () => {
    const at = "2026-11-17T12:30:00.000Z";
    const actions = [
      { tool: "send_brochure", trip: "Kedarkantha", files: 2 },
      { tool: "book", trip: "Kedarkantha", date: "2026-12-12", seats: 2, advancePaise: 600_000 },
      { tool: "plan_follow_up", at, about: "Ask if the advance is paid." },
      { tool: "update_lead", fields: ["dates", "adults"] },
    ];
    await chat(naturalTurn([reply], { actions }));
    await userEvent.click(await screen.findByRole("button", { name: words.why.open }));
    expect(screen.getByText("It would send the Kedarkantha brochure (2 files).")).toBeVisible();
    const day = formatCalendarDay("2026-12-12");
    const advance = formatRupees(money(600_000));
    expect(
      screen.getByText(
        `It would hold 2 seats of Kedarkantha on ${day} and send the payment details and QR for the ${advance} advance.`,
      ),
    ).toBeVisible();
    const time = formatDayTime(new Date(at), { timeZone: "Asia/Kolkata" });
    expect(screen.getByText(`It would follow up on ${time}: Ask if the advance is paid.`)).toBeVisible();
    expect(screen.getByText("It would save the lead's dates, adults.")).toBeVisible();
    expect(screen.queryByText(/2026-11-17T12:30/)).toBeNull();
  });

  it("posts each answer's history lines as the agent's lines in the next turn", async () => {
    const api = fakeApi();
    renderWithApi(<TestSection />, client());
    await choose(choices.agent, choices.agents.natural);
    await send("Kedarkantha details?");
    const history = [
      { from: "agent", text: "Here is the Kedarkantha brochure." },
      { from: "agent", text: "[sent: Kedarkantha brochure]" },
    ];
    api.last().answer(naturalTurn(["Here is the Kedarkantha brochure."], { history }));
    await screen.findByText("Here is the Kedarkantha brochure.");
    await send("price for 2?");
    expect(api.last().input).toEqual({
      messages: [
        { from: "customer", text: "Kedarkantha details?" },
        ...history,
        { from: "customer", text: "price for 2?" },
      ],
      state: stateAt(1),
      ...live,
      chatId: expect.stringMatching(uuid) as unknown,
    });
  });
});
