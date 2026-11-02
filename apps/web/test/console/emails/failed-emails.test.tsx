// The console's failed emails (the failed-emails spec): a super admin's alone, newest first and a page at a time, a
// table on a desktop and items on a phone, each email leading to its page, with who it was for, its kind, what
// happened and whether a resend got through. Loading, empty and failed states are honest; support is told the page
// is a super admin's, and nothing is asked of the api.
import type { FailedEmail } from "@travel-crm/contracts/platform";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FailedEmailsScreen } from "@/console/emails/failed-emails-screen";
import { messages } from "@/i18n/messages";
import { formatDay, formatTime } from "@/lib/format";
import { PLATFORM_TIME_ZONE } from "@/lib/platform-time-zone";
import { stubApi, type Answer } from "../../support/api-stub";
import { screenIs } from "../../organization/render";
import { platformStaff } from "../../support/platform-staff";
import { inputsTo, renderConsole } from "../../support/render-console";

const { emails: words } = messages.consolePlatform;

function email(overrides: Partial<FailedEmail> = {}): FailedEmail {
  return {
    id: "0199a000-0000-7000-8000-0000000000e1",
    createdAt: "2026-11-02T04:00:00.000Z",
    toAddress: "meera@sharma.example",
    toName: "Meera Iyer",
    subject: "Your account for Sharma Travels",
    purpose: "staff-invite",
    failureSource: "provider",
    failureCode: "blocked",
    failureReason: "Account under review",
    failedAt: "2026-11-02T04:30:00.000Z",
    resent: false,
    ...overrides,
  };
}

function open(failed: Answer, { wide = true, staff = platformStaff("super-admin") } = {}) {
  screenIs(wide ? "wide" : "narrow");
  const api = stubApi({ "platform.emails.failed": failed });
  renderConsole(<FailedEmailsScreen />, staff);
  return api;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FailedEmailsScreen", () => {
  it("shows each failed email's time, subject, person, kind and what happened, in a table", async () => {
    open({
      data: {
        emails: [
          email(),
          email({
            id: "0199a000-0000-7000-8000-0000000000e2",
            resent: true,
            failureSource: "smtp",
            failureCode: "EAUTH (SMTP 535)",
            failureReason: null,
            purpose: "password-reset",
            subject: "Reset your password",
          }),
        ],
        nextCursor: null,
      },
    });
    const link = await screen.findByRole("link", { name: "Your account for Sharma Travels" });
    expect(link).toHaveAttribute("href", "/console/emails/0199a000-0000-7000-8000-0000000000e1");
    const row = within(link.closest("tr") ?? document.body);
    const failedAt = new Date(email().failedAt);
    expect(
      row.getByText(
        `${formatDay(failedAt, { timeZone: PLATFORM_TIME_ZONE })}, ${formatTime(failedAt, { timeZone: PLATFORM_TIME_ZONE })}`,
      ),
    ).toBeVisible();
    expect(row.getByText("meera@sharma.example")).toBeVisible();
    expect(row.getByText(words.purposes["staff-invite"])).toBeVisible();
    expect(row.getByText(words.sources.provider, { exact: false })).toBeVisible();
    expect(row.getByText("blocked")).toBeVisible();
    expect(row.getByText("Account under review")).toBeVisible();
    expect(row.queryByText(words.resent)).toBeNull();

    const resent = within(screen.getByRole("link", { name: "Reset your password" }).closest("tr") ?? document.body);
    expect(resent.getByText(words.resent)).toBeVisible();
    expect(resent.getByText("EAUTH (SMTP 535)")).toBeVisible();
    expect(resent.getByText(words.purposes["password-reset"])).toBeVisible();
    expect(inputsTo("emails.failed")).toEqual([{ limit: 25 }]);
  });

  it("lists them as items on a phone, each leading to its page", async () => {
    open({ data: { emails: [email({ purpose: "a-new-kind" })], nextCursor: null } }, { wide: false });
    const link = await screen.findByRole("link", { name: /Your account for Sharma Travels/ });
    expect(link).toHaveAttribute("href", "/console/emails/0199a000-0000-7000-8000-0000000000e1");
    expect(within(link).getByText("meera@sharma.example")).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the next page after the last email of the one before", async () => {
    const api = open({ data: { emails: [email()], nextCursor: "0199a000-0000-7000-8000-0000000000e1" } });
    await screen.findByRole("link", { name: "Your account for Sharma Travels" });
    api.answer("platform.emails.failed", {
      data: { emails: [email({ id: "0199a000-0000-7000-8000-0000000000e0", subject: "Older" })], nextCursor: null },
    });
    await userEvent.click(screen.getByRole("button", { name: words.showMore }));
    expect(await screen.findByRole("link", { name: "Older" })).toBeVisible();
    expect(inputsTo("emails.failed")).toEqual([
      { limit: 25 },
      { limit: 25, cursor: "0199a000-0000-7000-8000-0000000000e1" },
    ]);
  });

  it("says when nothing failed", async () => {
    open({ data: { emails: [], nextCursor: null } });
    expect(await screen.findByText(words.empty)).toBeVisible();
  });

  it("says why the list didn't load, with a way to try again", async () => {
    open({ status: 403 });
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    expect(screen.getByRole("button", { name: messages.common.tryAgain })).toBeVisible();
  });

  it("tells support the page is a super admin's, and asks nothing", async () => {
    open({ data: { emails: [email()], nextCursor: null } }, { staff: platformStaff("support") });
    expect(await screen.findByText(words.superAdminsOnly)).toBeVisible();
    expect(inputsTo("emails.failed")).toEqual([]);
  });
});
