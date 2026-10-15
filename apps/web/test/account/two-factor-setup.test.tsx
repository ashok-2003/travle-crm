// Setting up two-factor: the password, then the code to scan with the key written out, then the 6 digits that turn
// it on, then the backup codes, shown once. Focus moves to each step as it opens, and nothing that fails is silent.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TwoFactorSetup } from "@/account/two-factor-setup";
import { messages } from "@/i18n/messages";
import { unanswered } from "../support/api-errors";
import { answers, ok, refused, renderScreen } from "./render";

const { account, errors } = messages;
const setup = {
  totpUri: "otpauth://totp/Test:asha%40example.in?secret=JBSWY3DPEHPK3PXPJBSW&issuer=Test",
  backupCodes: ["aaaaa-11111", "bbbbb-22222"],
};

/** Sets the clipboard up as a browser would, or as one that refuses (no permission, or not a secure page). */
function clipboardThat(answer: () => Promise<void>) {
  const writeText = vi.fn(answer);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
}

/** Renders the setup and walks it to the code to scan. */
async function reachScanStep(onDone: () => Promise<void> | void = vi.fn()) {
  renderScreen(
    <TwoFactorSetup
      pending
      onDone={onDone}
      auth={{ startTwoFactorSetup: answers(ok(setup)), confirmTwoFactor: answers(ok(null)) }}
    />,
  );
  await userEvent.type(screen.getByLabelText(account.fields.password), "owner-password-1");
  await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.start }));
}

/** Renders the setup and walks it to the backup codes. */
async function reachBackupCodes(onDone: () => Promise<void> | void = vi.fn()) {
  await reachScanStep(onDone);
  await userEvent.type(screen.getByLabelText(account.twoFactorSetup.confirmStep), "000000");
  await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.confirm }));
  expect(await screen.findByText("aaaaa-11111")).toBeVisible();
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

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
    expect(document.activeElement).toHaveTextContent(account.twoFactorSetup.scan);

    await userEvent.type(screen.getByLabelText(account.twoFactorSetup.confirmStep), "000000");
    await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.confirm }));
    expect(await screen.findByText(errors.auth.INVALID_CODE)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.confirm }));
    expect(confirmTwoFactor).toHaveBeenLastCalledWith({ code: "000000" });

    expect(await screen.findByText("aaaaa-11111")).toBeVisible();
    expect(screen.getByRole("heading", { name: account.twoFactorSetup.backupTitle })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.done }));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("shows the key to type on browsers without URL.parse (Safari before 18)", async () => {
    // jsdom's URL may inherit parse rather than own it; put back whichever it was.
    const ownParse = Object.getOwnPropertyDescriptor(URL, "parse");
    Object.defineProperty(URL, "parse", { value: undefined, configurable: true });
    try {
      await reachScanStep();
      expect(screen.getByText("JBSW Y3DP EHPK 3PXP JBSW")).toBeVisible();
    } finally {
      if (ownParse) Object.defineProperty(URL, "parse", ownParse);
      else Reflect.deleteProperty(URL, "parse");
    }
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

  it("copies the backup codes, or says to write them down when the browser won't", async () => {
    const writeText = clipboardThat(() => Promise.resolve());
    await reachBackupCodes();
    await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.copyCodes }));
    expect(writeText).toHaveBeenCalledWith("aaaaa-11111\nbbbbb-22222");
    expect(await screen.findByRole("button", { name: account.twoFactorSetup.copied })).toBeVisible();

    clipboardThat(() => Promise.reject(new DOMException("Not allowed", "NotAllowedError")));
    await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.copied }));
    expect(await screen.findByText(account.twoFactorSetup.copyFailed)).toBeVisible();
  });

  it("says why it can't go on after the codes are saved, and tries again", async () => {
    const onDone = vi.fn().mockRejectedValueOnce(unanswered()).mockResolvedValueOnce(undefined);
    await reachBackupCodes(onDone);
    await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.done }));
    expect(await screen.findByText(errors.network)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: account.twoFactorSetup.done }));
    expect(onDone).toHaveBeenCalledTimes(2);
  });
});
