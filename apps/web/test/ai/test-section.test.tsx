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
});

const trace = {
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
    expect(api.last().input).toEqual({ messages: [{ from: "customer", text: "kedarnath?" }], state: null });
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
    expect(api.last().input).toEqual({ messages: [{ from: "customer", text: "hello again" }], state: null });
  });

  it("shows a hand-over as a line in the thread, under the words the customer would get", async () => {
    const reason = "Asked for a discount or a better price.";
    await chat(turn("Someone from our team will reply soon.", { handoff: true, reason }));
    expect(await screen.findByText("Someone from our team will reply soon.")).toBeVisible();
    expect(screen.getByText(words.handoff.replace("{reason}", reason))).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says why nothing would be sent, and sends no agent line for that turn next time", async () => {
    const api = fakeApi();
    renderWithApi(<TestSection />, client());
    await send("price?");
    const stopped = turn("", { dryRun: { actions: [], blocked: "amount" } });
    api.last().answer(stopped);
    const line = words.blocked.replace("{reason}", words.blockedReasons.amount);
    expect(await screen.findByText(line)).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
    await send("hello?");
    expect(api.last().input).toEqual({
      messages: [
        { from: "customer", text: "price?" },
        { from: "customer", text: "hello?" },
      ],
      state: stopped.state,
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
