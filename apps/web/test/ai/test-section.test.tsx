// "Try it" as a chat: the owner writes as the customer, the agent's answer shows on the other side, the next turn carries
// the chat and the state the last one handed back, "Why" opens what the turn read and decided, and Start again empties
// it. A hand-over or a check's refusal is a line of its own in the thread, in the owner's words.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { TestSection } from "@/ai/test-section";
import { messages } from "@/i18n/messages";
import { fakeApi, newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";

const words = messages.ai.test;
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

const trace = {
  models: { understand: "google/gemini-3.5-flash-lite", write: "google/gemini-3.5-flash" },
  intents: ["price_question"],
  move: "give_price",
  stage: "package_picked",
  why: "intent:price_question",
  lookups: [{ request: { tool: "price", package: "Kedarnath Yatra 4N" }, result: { tool: "price", total: 599900 } }],
  checks: [],
  writes: [
    { answer: '{"text":"It is 5999 only."}', refused: "amount" },
    { answer: '{"text":"Which city will you join from?"}', refused: null },
  ],
  handOver: null,
};

/** One turn's answer: the reply, nothing blocked, and a state of its own to be sent back. */
const turn = (answer: string, more: object = {}) => ({
  answer,
  handoff: false,
  reason: "",
  dryRun: { actions: [], blocked: null },
  state: { facts: { agent: "lite", packageId: null }, summary: `After: ${answer}` },
  trace,
  ...more,
});

/** What every turn sends until the owner chooses otherwise: the live model at its own temperature. */
const live = { model: "live", temperature: "default" };

async function send(text: string) {
  await userEvent.type(screen.getByLabelText(words.message), text);
  await userEvent.click(screen.getByRole("button", { name: words.send }));
}

/** Sends one line with the api answering `answer`. */
async function chat(answer: object) {
  stubApi({ "ai.test": { data: answer } });
  renderWithApi(<TestSection />, client());
  await send("Spiti on 14 Nov for 2, book it");
}

describe("Try it", () => {
  it("goes on turn after turn, sending the chat and the state the last turn handed back", async () => {
    const api = fakeApi();
    renderWithApi(<TestSection />, client());
    await send("kedarnath?");
    expect(api.last().input).toEqual({ messages: [{ from: "customer", text: "kedarnath?" }], state: null, ...live });
    // While the turn runs: Send is off and the agent is shown answering.
    expect(screen.getByRole("button", { name: words.send })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(words.thinking);
    const first = turn("It is a group yatra.");
    api.last().answer(first);
    expect(await screen.findByText("It is a group yatra.")).toBeVisible();
    expect(screen.getByText("kedarnath?")).toBeVisible();

    await send("how much?");
    expect(api.last().input).toEqual({
      messages: [
        { from: "customer", text: "kedarnath?" },
        { from: "agent", text: "It is a group yatra." },
        { from: "customer", text: "how much?" },
      ],
      state: first.state,
      ...live,
    });
    api.last().answer(turn("From ₹5,999 a person."));
    expect(await screen.findByText("From ₹5,999 a person.")).toBeVisible();
  });

  it("opens Why under an answer: what it understood, chose and looked up, each Write try, what it would do", async () => {
    await chat(turn("Which city will you join from?", { dryRun: { actions: ["note"], blocked: null } }));
    await screen.findByText("Which city will you join from?");
    const why = screen.getByRole("button", { name: words.why.open });
    expect(why).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("give_price")).toBeNull();
    await userEvent.click(why);
    expect(why).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("price_question")).toBeVisible();
    expect(screen.getByText("give_price")).toBeVisible();
    expect(screen.getByText("intent:price_question")).toBeVisible();
    expect(screen.getByText(words.why.readBy)).toBeVisible();
    expect(screen.getByText("google/gemini-3.5-flash-lite")).toBeVisible();
    expect(screen.getByText(words.why.writtenBy)).toBeVisible();
    expect(screen.getByText("google/gemini-3.5-flash")).toBeVisible();
    expect(screen.getByText("price")).toBeVisible();
    expect(screen.getByText(words.why.tryRefused.replace("{number}", "1").replace("{code}", "amount"))).toBeVisible();
    expect(screen.getByText(words.why.tryPassed.replace("{number}", "2"))).toBeVisible();
    expect(screen.getByText(words.actions.note)).toBeVisible();
    expect(screen.queryByText(words.actions.files)).toBeNull();
  });

  it("starts again with an empty chat and no state", async () => {
    const api = fakeApi();
    renderWithApi(<TestSection />, client());
    await send("hi");
    api.last().answer(turn("Hello! Where would you like to go?"));
    await screen.findByText("Hello! Where would you like to go?");
    await userEvent.click(screen.getByRole("button", { name: words.reset }));
    expect(screen.queryByText("Hello! Where would you like to go?")).toBeNull();
    expect(screen.queryByText("hi")).toBeNull();
    await send("hello again");
    expect(api.last().input).toEqual({ messages: [{ from: "customer", text: "hello again" }], state: null, ...live });
  });

  it("takes 0.4 only with Gemini Flash, sends both choices, and keeps them when the chat starts again", async () => {
    const choices = words.choices;
    const api = fakeApi();
    renderWithApi(<TestSection />, client());
    expect(screen.getByText(choices.onlyFlash)).toBeVisible();
    await userEvent.click(screen.getByRole("combobox", { name: choices.temperature }));
    expect(await screen.findByRole("option", { name: choices.temperatures.point4 })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("combobox", { name: choices.model }));
    await userEvent.click(await screen.findByRole("option", { name: choices.models.flash }));
    expect(screen.queryByText(choices.onlyFlash)).toBeNull();
    await userEvent.click(screen.getByRole("combobox", { name: choices.temperature }));
    await userEvent.click(await screen.findByRole("option", { name: choices.temperatures.point4 }));
    await send("hi");
    const flash = { model: "flash", temperature: "0.4" };
    expect(api.last().input).toEqual({ messages: [{ from: "customer", text: "hi" }], state: null, ...flash });
    api.last().answer(turn("Hello!"));
    await screen.findByText("Hello!");
    await userEvent.click(screen.getByRole("button", { name: words.reset }));
    await send("again");
    expect(api.last().input).toEqual({ messages: [{ from: "customer", text: "again" }], state: null, ...flash });
    api.last().answer(turn("Hello again!"));
    await screen.findByText("Hello again!");
    // Back to the live model, the temperature goes back to its own.
    await userEvent.click(screen.getByRole("combobox", { name: choices.model }));
    await userEvent.click(await screen.findByRole("option", { name: choices.models.live }));
    expect(screen.getByRole("combobox", { name: choices.temperature })).toHaveTextContent(choices.temperatures.default);
  });

  it("shows a hand-over as a line in the thread, under the words the customer would get", async () => {
    const reason = "Asked for a discount or a better price.";
    await chat(turn("Someone from our team will reply soon.", { handoff: true, reason }));
    expect(await screen.findByText("Someone from our team will reply soon.")).toBeVisible();
    expect(screen.getByText(words.handoff.replace("{reason}", reason))).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lists under Details left out only what Understand's check dropped, never a Write refusal", async () => {
    const checks = [
      { name: "proof", passed: false, detail: "adults:proof_missing" },
      { name: "write", passed: false, detail: "amount" },
      { name: "write", passed: true, detail: null },
    ];
    await chat(turn("Which city will you join from?", { trace: { ...trace, checks } }));
    await userEvent.click(await screen.findByRole("button", { name: words.why.open }));
    expect(screen.getByText(words.why.dropped)).toBeVisible();
    expect(screen.getByText("adults:proof_missing")).toBeVisible();
    // The Write refusal shows once, as its try.
    expect(screen.queryByText("adults:proof_missing, amount")).toBeNull();
    expect(screen.queryByText("amount")).toBeNull();
  });

  it("leaves Details left out off when Understand's check dropped nothing", async () => {
    const checks = [{ name: "write", passed: false, detail: "amount" }];
    await chat(turn("Which city will you join from?", { trace: { ...trace, checks } }));
    await userEvent.click(await screen.findByRole("button", { name: words.why.open }));
    expect(screen.queryByText(words.why.dropped)).toBeNull();
  });

  it("shows a refused Write as the hand-over the customer would get, with each refused try under Why", async () => {
    const reason = "The AI couldn't write a safe reply.";
    const refused = {
      ...trace,
      move: "hand_over",
      why: "write:amount",
      handOver: "check_failed",
      writes: [
        { answer: '{"text":"It is 5999 only."}', refused: "amount" },
        { answer: '{"text":"Just 5999!"}', refused: "amount" },
      ],
    };
    await chat(turn("Someone from our team will reply soon.", { handoff: true, reason, trace: refused }));
    expect(await screen.findByText(words.handoff.replace("{reason}", reason))).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: words.why.open }));
    expect(screen.getByText("check_failed")).toBeVisible();
    expect(screen.getByText(words.why.tryRefused.replace("{number}", "2").replace("{code}", "amount"))).toBeVisible();
    expect(screen.getByText('{"text":"Just 5999!"}')).toBeVisible();
  });

  it("says why nothing would be sent, and sends no agent line for that turn next time", async () => {
    const api = fakeApi();
    renderWithApi(<TestSection />, client());
    await send("price?");
    const stopped = turn("", { dryRun: { actions: [], blocked: "unfit" } });
    api.last().answer(stopped);
    const line = words.blocked.replace("{reason}", words.blockedReasons.unfit);
    expect(await screen.findByText(line)).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
    await send("hello?");
    expect(api.last().input).toEqual({
      messages: [
        { from: "customer", text: "price?" },
        { from: "customer", text: "hello?" },
      ],
      state: stopped.state,
      ...live,
    });
  });

  it("says when it would send nothing at all", async () => {
    await chat(turn(""));
    expect(await screen.findByText(words.noAnswer)).toBeVisible();
  });

  it.each(["PAYMENT_DETAILS_MISSING", "PACKAGE_NOT_SELLABLE", "AI_ACTION_REFUSED"] as const)(
    "names a booking the live turn would refuse: %s",
    async (code) => {
      await chat(turn("", { dryRun: { actions: [], blocked: code } }));
      expect(await screen.findByText(words.blocked.replace("{reason}", words.blockedReasons[code]))).toBeVisible();
    },
  );

  it("reads a block reason the screen doesn't know as a plain safety check", async () => {
    await chat(turn("", { dryRun: { actions: [], blocked: "something_new" } }));
    expect(await screen.findByText(words.blocked.replace("{reason}", words.blockedReasons.other))).toBeVisible();
  });
});
