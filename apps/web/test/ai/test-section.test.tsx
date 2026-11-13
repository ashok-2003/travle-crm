// "Try it" for an agency answering from its packages: the filled reply, then what code would do with it, or why nothing
// would be sent, in the owner's words.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { TestSection } from "@/ai/test-section";
import { messages } from "@/i18n/messages";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";

const words = messages.ai.test;
const client = () => newQueryClient({ ...paidSubscription, modules: ["crm", "inbox", "ai"] as never });
beforeEach(() => {
  screenIs("wide");
});

async function ask(answer: object) {
  stubApi({ "ai.test": { data: answer } });
  renderWithApi(<TestSection />, client());
  await userEvent.type(screen.getByLabelText(words.question), "Spiti on 14 Nov for 2, book it");
  await userEvent.click(screen.getByRole("button", { name: words.ask }));
}

describe("Try it, for an agency answering from its packages", () => {
  it("shows the filled reply and what code would do with it", async () => {
    await ask({
      answer: "Holding 2 seats on Sat 14 Nov.",
      handoff: false,
      reason: "",
      grounded: { actions: ["book", "note"], blocked: null },
    });
    expect(await screen.findByText("Holding 2 seats on Sat 14 Nov.")).toBeVisible();
    expect(screen.getByText(words.actions.book)).toBeVisible();
    expect(screen.getByText(words.actions.note)).toBeVisible();
    expect(screen.queryByText(words.actions.files)).toBeNull();
  });

  it("says why nothing would be sent", async () => {
    await ask({ answer: "", handoff: false, reason: "", grounded: { actions: [], blocked: "amount" } });
    const reason = words.blockedReasons.amount;
    expect(await screen.findByText(words.blocked.replace("{reason}", reason))).toBeVisible();
  });

  it.each(["PAYMENT_DETAILS_MISSING", "PACKAGE_NOT_SELLABLE", "AI_ACTION_REFUSED"] as const)(
    "names a booking the live turn would refuse: %s",
    async (code) => {
      await ask({ answer: "", handoff: false, reason: "", grounded: { actions: [], blocked: code } });
      expect(await screen.findByText(words.blocked.replace("{reason}", words.blockedReasons[code]))).toBeVisible();
    },
  );

  it("reads a block reason the screen doesn't know as a plain safety check", async () => {
    await ask({ answer: "", handoff: false, reason: "", grounded: { actions: [], blocked: "something_new" } });
    expect(await screen.findByText(words.blocked.replace("{reason}", words.blockedReasons.other))).toBeVisible();
  });
});
