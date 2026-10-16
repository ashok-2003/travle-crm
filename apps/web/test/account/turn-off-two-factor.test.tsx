// Turning two-factor off asks for the password, then stays open until Better Auth answers (the fix wave's rule 7):
// Cancel is disabled, the close button gone and Escape does nothing meanwhile, so the answer lands where the person
// sees it.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TurnOffTwoFactor } from "@/account/turn-off-two-factor";
import { messages } from "@/i18n/messages";
import { renderScreen } from "./render";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { account, common } = messages;

describe("TurnOffTwoFactor", () => {
  it("stays open with Cancel disabled while the call is out, then closes and says so", async () => {
    let answer: (result: { ok: true; data: null }) => void = () => undefined;
    const turnOffTwoFactor = vi.fn(() => new Promise<{ ok: true; data: null }>((resolve) => (answer = resolve)));
    const onTurnedOff = vi.fn();
    renderScreen(<TurnOffTwoFactor onTurnedOff={onTurnedOff} auth={{ turnOffTwoFactor }} />);
    await userEvent.click(screen.getByRole("button", { name: account.account.turnOff }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(account.fields.password), "owner-password-1");
    await userEvent.click(within(dialog).getByRole("button", { name: account.account.turnOff }));

    expect(turnOffTwoFactor).toHaveBeenCalledWith({ password: "owner-password-1" });
    expect(within(dialog).getByRole("button", { name: common.cancel })).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: common.close })).toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeVisible();

    answer({ ok: true, data: null });
    await waitFor(() => {
      expect(onTurnedOff).toHaveBeenCalledOnce();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
