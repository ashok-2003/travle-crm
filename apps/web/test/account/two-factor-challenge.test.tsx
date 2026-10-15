// The code step: six digits from the app (or a backup code), sent with the trust-device choice; an expired first
// step sends the person back to sign in.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TwoFactorChallenge } from "@/account/two-factor-challenge";
import { messages } from "@/i18n/messages";
import { answers, ok, refused, renderScreen } from "./render";

const finishSignIn = vi.fn();
vi.mock("@/account/finish-sign-in", () => ({ useFinishSignIn: () => finishSignIn }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("next=/staff") }));

const { account, errors } = messages;

describe("TwoFactorChallenge", () => {
  it("sends the six digits, then opens the page the person came for", async () => {
    const verifyTwoFactorCode = answers(ok(null));
    renderScreen(<TwoFactorChallenge auth={{ verifyTwoFactorCode, verifyBackupCode: vi.fn() }} />);
    const submit = screen.getByRole("button", { name: account.twoFactor.submit });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText(account.fields.code), "123456");
    await userEvent.click(screen.getByLabelText(account.twoFactor.trustDevice));
    await userEvent.click(submit);
    expect(verifyTwoFactorCode).toHaveBeenCalledWith({ code: "123456", trustDevice: true });
    expect(finishSignIn).toHaveBeenCalledWith("/staff");
  });

  it("takes a backup code instead", async () => {
    const verifyBackupCode = answers(refused(401, "INVALID_BACKUP_CODE"));
    renderScreen(<TwoFactorChallenge auth={{ verifyTwoFactorCode: vi.fn(), verifyBackupCode }} />);
    await userEvent.click(screen.getByRole("button", { name: account.twoFactor.useBackupCode }));
    await userEvent.type(screen.getByLabelText(account.fields.backupCode), " abcde-12345 ");
    await userEvent.click(screen.getByRole("button", { name: account.twoFactor.submit }));
    expect(verifyBackupCode).toHaveBeenCalledWith({ code: "abcde-12345", trustDevice: false });
    expect(await screen.findByText(errors.auth.INVALID_BACKUP_CODE)).toBeVisible();
  });

  it("sends the person back to sign in when the first step has expired", async () => {
    const verifyTwoFactorCode = answers(refused(401, "INVALID_TWO_FACTOR_COOKIE"));
    renderScreen(<TwoFactorChallenge auth={{ verifyTwoFactorCode, verifyBackupCode: vi.fn() }} />);
    await userEvent.type(screen.getByLabelText(account.fields.code), "123456");
    await userEvent.click(screen.getByRole("button", { name: account.twoFactor.submit }));
    expect(await screen.findByRole("link", { name: account.twoFactor.startAgain })).toHaveAttribute(
      "href",
      "/sign-in?next=%2Fstaff",
    );
  });
});
