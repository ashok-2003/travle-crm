// The message library on /settings/whatsapp (release 5, scope 3.5): the blanks cheat sheet lists every blank the library
// knows; a message is previewed live with a made-up customer; a blank the library doesn't know is refused with its
// own sentence before anything is sent.
import { blankNames } from "@travel-crm/contracts/inbox";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { QuickRepliesSection } from "@/inbox/quick-replies-section";
import { stubApi } from "../support/api-stub";
import { renderScreen, inputsTo } from "../leads/screen";

const words = messages.inbox.quickReplies;

afterEach(() => {
  vi.unstubAllGlobals();
});

function render() {
  stubApi({ "inbox.quickReplies": { data: [] }, "inbox.createQuickReply": { data: {} } });
  renderScreen(<QuickRepliesSection />);
}

describe("the message library", () => {
  it("explains every blank it knows", async () => {
    render();
    const sheet = await screen.findByRole("region", { name: words.blanks.heading });
    for (const name of blankNames) {
      expect(within(sheet).getByText(`{${name}}`)).toBeVisible();
      expect(within(sheet).getByText(words.blanks[name])).toBeVisible();
    }
  });

  it("previews a message with a made-up customer as it is typed", async () => {
    render();
    await userEvent.click(await screen.findByRole("button", { name: words.add }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(words.form.body), "Hi {{name}, {{destination} in {{month}");
    expect(within(dialog).getByText("Hi Asha, Spiti in May")).toBeVisible();
  });

  it("refuses a blank it does not know, with its own sentence, and sends nothing", async () => {
    render();
    await userEvent.click(await screen.findByRole("button", { name: words.add }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(words.form.shortcut), "hello");
    await userEvent.type(within(dialog).getByLabelText(words.form.title), "Hello");
    await userEvent.type(within(dialog).getByLabelText(words.form.body), "Hi {{nmae}");
    await userEvent.click(within(dialog).getByRole("button", { name: words.save }));
    expect(await within(dialog).findByText(/isn't one we know/)).toBeVisible();
    await waitFor(() => {
      expect(inputsTo("inbox.createQuickReply")).toEqual([]);
    });
  });
});
