// One failed email's page (the failed-emails spec): who it was for and from, what happened (with what that means), the
// email as sent in a frame sandboxed with no permissions, its plain text and its resends; Send again, asked once more,
// whose outcome shows on the page while the email loads again. An email no longer kept is said so, with the way back,
// and support is told the page is a super admin's.
import type { StoredEmail } from "@travel-crm/contracts/platform";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailScreen } from "@/console/emails/email-screen";
import { messages } from "@/i18n/messages";
import { stubApi, type Answer } from "../../support/api-stub";
import { screenIs } from "../../organization/render";
import { platformStaff } from "../../support/platform-staff";
import { inputsTo, renderConsole } from "../../support/render-console";

const { emails: words } = messages.consolePlatform;
const id = "0199a000-0000-7000-8000-0000000000e1";

function stored(overrides: Partial<StoredEmail> = {}): StoredEmail {
  return {
    id,
    purpose: "password-reset",
    toAddress: "asha@sharma.example",
    toName: "Asha Owner",
    fromName: "Test Sender",
    replyTo: null,
    subject: "Reset your password",
    textBody: "Choose a new password: https://app.example/reset-password?token=abc",
    htmlBody: '<p>Choose a new password: <a href="https://app.example/reset-password?token=abc">Choose</a></p>',
    status: "failed",
    failureSource: "smtp",
    failureCode: "EAUTH (SMTP 535)",
    failureReason: null,
    createdAt: "2026-11-02T04:00:00.000Z",
    sentAt: null,
    failedAt: "2026-11-02T04:00:01.000Z",
    resends: [],
    ...overrides,
  };
}

function open(email: Answer, staff = platformStaff("super-admin")) {
  screenIs("wide");
  const api = stubApi({ "platform.emails.get": email });
  renderConsole(<EmailScreen emailId={id} />, staff);
  return api;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EmailScreen", () => {
  it("shows who it was for, what happened and the email as sent, in a frame where nothing runs", async () => {
    open({ data: stored() });
    expect(await screen.findByRole("heading", { level: 1, name: "Reset your password" })).toBeVisible();
    const details = within(screen.getByRole("region", { name: words.email.details }));
    expect(details.getByText("Asha Owner <asha@sharma.example>")).toBeVisible();
    expect(details.getByText("Test Sender")).toBeVisible();
    expect(details.getByText(words.email.noReplyTo)).toBeVisible();
    expect(details.getByText(words.purposes["password-reset"])).toBeVisible();
    expect(details.getByText(words.sources.smtp)).toBeVisible();
    expect(details.getByRole("button", { name: `What does ${words.email.failure} mean?` })).toBeVisible();
    expect(details.getByText("EAUTH (SMTP 535)")).toBeVisible();
    expect(details.queryByText(words.email.sentAt)).toBeNull();

    const frame = screen.getByTitle(words.email.frameTitle.replace("{subject}", "Reset your password"));
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame).toHaveAttribute("srcdoc", stored().htmlBody);
    expect(screen.getByText(stored().textBody)).toBeVisible();
    expect(screen.getByText(words.email.noResends)).toBeVisible();
    expect(screen.getByRole("link", { name: words.email.back })).toHaveAttribute("href", "/console/emails");
  });

  it("sends it again once asked, shows the outcome and loads the email again with its resend", async () => {
    const api = open({ data: stored() });
    await userEvent.click(await screen.findByRole("button", { name: words.resend.button }));
    const dialog = await screen.findByRole("alertdialog", { name: words.resend.title });
    expect(within(dialog).getByText("asha@sharma.example", { exact: false })).toBeVisible();
    api.answer("platform.emails.resend", { data: { id: "0199a000-0000-7000-8000-0000000000e9", status: "sent" } });
    api.answer("platform.emails.get", {
      data: stored({
        resends: [
          {
            id: "0199a000-0000-7000-8000-0000000000e9",
            status: "sent",
            createdAt: "2026-11-02T06:00:00.000Z",
            sentAt: "2026-11-02T06:00:01.000Z",
            failedAt: null,
            failureCode: null,
          },
        ],
      }),
    });
    await userEvent.click(within(dialog).getByRole("button", { name: words.resend.confirm }));
    expect(await screen.findByText(words.resend.sent)).toBeVisible();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(inputsTo("emails.resend")).toEqual([{ id }]);
    expect(await screen.findByText(words.email.resendSent)).toBeVisible();
    expect(screen.getByRole("button", { name: words.resend.button })).toHaveFocus();
  });

  it("says when the resend failed too", async () => {
    const api = open({ data: stored() });
    await userEvent.click(await screen.findByRole("button", { name: words.resend.button }));
    api.answer("platform.emails.resend", { data: { id: "0199a000-0000-7000-8000-0000000000e9", status: "failed" } });
    await userEvent.click(await screen.findByRole("button", { name: words.resend.confirm }));
    expect(await screen.findByText(words.resend.failed)).toBeVisible();
  });

  it("offers no resend for an email that didn't fail", async () => {
    open({
      data: stored({
        status: "sent",
        failureSource: null,
        failureCode: null,
        failedAt: null,
        sentAt: "2026-11-02T04:00:01.000Z",
      }),
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Reset your password" })).toBeVisible();
    expect(screen.queryByRole("button", { name: words.resend.button })).toBeNull();
  });

  it("says when the email isn't kept any more, with the way back", async () => {
    open({ status: 404, reason: "EMAIL_NOT_FOUND" });
    expect(await screen.findByText(words.email.notFound)).toBeVisible();
    expect(screen.getAllByRole("link", { name: words.email.back })[0]).toHaveAttribute("href", "/console/emails");
  });

  it("tells support the page is a super admin's, and asks nothing", async () => {
    open({ data: stored() }, platformStaff("support"));
    expect(await screen.findByText(words.superAdminsOnly)).toBeVisible();
    expect(inputsTo("emails.get")).toEqual([]);
  });
});
