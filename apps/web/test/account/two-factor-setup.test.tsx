// Setting up two-factor: the password, then the code to scan with the key written out, then the 6 digits that turn
// it on, then the backup codes, shown once.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TwoFactorSetup } from "@/account/two-factor-setup";
import { messages } from "@/i18n/messages";
import { answers, ok, refused, renderScreen } from "./render";

const { account, errors } = messages;
const setup = {
  totpUri: "otpauth://totp/Test:asha%40example.in?secret=JBSWY3DPEHPK3PXPJBSW&issuer=Test",
  backupCodes: ["aaaaa-11111", "bbbbb-22222"],
};

describe("TwoFactorSetup", () => {
  it("walks from the password to the backup codes", async () => {
    const startTwoFactorSetup = answers(ok(setup));
    const confirmTwoFactor = vi
      .fn()
      .mockResolvedValueOnce(refused(401, "INVALID_CODE"))
      .mockResolvedValueOnce(ok(null));
    const onDone = vi.fn();
    renderScreen(<TwoFactorSetup pending onDone={onDone} auth={{ startTwoFactorSetup, confirmTwoFactor }} />);
    expect(screen.getByText(account.twoFactorSetup.pendingIntro)).toBeVisible();

    await userEvent.type(screen.getByLabelText(account.fields.password), "owner-password-1");
    await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.start }));
    expect(startTwoFactorSetup).toHaveBeenCalledWith({ password: "owner-password-1" });
    expect(screen.getByRole("img", { name: account.twoFactorSetup.qrLabel })).toBeVisible();
    expect(screen.getByText("JBSW Y3DP EHPK 3PXP JBSW")).toBeVisible();

    await userEvent.type(screen.getByLabelText(account.twoFactorSetup.confirmStep), "000000");
    await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.confirm }));
    expect(await screen.findByText(errors.auth.INVALID_CODE)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.confirm }));
    expect(confirmTwoFactor).toHaveBeenLastCalledWith({ code: "000000" });

    expect(await screen.findByText("aaaaa-11111")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.done }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("says when the password is wrong", async () => {
    const startTwoFactorSetup = answers(refused(400, "INVALID_PASSWORD"));
    renderScreen(
      <TwoFactorSetup pending={false} onDone={vi.fn()} auth={{ startTwoFactorSetup, confirmTwoFactor: vi.fn() }} />,
    );
    expect(screen.getByText(account.twoFactorSetup.intro)).toBeVisible();
    await userEvent.type(screen.getByLabelText(account.fields.password), "wrong");
    await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.start }));
    expect(await screen.findByText(errors.auth.INVALID_PASSWORD)).toBeVisible();
  });
});
