// When the share links' dialogs may close (fix-wave rule 7): closing the dialog lets go of a new link's address, so
// opening it again never shows the token; while a link is being made, or one is being turned off, nothing closes
// the dialog, so the answer is always seen; the row's Turn off is an outline button, the dialog's the red one.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { screenIs } from "../organization/render";
import { heldAnswer } from "../support/api-stub";
import { created, document, forMeera, renderDialog, rowOf, SHARE_AGAIN, token } from "./share-links";

const words = messages.documents.share;
const title = words.title.replace("{number}", document.number);
const address = () => new URL(`/p/${token}`, window.location.origin).href;

beforeEach(() => {
  screenIs("wide");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("closing the share links' dialogs", () => {
  it("lets go of a new link's address when the dialog closes", async () => {
    const user = userEvent.setup();
    renderDialog({ "shareLinks.list": { data: [] } });
    await user.click(await screen.findByRole("button", { name: words.create }));
    expect(await screen.findByLabelText(words.linkLabel)).toHaveValue(address());

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    await user.click(screen.getByRole("button", { name: SHARE_AGAIN }));
    expect(await screen.findByRole("dialog", { name: title })).toBeVisible();
    expect(screen.getByRole("button", { name: words.create })).toBeVisible();
    expect(screen.queryByLabelText(words.linkLabel)).toBeNull();
    expect(screen.queryByDisplayValue(address())).toBeNull();
  });

  it("stays open while a link is being made, then shows its address", async () => {
    const user = userEvent.setup();
    const making = heldAnswer(created);
    renderDialog({ "shareLinks.list": { data: [] }, "shareLinks.create": making.answer });
    await user.click(await screen.findByRole("button", { name: words.create }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: title })).toBeVisible();
    making.release();
    expect(await screen.findByLabelText(words.linkLabel)).toHaveValue(address());
  });

  it("turns a link off through a dialog that waits for the api's answer", async () => {
    const user = userEvent.setup();
    const revoking = heldAnswer({ data: null });
    renderDialog({ "shareLinks.revoke": revoking.answer });
    const turnOff = await screen.findByRole("button", { name: words.revokeNamed.replace("{label}", "For Meera Iyer") });
    expect(turnOff).toHaveAttribute("data-variant", "outline");
    await user.click(turnOff);
    const confirm = screen.getByRole("alertdialog", { name: words.revokeTitle });
    const action = within(confirm).getByRole("button", { name: words.revokeConfirm });
    expect(action).toHaveAttribute("data-variant", "destructive");
    await user.click(action);
    expect(within(confirm).getByRole("button", { name: messages.common.cancel })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(confirm).toBeVisible();
    revoking.release();
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    // The share dialog under it is still open.
    expect(within(rowOf(forMeera.label)).getByText(words.status.active)).toBeVisible();
  });
});
