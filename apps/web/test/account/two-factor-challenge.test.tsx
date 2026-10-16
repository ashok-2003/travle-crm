// The code step: six digits from the app (or a backup code), sent with the trust-device choice, which says it is for
// a device nobody else uses and is never offered on the way to the platform console; an expired first step sends the
// person back to sign in.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { TwoFactorChallenge } from "@/account/two-factor-challenge";
import { messages } from "@/i18n/messages";
import { answers, ok, refused, renderScreen } from "./render";

const finishSignIn = vi.fn();
vi.mock("@/account/finish-sign-in", () => ({ useFinishSignIn: () => finishSignIn }));
const search = vi.hoisted(() => ({ query: "next=/staff" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search.query) }));

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

  it("says trusting the device is only for one nobody else uses", () => {
    renderScreen(<TwoFactorChallenge auth={{ verifyTwoFactorCode: vi.fn(), verifyBackupCode: vi.fn() }} />);
    expect(screen.getByLabelText(account.twoFactor.trustDevice)).toHaveAccessibleDescription(
      account.twoFactor.trustDeviceHint,
    );
  });

  it("never offers platform staff on their way to the console to trust the device", async () => {
    search.query = "next=/console/plans";
    onTestFinished(() => {
      search.query = "next=/staff";
    });
    const verifyTwoFactorCode = answers(ok(null));
    renderScreen(<TwoFactorChallenge auth={{ verifyTwoFactorCode, verifyBackupCode: vi.fn() }} />);
    expect(screen.queryByLabelText(account.twoFactor.trustDevice)).toBeNull();
    await userEvent.type(screen.getByLabelText(account.fields.code), "123456");
    await userEvent.click(screen.getByRole("button", { name: account.twoFactor.submit }));
    expect(verifyTwoFactorCode).toHaveBeenCalledWith({ code: "123456", trustDevice: false });
    expect(finishSignIn).toHaveBeenCalledWith("/console/plans");
  });

  it("takes a backup code instead, with the focus on its field", async () => {
    const verifyBackupCode = answers(refused(401, "INVALID_BACKUP_CODE"));
    renderScreen(<TwoFactorChallenge auth={{ verifyTwoFactorCode: vi.fn(), verifyBackupCode }} />);
    await userEvent.click(screen.getByRole("button", { name: account.twoFactor.useBackupCode }));
    expect(screen.getByLabelText(account.fields.backupCode)).toHaveFocus();
    await userEvent.type(screen.getByLabelText(account.fields.backupCode), " abcde-12345 ");
    await userEvent.click(screen.getByRole("button", { name: account.twoFactor.submit }));
    expect(verifyBackupCode).toHaveBeenCalledWith({ code: "abcde-12345", trustDevice: false });
    expect(await screen.findByText(errors.auth.INVALID_BACKUP_CODE)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: account.twoFactor.useAuthenticator }));
    expect(screen.getByLabelText(account.fields.code)).toHaveFocus();
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
